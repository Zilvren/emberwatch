import type { GameReadModel } from '../../core/GameReadModel';

export type RoutePointState = 'available' | 'visited' | 'locked' | 'excluded';
export interface RoutePointModel {
    id: string;
    kind: string;
    title: string;
    layer: number;
    x: number;
    y: number;
    state: RoutePointState;
    action: string;
    /** The node exists in the authored map, but future layers are covered by fog. */
    revealed: boolean;
}
export interface RouteEdgeModel {
    from: string;
    to: string;
    excluded: boolean;
    visited: boolean;
}
export interface RouteMapModel {
    points: RoutePointModel[];
    edges: RouteEdgeModel[];
    currentLayer: number;
    revealedThroughLayer: number;
    height: number;
    focusY: number;
}
const titles: Record<string, string> = {
    fixed: '废弃补给站',
    enemy1: '游荡感染者',
    scavenge: '旧街搜刮',
    rest: '临时营地',
    enemy2: '重度感染者',
    home: '避难所',
};

/** Project the complete authored map and mark future layers for the fog treatment. */
export function routeMapModel(game: GameReadModel): RouteMapModel {
    const routes = (
        Object.keys(game.scenario.routes) as Array<keyof typeof game.scenario.routes>
    ).map((route) => [route, game.scenario.routes[route]] as const);
    const shortest = Math.min(...routes.map(([, steps]) => steps.length));
    let common = 0;
    // Keep an explicit first choice even when both authored routes have identical content.
    while (
        common < Math.max(0, shortest - 1) &&
        routes.every(
            ([, steps]) =>
                steps[steps.length - 1 - common] === routes[0][1][routes[0][1].length - 1 - common]
        )
    )
        common++;
    const prefixes = routes.map(([route, steps]) => ({
        route,
        steps: steps.slice(0, steps.length - common),
    }));
    const depth = Math.max(0, ...prefixes.map((prefix) => prefix.steps.length));
    const suffix = routes[0][1].slice(routes[0][1].length - common);
    const layers = depth + suffix.length + 2;
    const height = Math.max(1100, layers * 230 + 160);
    const points: RoutePointModel[] = [],
        edges: RouteEdgeModel[] = [];
    const selectedPrefix = prefixes.find((prefix) => prefix.route === game.route);
    const add = (
        id: string,
        kind: string,
        layer: number,
        x: number,
        branch = '',
        step = -1,
        choice = false
    ): RoutePointModel => {
        const excluded = !!branch && !!game.route && game.route !== branch;
        const visited =
            kind === 'fixed'
                ? game.fixedDone
                : kind === 'home'
                  ? game.settlement !== null &&
                    (game.phase === 'shelter' || game.phase === 'journal')
                  : !excluded && !!game.route && step < game.pathIndex;
        const available =
            !excluded &&
            (kind === 'fixed'
                ? !game.fixedDone
                : kind !== 'home' &&
                  ((choice && game.currentNode === 'choice') ||
                      (!!game.route && step === game.pathIndex)));
        const point: RoutePointModel = {
            id,
            kind,
            title: titles[kind] ?? kind,
            layer,
            x,
            y: 0,
            state: excluded ? 'excluded' : visited ? 'visited' : available ? 'available' : 'locked',
            action:
                kind === 'home'
                    ? ''
                    : choice && game.currentNode === 'choice'
                      ? 'route-' + branch
                      : 'enter-' + kind,
            revealed: false,
        };
        points.push(point);
        return point;
    };
    const edge = (a: RoutePointModel, b: RoutePointModel): void => {
        edges.push({
            from: a.id,
            to: b.id,
            excluded: a.state === 'excluded' || b.state === 'excluded',
            visited: a.state === 'visited' && b.state === 'visited',
        });
    };
    const openingCount = game.scenario.openingNodeCount ?? 1;
    const starts = Array.from({ length: openingCount }, (_, index) =>
        add('fixed-' + index, 'fixed', 0, (index - (openingCount - 1) / 2) * 440)
    );
    const tails: RoutePointModel[] = [];
    prefixes.forEach(({ route, steps }, index) => {
        let previous: RoutePointModel | undefined;
        const x =
            (index - (routes.length - 1) / 2) * Math.min(440, 860 / Math.max(1, routes.length - 1));
        steps.forEach((kind, step) => {
            const point = add(
                route + '-' + step,
                kind,
                step + 1,
                x + Math.sin(step * 2 + index) * 18,
                route,
                step,
                step === 0
            );
            if (previous) edge(previous, point);
            else {
                // With two equivalent opening nodes, each side owns one branch lane.
                // A scenario with a different authored shape falls back to the old fan-out.
                const entries = starts.length === prefixes.length ? [starts[index]] : starts;
                entries.forEach((start) => edge(start, point));
            }
            previous = point;
        });
        if (previous) tails.push(previous);
    });
    let previous: RoutePointModel | undefined;
    suffix.forEach((kind, index) => {
        const point = add(
            'shared-' + index,
            kind,
            depth + 1 + index,
            Math.sin(index * 1.7) * 34,
            '',
            (selectedPrefix?.steps.length ?? depth) + index
        );
        if (previous) edge(previous, point);
        else (tails.length ? tails : starts).forEach((tail) => edge(tail, point));
        previous = point;
    });
    const home = add('home', 'home', layers - 1, 0);
    if (previous) edge(previous, home);
    else (tails.length ? tails : starts).forEach((tail) => edge(tail, home));

    const currentLayer = !game.fixedDone
        ? 0
        : !game.route
          ? 1
          : game.pathIndex >= game.scenario.routes[game.route].length
            ? home.layer
            : game.pathIndex < selectedPrefix!.steps.length
              ? game.pathIndex + 1
              : depth + 1 + game.pathIndex - selectedPrefix!.steps.length;
    const revealedThroughLayer = Math.min(home.layer, currentLayer + 1);
    for (const point of points) {
        point.y = -(height - 100 - point.layer * 230);
        point.revealed = point.layer <= revealedThroughLayer;
    }
    const focus =
        points.find((point) => point.state === 'available') ??
        [...points].reverse().find((point) => point.state === 'visited') ??
        points.find((point) => point.revealed) ??
        points[0];
    return {
        points,
        edges,
        currentLayer,
        revealedThroughLayer,
        height,
        focusY: focus?.y ?? -height / 2,
    };
}
