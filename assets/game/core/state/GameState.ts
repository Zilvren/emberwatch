import { CARD, CardDefinition } from '../content/CardCatalog';
import { getScenario, NodeKind, Route } from '../content/GameScenario';
import type { Battle, OwnedCard, Phase, Rewards, Settlement } from '../RulesTypes';
export interface GameState {
    scenarioId: string;
    scenarioVersion: number;
    seed: number;
    randomState: number;
    nextId: number;
    phase: Phase;
    day: number;
    supplies: number;
    armor: number;
    critical: boolean;
    cards: OwnedCard[];
    route: Route | null;
    fixedDone: boolean;
    pathIndex: number;
    visited: NodeKind[];
    battle: Battle | null;
    rewards: Rewards | null;
    settlement: Settlement | null;
    logs: string[];
    failureReason: string;
    revision: number;
    run: number;
    returnElapsed: number;
}
const phases = ['journal', 'map', 'battle', 'rewards', 'rest', 'shelter', 'day2', 'failure'];
const nodes = ['fixed', 'scavenge', 'enemy1', 'rest', 'enemy2'];
function requireValue(value: unknown, valid: boolean, name: string): void {
    if (!valid) throw new Error(`存档字段无效：${name}。原存档已保留。`);
}
function integer(value: unknown, min: number, max: number, name: string): void {
    requireValue(
        value,
        typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max,
        name
    );
}
function object(value: any, name: string): void {
    requireValue(value, !!value && typeof value === 'object' && !Array.isArray(value), name);
}
function flag(value: unknown, name: string): void {
    requireValue(value, typeof value === 'boolean', name);
}
function text(value: unknown, name: string, max = 5000): void {
    requireValue(value, typeof value === 'string' && value.length <= max, name);
}
function list(value: unknown, max: number, name: string): void {
    requireValue(value, Array.isArray(value) && value.length <= max, name);
}

