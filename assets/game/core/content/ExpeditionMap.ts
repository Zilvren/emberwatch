import { Random } from '../Random';
import type { NodeDefinition, NodeKind } from './GameScenario';
import type { Rewards } from '../RulesTypes';

export interface ExpeditionMapPoint {
    readonly id: NodeKind;
    readonly layer: number;
    readonly lane: number;
    readonly next: readonly NodeKind[];
    /** A map coordinate may use the same authored room as another coordinate. */
    readonly room?: NodeKind;
}

export interface ExpeditionMap {
    readonly seed: number;
    readonly points: readonly ExpeditionMapPoint[];
    /** Existing maps keep the room rewards they were generated with. */
    readonly version?: 2;
    activeNode: NodeKind | null;
    deferredRewards?: Rewards;
}

export function nextMapNodes(map: Pick<ExpeditionMap, 'points'>, from?: NodeKind): readonly NodeKind[] {
    return from === undefined ? [map.points[0].id] : map.points.find((p) => p.id === from)?.next ?? [];
}

export const ASHEN_MAP_LAST_LAYER = 16;
export const ASHEN_MAP_OUTER_LANE = 2;
export const ASHEN_SALVAGE_ROOM = 'labyrinthSalvage';
export const ASHEN_ROOM_TARGETS = { rest: 3, elite: 3, salvage: 10 } as const;

export function pointRoomId(point: ExpeditionMapPoint): NodeKind {
    return point.room ?? point.id;
}

export function expeditionRoomId(map: Pick<ExpeditionMap, 'points'> | null, id: NodeKind): NodeKind {
    const point = map?.points.find((value) => value.id === id);
    return point ? pointRoomId(point) : id;
}

interface MapCell {
    layer: number;
    lane: number;
    next: MapCell[];
}

type SpecialRoom = keyof typeof ASHEN_ROOM_TARGETS;
type RoomPlacement = { room: NodeKind; type: SpecialRoom | 'battle' };

function cell(layer: number, lane: number, ...next: MapCell[]): MapCell {
    return { layer, lane, next };
}

function drawWalks(random: Random, start: number, exit: MapCell): MapCell[][] | null {
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
        if (!current.next.length) current.next.push(exit);
    }
    return rows;
}

function branchingSection(random: Random, start: number, exit: MapCell): MapCell[][] {
    for (let attempt = 0; attempt < 32; attempt++) {
        const rows = drawWalks(random, start, exit);
        if (rows && rows.every((row) => row.length >= 2) &&
            rows.some((row) => row.some((point) => point.next.length > 1))) return rows;
    }
    const left = cell(start + 3, -1, exit), right = cell(start + 3, 1, exit);
    const middle = cell(start + 2, 0, left, right), side = cell(start + 2, 1, right);
    return [[cell(start + 1, -1, middle), cell(start + 1, 1, side)], [middle, side], [left, right]];
}

function placeSpecialRooms(
    cells: readonly MapCell[],
    fixed: ReadonlyMap<MapCell, RoomPlacement>,
    random: Random
): Map<MapCell, RoomPlacement> {
    const parents = new Map<MapCell, MapCell[]>(cells.map((point) => [point, []]));
    for (const point of cells) for (const next of point.next) parents.get(next)!.push(point);
    const options = cells.filter((point) => !fixed.has(point));
    const special: Record<SpecialRoom, RoomPlacement> = {
        rest: { type: 'rest', room: 'warmAlcove' },
        elite: { type: 'elite', room: 'sealedGuard' },
        salvage: { type: 'salvage', room: ASHEN_SALVAGE_ROOM },
    };
    const types = Object.keys(ASHEN_ROOM_TARGETS) as SpecialRoom[];
    const target = types.reduce((sum, type) => sum + ASHEN_ROOM_TARGETS[type], fixed.size);
    let best = new Map(fixed);
    // Restart the placement pass when earlier choices make a target impossible.
    for (let attempt = 0; attempt < 32; attempt++) {
        const rooms = new Map(fixed);
        for (const type of types) {
            let remaining = ASHEN_ROOM_TARGETS[type];
            for (const point of random.shuffle(options)) {
                if (!remaining) break;
                if (rooms.has(point) || (type === 'rest' && (point.layer < 3 || point.layer > 13)) ||
                    (type === 'elite' && point.layer < 5)) continue;
                const incoming = parents.get(point)!;
                if (incoming.some((parent) => parent.next.some((sibling) => rooms.get(sibling)?.type === type))) continue;
                if (type !== 'salvage' &&
                    [...incoming, ...point.next].some((neighbor) => rooms.get(neighbor)?.type === type)) continue;
                rooms.set(point, special[type]);
                remaining--;
            }
        }
        if (rooms.size === target) return rooms;
        if (rooms.size > best.size) best = rooms;
    }
    return best;
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
    const cells = [entrance];
    const fixed = new Map<MapCell, RoomPlacement>([[entrance, { type: 'salvage', room: 'threshold' }]]);
    const ids = new Map<MapCell, NodeKind>([[entrance, 'threshold']]);
    let start = entrance;
    for (const endLayer of [5, 10, 15]) {
        const end = cell(endLayer, 0);
        const exit = cell(endLayer - 1, 0, end);
        const rows = branchingSection(random, start.layer, exit);
        start.next = rows[0];
        for (const row of rows) cells.push(...row);
        cells.push(exit, end);
        if (start === entrance) {
            for (const point of rows[0]) fixed.set(point, { type: 'battle', room: 'lampPassage' });
            ids.set(rows[0][0], 'lampPassage');
        }
        if (endLayer >= 10) {
            const room = endLayer === 10 ? 'leeAlcove' : 'innerAlcove';
            fixed.set(end, { type: 'rest', room });
            ids.set(end, room);
        }
        start = end;
    }
    const boss = cell(ASHEN_MAP_LAST_LAYER, 0);
    start.next.push(boss);
    cells.push(boss);
    fixed.set(boss, { type: 'elite', room: 'lampCourt' });
    ids.set(boss, 'lampCourt');
    for (const point of cells)
        if (!ids.has(point)) ids.set(point, `room-${point.layer + 1}-${point.lane + ASHEN_MAP_OUTER_LANE + 1}`);

    const rooms = placeSpecialRooms(cells, fixed, random);
    const earlyFights = ['lightCut', 'shutterGap', 'windPerch'].filter(id => definitions[id]?.type === 'battle');
    const fights = [...earlyFights, 'hoistBridge', 'returnBridge', 'quarryHall', 'hornCourt', 'floodedVault', 'galeRoost', 'ebbWell', 'clashingPass']
        .filter(id => definitions[id]?.type === 'battle');
    const points: ExpeditionMapPoint[] = cells.map((point) => {
        const id = ids.get(point)!;
        const position = { id, layer: point.layer, lane: point.lane, next: point.next.map((next) => ids.get(next)!) };
        const placement = rooms.get(point);
        const candidates = point.layer < 5 ? earlyFights : fights;
        const room = placement?.room ?? candidates[random.int(0, candidates.length - 1)];
        return room === id ? position : { ...position, room };
    });
    return { seed, points, activeNode: null, version: 2 };
}
