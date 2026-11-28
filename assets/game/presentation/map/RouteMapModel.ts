import type { GameReadModel } from '../../core/GameReadModel';
import type { NodeKind, MapIcon } from '../../core/content/GameScenario';
import { nextMapNodes, pointRoomId } from '../../core/content/ExpeditionMap';

type ExpeditionMapView = NonNullable<GameReadModel['expeditionMap']>;

export type RoutePointState = 'available' | 'current' | 'visited' | 'locked' | 'excluded';
export interface RoutePointModel {
    id: string;
    kind: string;
    icon: MapIcon | 'home';
    title: string;
    layer: number;
    x: number;
    y: number;
    state: RoutePointState;
    action: string;
    decisionHint?: string;
    resumeRewards?: boolean;
    fieldSymbol?: 'buoy' | 'rotor';
}
export interface RouteEdgeModel {
    from: string;
    to: string;
    excluded: boolean;
    visited: boolean;
    available?: boolean;
}
export interface RouteMapModel {
    points: RoutePointModel[];
    edges: RouteEdgeModel[];
    height: number;
    focusY: number;
}

function hearthBattleHints(game: GameReadModel, map: ExpeditionMapView, from?: NodeKind): Map<NodeKind, string> {
    const hints = new Map<NodeKind, string>();
    if (!from || map.version === 2) return hints;
    const rooms = new Map(map.points.map(point => [point.id, point]));
    const here = rooms.get(from), hearth = rooms.get('warmAlcove'), nextRest = rooms.get('leeAlcove');
    if (!here || !hearth || !nextRest || here.layer < hearth.layer || here.layer >= nextRest.layer ||
        here.next.length < 2) return hints;
    const stopId = nextRest.id, stopLayer = nextRest.layer;

    // Count only public battle rooms on each actual route up to the next rest, including saved routes.
    function collectBattles(id: NodeKind, battles: number[], outcomes: number[][]): void {
        const point = rooms.get(id)!;
        if (id === stopId) {
            outcomes.push(battles);
            return;
        }
        if (point.layer >= stopLayer || !point.next.length) {
            outcomes.push([]); // A route that bypasses the rest cannot promise this forecast.
            return;
        }
        const floors = game.scenario.nodes[pointRoomId(point)].type === 'battle'
            ? [...battles, point.layer + 1] : battles;
        for (const exit of point.next) collectBattles(exit, floors, outcomes);
    }
    for (const id of here.next) {
        const outcomes: number[][] = [];
        collectBattles(id, [], outcomes);
        const first = outcomes[0];
        if (!first?.length) continue;
        const last = first[first.length - 1];
        if (!outcomes.every(floors => floors[floors.length - 1] === last &&
            (floors.length === 1 || (floors.length === 2 && floors[0] === last - 1)))) continue;
        const pairs = outcomes.filter(floors => floors.length === 2).length;
        const hint = pairs === 0 ? `第 ${last} 层遇战` :
            `第 ${last - 1}、${last} 层${pairs === outcomes.length ? '连战' : '可能连战'}`;
        hints.set(id, hint);
    }
    return hints;
}

export function routeMapModel(game: GameReadModel): RouteMapModel {
    if (game.expeditionMap) return expeditionMapModel(game, game.expeditionMap);

    const routes = (
        Object.keys(game.scenario.routes) as Array<keyof typeof game.scenario.routes>
    ).map((route) => [route, game.scenario.routes[route]] as const);
    const shortest = Math.min(...routes.map(([, steps]) => steps.length));
    let common = 0;
    while (
        common < shortest - 1 &&
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
    const layers = depth + suffix.length + 2;
    const height = Math.max(1100, layers * 230 + 160);
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
        const title = kind === 'home' ? '避难所' : (game.scenario.nodes[kind]?.title ?? kind);
        const icon = kind === 'home' ? ('home' as const) : game.scenario.nodes[kind].icon;
        const point = {
            id,
            kind,
            title,
            icon,
            layer,
            x,
            y: -(height - 120 - layer * 230),
            state,
            fieldSymbol: game.scenario.fieldDeck && !game.scenario.labyrinth
                ? game.scenario.nodes[kind]?.icon === 'battle'
                    ? ('buoy' as const)
                    : game.scenario.nodes[kind]?.icon === 'elite'
                      ? ('rotor' as const)
                      : undefined
                : undefined,
            decisionHint:
                game.scenario.fieldDeck && choice && game.currentNode === 'choice'
                    ? game.scenario.routeDescriptions?.[branch]
                    : undefined,
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
    const start = add(game.scenario.fixedNodeId, game.scenario.fixedNodeId, 0, 0);
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

function expeditionMapModel(game: GameReadModel, map: ExpeditionMapView): RouteMapModel {
    const last = game.visited[game.visited.length - 1];
    const available = game.phase === 'map' ? nextMapNodes(map, last) : [];
    const resumeRewards = map.deferredRewards?.source;
    const current = map.activeNode ?? (game.phase === 'map' && (available.length || resumeRewards) ? last : undefined);
    const hints = hearthBattleHints(game, map, current);
    const visited = new Set(game.visited);
    const remaining = new Set(map.activeNode === null ? nextMapNodes(map, last) : [map.activeNode]);
    const path = map.activeNode === null ? game.visited : [...game.visited, map.activeNode];
    const ordered = [...map.points].sort((a, b) => a.layer - b.layer || a.lane - b.lane);
    const top = ordered[ordered.length - 1].layer;
    const topMargin = 88;
    const rowHeight = 172;
    const bottomMargin = 112;
    const height = topMargin + top * rowHeight + bottomMargin;
    for (const point of ordered)
        if (remaining.has(point.id)) for (const next of point.next) remaining.add(next);

    const points: RoutePointModel[] = ordered.map((point) => {
        const { id, layer, lane } = point;
        const room = pointRoomId(point);
        const site = game.scenario.nodes[room];
        let state: RoutePointState = 'excluded';
        if (id === current) state = 'current';
        else if (visited.has(id)) state = 'visited';
        else if (available.indexOf(id) >= 0) state = 'available';
        else if (remaining.has(id)) state = 'locked';
        return {
            id, kind: room, title: site.title, icon: site.icon, layer,
            x: lane * 196 + (layer > 0 && layer < top ? Math.sin(layer * 5 + lane) * 9 : 0),
            y: -(topMargin + (top - layer) * rowHeight),
            state, action: 'enter-' + id, decisionHint: hints.get(id),
            ...(id === resumeRewards ? { resumeRewards: true } : {}),
        };
    });
    const edges: RouteEdgeModel[] = [];
    for (const point of map.points) {
        const step = path.indexOf(point.id);
        for (const next of point.next) {
            const visited = step >= 0 && path[step + 1] === next;
            const availableEdge = point.id === last && available.indexOf(next) >= 0;
            edges.push({
                from: point.id, to: next, visited, available: availableEdge,
                excluded: !visited && !availableEdge && !(remaining.has(point.id) && remaining.has(next)),
            });
        }
    }
    const focus = points.filter((point) => point.state === 'available' || point.state === 'current');
    const focusY = focus.length > 0
        ? (focus[0].y + focus[focus.length - 1].y) * 0.5
        : points.find((point) => point.id === last)?.y ?? points[0].y;
    return { points, edges, height, focusY };
}