/** Validate before touching a live model; never hydrate arbitrary object properties. */
export function validateGameState(
    raw: unknown,
    definitions: Readonly<Record<string, CardDefinition>> = CARD
): GameState {
    object(raw, 'state');
    const s = raw as GameState;
    text(s.scenarioId, 'scenarioId', 80);
    integer(s.scenarioVersion, 1, 100000, 'scenarioVersion');
    const scenario = getScenario(s.scenarioId, s.scenarioVersion);
    integer(s.seed, 0, 0xffffffff, 'seed');
    integer(s.randomState, 1, 0xffffffff, 'randomState');
    integer(s.nextId, 0, 1000000000, 'nextId');
    integer(s.revision, 0, 1000000000, 'revision');
    integer(s.run, 1, 1000000000, 'run');
    integer(s.day, 1, 100000, 'day');
    integer(s.supplies, 0, 30, 'supplies');
    integer(s.armor, 0, 10, 'armor');
    flag(s.critical, 'critical');
    flag(s.fixedDone, 'fixedDone');
    requireValue(s.phase, phases.indexOf(s.phase) >= 0, 'phase');
    requireValue(s.route, s.route === null || s.route === 'A' || s.route === 'B', 'route');
    integer(s.pathIndex, 0, s.route ? scenario.routes[s.route].length : 0, 'pathIndex');
    requireValue(
        s.returnElapsed,
        typeof s.returnElapsed === 'number' &&
            Number.isFinite(s.returnElapsed) &&
            s.returnElapsed >= 0 &&
            s.returnElapsed <= 60,
        'returnElapsed'
    );
    text(s.failureReason, 'failureReason');
    list(s.logs, 36, 'logs');
    s.logs.forEach((v) => text(v, 'log'));
    list(s.visited, 100, 'visited');
    s.visited.forEach((v) => requireValue(v, nodes.indexOf(v) >= 0, 'visited node'));
    list(s.cards, 100, 'cards');
    const owned = new Set<string>(),
        combat = new Set<string>();
    let highestId = 0;
    const identity = (card: any, collection: Set<string>, temporary: boolean) => {
        object(card, 'card');
        text(card.id, 'card id', 80);
        const match = /^(card|slash)-(\d+)$/.exec(card.id);
        requireValue(card.id, !!match && !collection.has(card.id), 'card id');
        if (match) highestId = Math.max(highestId, Number(match[2]));
        collection.add(card.id);
        requireValue(
            card.kind,
            typeof card.kind === 'string' &&
                Object.prototype.hasOwnProperty.call(definitions, card.kind),
            'card kind'
        );
        if (temporary) {
            flag(card.temporary, 'temporary');
            if (card.origin !== undefined)
                requireValue(card.origin, owned.has(card.origin), 'card origin');
        }
    };
    s.cards.forEach((card) => {
        identity(card, owned, false);
        flag(card.selected, 'selected');
        flag(card.found, 'found');
        requireValue(card.zone, card.zone === 'base' || card.zone === 'overflow', 'zone');
    });
    const baseWeight =
        s.supplies +
        s.cards
            .filter((c) => c.zone === 'base')
            .reduce((n, c) => n + definitions[c.kind].weight, 0);
    const overflowWeight = s.cards
        .filter((c) => c.zone === 'overflow')
        .reduce((n, c) => n + definitions[c.kind].weight, 0);
    requireValue(baseWeight, baseWeight <= 30 && overflowWeight <= 10, 'inventory weight');
    requireValue(s.battle, (s.phase === 'battle') === (s.battle !== null), 'battle phase');
    if (s.battle) {
        const b = s.battle;
        object(b, 'battle');
        requireValue(b.enemy, b.enemy === 'enemy1' || b.enemy === 'enemy2', 'enemy');
        integer(b.hp, 1, 100000, 'hp');
        integer(b.maxHp, b.hp, 100000, 'maxHp');
        integer(b.attack, 0, 100000, 'attack');
        integer(b.strongAttack, 0, 100000, 'strongAttack');
        integer(b.turn, 1, 1000000, 'turn');
        integer(b.block, 0, 100000, 'block');
        integer(b.equippedTurn, 0, b.turn, 'equippedTurn');
        flag(b.boosted, 'boosted');
        requireValue(b.intent, b.intent === 'attack' || b.intent === 'prepare', 'intent');
        for (const [name, cards] of [
            ['draw', b.draw],
            ['hand', b.hand],
            ['discard', b.discard],
        ] as const) {
            list(cards, name === 'hand' ? 6 : 10000, name);
            cards.forEach((card) => identity(card, combat, true));
        }
        if (b.weapon !== null) {
            identity(b.weapon, combat, true);
            requireValue(
                b.weapon.kind,
                definitions[b.weapon.kind].effect.type === 'equip',
                'weapon'
            );
        }
    }
    requireValue(s.rewards, (s.phase === 'rewards') === (s.rewards !== null), 'rewards phase');
    if (s.rewards) {
        const r = s.rewards;
        object(r, 'rewards');
        requireValue(r.source, nodes.indexOf(r.source) >= 0, 'reward source');
        integer(r.supplies, 0, 100000, 'reward supplies');
        flag(r.supplyTaken, 'supplyTaken');
        flag(r.cardTaken, 'cardTaken');
        list(r.cards, 3, 'reward cards');
        r.cards.forEach((kind) =>
            requireValue(
                kind,
                Object.prototype.hasOwnProperty.call(definitions, kind),
                'reward kind'
            )
        );
    }
    if (s.phase === 'shelter' || s.phase === 'day2')
        requireValue(s.settlement, s.settlement !== null, 'settlement phase');
    if (s.settlement !== null) {
        const t = s.settlement;
        object(t, 'settlement');
        for (const key of [
            'returnedSupplies',
            'returnedCards',
            'repairCost',
            'repairSpent',
            'dailySpent',
            'dailyShortfall',
        ] as const)
            integer(t[key], 0, 100000, key);
        flag(t.repaired, 'repaired');
        flag(t.wasCritical, 'wasCritical');
        list(t.lostOverflow, 100, 'lostOverflow');
        t.lostOverflow.forEach((v) => text(v, 'lost card'));
    }
    requireValue(s.nextId, s.nextId >= highestId, 'nextId');
    // An explicit field list prevents prototype keys and future fields from entering the model.
    const result: GameState = {
        scenarioId: s.scenarioId,
        scenarioVersion: s.scenarioVersion,
        seed: s.seed,
        randomState: s.randomState,
        nextId: s.nextId,
        phase: s.phase,
        day: s.day,
        supplies: s.supplies,
        armor: s.armor,
        critical: s.critical,
        cards: s.cards,
        route: s.route,
        fixedDone: s.fixedDone,
        pathIndex: s.pathIndex,
        visited: s.visited,
        battle: s.battle,
        rewards: s.rewards,
        settlement: s.settlement,
        logs: s.logs,
        failureReason: s.failureReason,
        revision: s.revision,
        run: s.run,
        returnElapsed: s.returnElapsed,
    };
    return JSON.parse(JSON.stringify(result));
}
