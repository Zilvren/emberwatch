import type { GameReadModel } from '../../core/GameReadModel';
import type { NodeKind } from '../../core/content/GameScenario';

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

/** Adapt authored scenario routes; drawing components do not know the tutorial topology. */
export function routeMapModel(game: GameReadModel): RouteMapModel {
    const routes = (
        Object.keys(game.scenario.routes) as Array<keyof typeof game.scenario.routes>
    ).map((route) => [route, game.scenario.routes[route]] as const);
    const shortest = Math.min(...routes.map(([, steps]) => steps.length));
    let common = 0;
    while (
        common < shortest &&
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
    const depth = Math.max(1, ...prefixes.map((p) => p.steps.length));
    const suffix = routes[0][1].slice(routes[0][1].length - common);
    const layers = depth + suffix.length + 2,
        height = Math.max(1100, layers * 230 + 160);
    const points: RoutePointModel[] = [],
        edges: RouteEdgeModel[] = [];
    const add = (
        id: string,
        kind: string,
        layer: number,
        x: number,
        branch = '',
        choice = false
    ) => {
        const excluded = !!branch && !!game.route && game.route !== branch;
        const visited =
            kind === 'home'
                ? game.settlement !== null && (game.phase === 'shelter' || game.phase === 'journal')
                : game.visited.indexOf(kind as NodeKind) >= 0 && (!branch || game.route === branch);
        const available =
            !excluded &&
            ((choice && game.currentNode === 'choice') ||
                (game.currentNode === kind && (!branch || game.route === branch)));
        const state: RoutePointState = excluded
            ? 'excluded'
            : visited
              ? 'visited'
              : available
                ? 'available'
                : 'locked';
        const point = {
            id,
            kind,
            title: titles[kind] ?? kind,
            layer,
            x,
            y: -(height - 100 - layer * 230),
            state,
            action:
                kind === 'home'
                    ? ''
                    : choice && game.currentNode === 'choice'
                      ? 'route-' + branch
                      : 'enter-' + kind,
        };
        points.push(point);
        return point;
    };
    const edge = (a: RoutePointModel, b: RoutePointModel) =>
        edges.push({
            from: a.id,
            to: b.id,
            excluded: a.state === 'excluded' || b.state === 'excluded',
            visited: a.state === 'visited' && b.state === 'visited',
        });
    const start = add('fixed', 'fixed', 0, 0);
    const tails: RoutePointModel[] = [];
    prefixes.forEach(({ route, steps }, index) => {
        let previous = start;
        const x =
            (index - (routes.length - 1) / 2) * Math.min(440, 860 / Math.max(1, routes.length - 1));
        steps.forEach((kind, step) => {
            const point = add(
                route + '-' + step,
                kind,
                step + 1,
                x + Math.sin(step * 2 + index) * 18,
                route,
                step === 0
            );
            edge(previous, point);
            previous = point;
        });
        tails.push(previous);
    });
    let previous: RoutePointModel | undefined;
    suffix.forEach((kind, index) => {
        const point = add('shared-' + index, kind, depth + 1 + index, Math.sin(index * 1.7) * 34);
        if (previous) edge(previous, point);
        else tails.forEach((tail) => edge(tail, point));
        previous = point;
    });
    const home = add('home', 'home', layers - 1, 0);
    if (previous) edge(previous, home);
    else tails.forEach((tail) => edge(tail, home));
    const focus =
        points.find((point) => point.state === 'available') ??
        [...points].reverse().find((point) => point.state === 'visited') ??
        start;
    return { points, edges, height, focusY: focus.y };
}
