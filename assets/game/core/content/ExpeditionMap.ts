import { Random } from '../Random';
import type { NodeDefinition, NodeKind } from './GameScenario';

export interface ExpeditionMapPoint {
    readonly id: NodeKind;
    readonly layer: number;
    readonly lane: number;
    readonly next: readonly NodeKind[];
}

export interface ExpeditionMap {
    readonly seed: number;
    readonly points: readonly ExpeditionMapPoint[];
    activeNode: NodeKind | null;
}

export function nextMapNodes(map: Pick<ExpeditionMap, 'points'>, from?: NodeKind): readonly NodeKind[] {
    return from === undefined ? [map.points[0].id] : map.points.find((p) => p.id === from)?.next ?? [];
}

export const ASHEN_MAP_LAST_LAYER = 16;
export const ASHEN_MAP_OUTER_LANE = 2;

interface MapCell {
    layer: number;
    lane: number;
    next: MapCell[];
}

interface SectionSites {
    battle: NodeKind;
    rest: NodeKind;
    optionalBattle?: NodeKind;
    separateBattleRoutes?: boolean;
}
const SECTIONS: readonly SectionSites[] = [
    { battle: 'lightCut', rest: 'warmAlcove' },
    { battle: 'hoistBridge', rest: 'leeAlcove', optionalBattle: 'ashGallery', separateBattleRoutes: true },
    { battle: 'shutterGap', rest: 'innerAlcove', optionalBattle: 'returnBridge' },
];

function cell(layer: number, lane: number, ...next: MapCell[]): MapCell {
    return { layer, lane, next };
}

function drawWalks(random: Random, start: number, battle: MapCell): MapCell[][] | null {
    const entrances = random
        .shuffle([-1, 0, 1])
        .slice(0, random.int(2, 3))
        .map((lane) => cell(start + 1, lane));
    const rows = [entrances, [], []];
    for (let walk = 0; walk < 6; walk++) {
        let current = entrances[walk % entrances.length];
        for (let depth = 1; depth < rows.length; depth++) {
            const row = rows[depth];
            const lane = random.shuffle([-1, 0, 1]).map((step) => current.lane + step).find((target) => {
                if (Math.abs(target) > ASHEN_MAP_OUTER_LANE) return false;
                if (row.length === 3 && !row.some((point) => point.lane === target)) return false;
                return !rows[depth - 1].some((point) =>
                    point.next.some((next) => (point.lane - current.lane) * (next.lane - target) < 0)
                );
            });
            if (lane === undefined) return null;
            let next = row.find((point) => point.lane === lane);
            if (!next) {
                next = cell(start + depth + 1, lane);
                row.push(next);
            }
            if (current.next.indexOf(next) < 0) current.next.push(next);
            current = next;
        }
        if (!current.next.length) current.next.push(battle);
    }
    return rows;
}

interface SectionLayout {
    rows: MapCell[][];
    battleCandidates: MapCell[];
}

function branchingSection(random: Random, start: number, battle: MapCell, separateBattleRoutes = false): SectionLayout {
    for (let attempt = 0; attempt < 32; attempt++) {
        const rows = drawWalks(random, start, battle);
        if (!rows || rows.some(row => row.length < 2) ||
            !rows.some(row => row.some(point => point.next.length > 1))) continue;
        const [entries, , exits] = rows;
        // One hearth exit must commit to the extra battle and another must bypass it entirely.
        const battleCandidates = separateBattleRoutes ? exits.filter(room =>
            entries.some(entry => entry.next.every(point => point.next.every(exit => exit === room))) &&
            entries.some(entry => entry.next.every(point => point.next.indexOf(room) < 0))
        ) : exits;
        if (battleCandidates.length) return { rows, battleCandidates };
    }
    const left = cell(start + 3, -1, battle), right = cell(start + 3, 1, battle);
    const middle = cell(start + 2, 0, left, right), side = cell(start + 2, 1, right);
    const rows = [[cell(start + 1, separateBattleRoutes ? 0 : -1, middle), cell(start + 1, 1, side)], [middle, side], [left, right]];
    if (separateBattleRoutes) {
        const farSide = cell(start + 2, -1, left);
        rows[0].unshift(cell(start + 1, -1, farSide));
        rows[1].unshift(farSide);
    }
    return { rows, battleCandidates: [left, right] };
}

/** Formal explorations advance exactly one day, so each departure has its own map seed. */
export function generateAshenLabyrinthMap(
    campaignSeed: number,
    day: number,
    definitions: Readonly<Record<NodeKind, NodeDefinition>>
): ExpeditionMap {
    const seed = (campaignSeed ^ Math.imul(day, 0x9e3779b9)) >>> 0;
    const random = new Random(seed);
    const entrance = cell(0, 0);
    const sites = new Map<MapCell, NodeKind>([[entrance, 'threshold']]);
    const cells = [entrance];
    const discoveryCells: MapCell[] = [];
    let start = entrance;
    for (const section of SECTIONS) {
        const rest = cell(start.layer + 5, 0);
        const battle = cell(start.layer + 4, 0, rest);
        const { rows, battleCandidates } = branchingSection(random, start.layer, battle, section.separateBattleRoutes);
        const [entries, discoveries, outerRooms] = rows;
        start.next = entries;
        cells.push(...entries, ...discoveries, ...outerRooms, battle, rest);
        discoveryCells.push(...discoveries);
        sites.set(battle, section.battle);
        sites.set(rest, section.rest);
        if (start === entrance) {
            const [combat, supplies, cache] = random.shuffle(entries);
            sites.set(combat, 'lampPassage');
            sites.set(supplies, 'serviceDuct');
            if (cache) sites.set(cache, 'edgeCache');
        }
        if (section.optionalBattle)
            sites.set(battleCandidates[random.int(0, battleCandidates.length - 1)], section.optionalBattle);
        start = rest;
    }
    const boss = cell(ASHEN_MAP_LAST_LAYER, 0);
    start.next.push(boss);
    cells.push(boss);
    sites.set(boss, 'lampCourt');

    const used = new Set(sites.values());
    const discoverySites: NodeKind[] = [];
    const supplySites: NodeKind[] = [];
    for (const id of random.shuffle(Object.keys(definitions))) {
        const site = definitions[id];
        if (site.type !== 'scavenge' || used.has(id)) continue;
        (site.discover ? discoverySites : supplySites).push(id);
    }
    // Every route has a discovery room and a battle in each section.
    for (const point of discoveryCells) sites.set(point, discoverySites.pop()!);
    for (const point of cells) {
        if (sites.has(point)) continue;
        const pool = supplySites.length && (!discoverySites.length || random.int(0, 1) === 0)
            ? supplySites
            : discoverySites;
        sites.set(point, pool.pop()!);
    }

    const points = cells.map((point) => ({
        id: sites.get(point)!, layer: point.layer, lane: point.lane,
        next: point.next.map((next) => sites.get(next)!),
    }));
    return { seed, points, activeNode: null };
}
