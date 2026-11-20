import { CARD, CardDefinition, isBattleCard } from '../content/CardCatalog';
import { getScenario, hasId, NodeKind, Route, STAMINA_SCENARIO } from '../content/GameScenario';
import { EntryTierId, entryTier } from '../content/EntryTiers';
import { isPhase } from './GamePhase';
import {
    getJournalCatalog,
    JournalCatalog,
    JournalRecord,
    mapClearMilestone,
    validMilestoneId,
} from '../content/JournalCatalog';
import type { Battle, OwnedCard, Phase, Rewards, Settlement } from '../RulesTypes';
export interface GameState {
    schemaVersion: 2;
    scenarioId: string;
    scenarioVersion: number;
    seed: number;
    randomState: number;
    nextId: number;
    phase: Phase;
    day: number;
    milestones: Record<string, number>;
    journalEntries: JournalRecord[];
    supplies: number;
    entryTier: EntryTierId | null;
    armor: number;
    critical: boolean;
    cards: OwnedCard[];
    storedSupplies?: Record<string, number>;
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
    definitions: Readonly<Record<string, CardDefinition>> = CARD,
    journals: JournalCatalog = getJournalCatalog()
): GameState {
    object(raw, 'state');
    const s = raw as GameState;
    integer(s.schemaVersion, 2, 2, 'schemaVersion');
    text(s.scenarioId, 'scenarioId', 80);
    integer(s.scenarioVersion, 1, 100000, 'scenarioVersion');
    const scenario = getScenario(s.scenarioId, s.scenarioVersion);
    integer(s.seed, 0, 0xffffffff, 'seed');
    integer(s.randomState, 1, 0xffffffff, 'randomState');
    integer(s.nextId, 0, 1000000000, 'nextId');
    integer(s.revision, 0, 1000000000, 'revision');
    integer(s.run, 1, 1000000000, 'run');
    integer(s.day, 1, 100000, 'day');
    object(s.milestones, 'milestones');
    requireValue(s.milestones, Object.keys(s.milestones).length <= 1000, 'milestones');
    for (const id of Object.keys(s.milestones)) {
        requireValue(id, validMilestoneId(id), 'milestone id');
        integer(s.milestones[id], 1, 1000000000, 'milestone count');
    }
    list(s.journalEntries, 500, 'journalEntries');
    const recorded = new Set<string>();
    for (const entry of s.journalEntries) {
        object(entry, 'journal entry');
        requireValue(
            entry.id,
            !recorded.has(entry.id) &&
                journals.entries.some((definition) => definition.id === entry.id),
            'journal id'
        );
        recorded.add(entry.id);
        integer(entry.day, 1, s.day, 'journal day');
        flag(entry.read, 'journal read');
    }
    requireValue(
        s.phase,
        (s.phase === 'journal') === s.journalEntries.some((entry) => !entry.read),
        'journal phase'
    );
    integer(s.supplies, 0, scenario.suppliesHaveWeight === false ? 1000000000 : 30, 'supplies');
    const savedTier = s.entryTier ?? null;
    if (scenario.battleResource === 'stamina') {
        requireValue(savedTier, savedTier === null || !!entryTier(savedTier), 'entry tier');
        if (['map', 'battle', 'rewards', 'rest'].indexOf(s.phase) >= 0)
            requireValue(savedTier, !!entryTier(savedTier), 'entry tier for active expedition');
    } else requireValue(savedTier, savedTier === null, 'legacy entry tier');
    integer(s.armor, 0, 10, 'armor');
    flag(s.critical, 'critical');
    flag(s.fixedDone, 'fixedDone');
    requireValue(s.phase, isPhase(s.phase), 'phase');
    requireValue(s.route, s.route === null || hasId(scenario.routes, s.route), 'route');
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
    s.visited.forEach((v) => requireValue(v, hasId(scenario.nodes, v), 'visited node'));
    list(s.cards, scenario.runDeck ? Number.MAX_SAFE_INTEGER : 100, 'cards');
    if (s.storedSupplies !== undefined) {
        object(s.storedSupplies, 'stored supplies');
        for (const kind of Object.keys(s.storedSupplies)) {
            requireValue(kind, definitions[kind]?.role === 'supply', 'stored supply kind');
            integer(s.storedSupplies[kind], 1, Number.MAX_SAFE_INTEGER, 'stored supply count');
        }
    }
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
        if (scenario.runDeck) {
            const definition = definitions[card.kind];
            requireValue(
                card,
                definition.role === 'supply'
                    ? !card.selected
                    : isBattleCard(definition) && card.zone === 'base' && card.selected,
                'run deck or carry item'
            );
        }
    });
    if (scenario.runDeck && (s.settlement || s.phase === 'shelter' || s.phase === 'failure'))
        requireValue(s.cards, s.cards.length === 0, 'closed run cards');
    const baseWeight =
        (scenario.suppliesHaveWeight === false ? 0 : s.supplies) +
        s.cards
            .filter(
                (c) =>
                    c.zone === 'base' &&
                    (!scenario.runDeck || definitions[c.kind].role === 'supply')
            )
            .reduce((n, c) => n + definitions[c.kind].weight, 0);
    const overflowWeight = s.cards
        .filter((c) => c.zone === 'overflow')
        .reduce((n, c) => n + definitions[c.kind].weight, 0);
    requireValue(baseWeight, baseWeight <= 30 && overflowWeight <= 10, 'inventory weight');
    requireValue(s.battle, (s.phase === 'battle') === (s.battle !== null), 'battle phase');
    if (s.battle) {
        const b = s.battle;
        object(b, 'battle');
        requireValue(b.enemy, hasId(scenario.enemies, b.enemy), 'enemy');
        integer(b.hp, 1, 100000, 'hp');
        integer(b.maxHp, b.hp, 100000, 'maxHp');
        integer(b.attack, 0, 100000, 'attack');
        integer(b.strongAttack, 0, 100000, 'strongAttack');
        integer(b.turn, 1, 1000000, 'turn');
        integer(b.block, 0, 100000, 'block');
        integer(b.equippedTurn, 0, b.turn, 'equippedTurn');
        if (scenario.battleResource === 'stamina') {
            const budget = entryTier(savedTier)!.stamina;
            integer(b.maxStamina, budget, budget, 'maxStamina');
            integer(b.stamina, 0, budget, 'stamina');
        } else {
            integer(b.maxStamina ?? 0, 0, 0, 'legacy maxStamina');
            integer(b.stamina ?? 0, 0, 0, 'legacy stamina');
        }
        flag(b.boosted, 'boosted');
        requireValue(b.intent, b.intent === 'attack' || b.intent === 'prepare', 'intent');
        for (const [name, cards] of [
            ['draw', b.draw],
            ['hand', b.hand],
            ['discard', b.discard],
        ] as const) {
            list(
                cards,
                name === 'hand' ? 6 : scenario.runDeck ? Number.MAX_SAFE_INTEGER : 10000,
                name
            );
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
        requireValue(r.source, hasId(scenario.nodes, r.source), 'reward source');
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
    if (s.settlement !== null) {
        const t = s.settlement;
        object(t, 'settlement');
        for (const key of [
            'returnedSupplies',
            'returnedCards',
            'repairCost',
            'repairSpent',
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
        schemaVersion: 2,
        scenarioId: s.scenarioId,
        scenarioVersion: s.scenarioVersion,
        seed: s.seed,
        randomState: s.randomState,
        nextId: s.nextId,
        phase: s.phase,
        day: s.day,
        milestones: { ...s.milestones },
        journalEntries: s.journalEntries.map(({ id, day, read }) => ({ id, day, read })),
        supplies: s.supplies,
        entryTier: savedTier,
        armor: s.armor,
        critical: s.critical,
        cards: s.cards,
        storedSupplies: s.storedSupplies,
        route: s.route,
        fixedDone: s.fixedDone,
        pathIndex: s.pathIndex,
        visited: s.visited,
        battle: s.battle
            ? { ...s.battle, stamina: s.battle.stamina ?? 0, maxStamina: s.battle.maxStamina ?? 0 }
            : null,
        rewards: s.rewards,
        settlement: s.settlement
            ? {
                  returnedSupplies: s.settlement.returnedSupplies,
                  returnedCards: s.settlement.returnedCards,
                  lostOverflow: s.settlement.lostOverflow,
                  wasCritical: s.settlement.wasCritical,
                  repairCost: s.settlement.repairCost,
                  repaired: s.settlement.repaired,
                  repairSpent: s.settlement.repairSpent,
              }
            : null,
        logs: s.logs,
        failureReason: s.failureReason,
        revision: s.revision,
        run: s.run,
        returnElapsed: s.returnElapsed,
    };
    return JSON.parse(JSON.stringify(result));
}

/** Upgrade the old terminal teaching loop without replaying paid costs or deleting progress. */
export function migrateLegacyGameState(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const s = JSON.parse(JSON.stringify(raw));
    if (
        s.schemaVersion !== undefined ||
        s.milestones !== undefined ||
        s.journalEntries !== undefined
    )
        return s;
    const scenario = getScenario(s.scenarioId, s.scenarioVersion);
    s.schemaVersion = 2;
    s.milestones = { 'campaign-started': 1 };
    s.journalEntries = [{ id: 'departure', day: scenario.initialDay, read: s.phase !== 'journal' }];
    if (s.phase === 'shelter' || s.phase === 'day2') {
        const wasTerminal = s.phase === 'day2';
        if (!wasTerminal) s.day++;
        s.milestones[mapClearMilestone(scenario.id)] = 1;
        const id = scenario.kind === 'tutorial' ? 'tutorial-cleared' : 'street-cleared';
        s.journalEntries.push({ id, day: s.day, read: wasTerminal });
        s.phase = wasTerminal ? 'shelter' : 'journal';
        if (wasTerminal && scenario.kind === 'tutorial') {
            s.scenarioId = STAMINA_SCENARIO.id;
            s.scenarioVersion = STAMINA_SCENARIO.version;
            s.entryTier = null;
        }
    } else if (s.phase === 'failure' && scenario.kind === 'expedition') s.day++;
    return s;
}
