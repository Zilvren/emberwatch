import { CARD, CardDefinition, carriedWeight, isBattleCard } from '../content/CardCatalog';
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
import type { Battle, CombatCard, OwnedCard, Phase, Rewards, Settlement } from '../RulesTypes';
import { CALM_LIMIT, CALM_PER_TURN, MAX_CALM_LIMIT, MAX_BONUS_STAMINA } from '../systems/LabyrinthCombat';
export interface GameState {
    schemaVersion: 3;
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
    health: number;
    cards: OwnedCard[];
    storedSupplies?: Record<string, number>;
    route: Route | null;
    fixedDone: boolean;
    pathIndex: number;
    visited: NodeKind[];
    discoveryPool?: string[];
    synthesisRewardBoosts?: Record<string, number>;
    synthesisBoostedRecipes?: string[];
    synthesisMaterialBoostedRecipes?: string[];
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
    const s = migrateLegacyGameState(raw, definitions) as GameState;
    integer(s.schemaVersion, 3, 3, 'schemaVersion');
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
    integer(s.supplies, 0, 1000000000, 'supplies');
    const savedTier = s.entryTier ?? null;
    if (scenario.battleResource === 'stamina') {
        requireValue(savedTier, savedTier === null || !!entryTier(savedTier), 'entry tier');
        if (['map', 'battle', 'rewards', 'rest'].indexOf(s.phase) >= 0)
            requireValue(savedTier, !!entryTier(savedTier), 'entry tier for active expedition');
    } else requireValue(savedTier, savedTier === null, 'legacy entry tier');
    integer(s.health, 0, 10, 'health');
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
    if (s.storedSupplies !== undefined) {
        object(s.storedSupplies, 'stored supplies');
        for (const kind of Object.keys(s.storedSupplies)) {
            requireValue(kind, definitions[kind]?.role === 'supply', 'stored supply kind');
            integer(s.storedSupplies[kind], 1, Number.MAX_SAFE_INTEGER, 'stored supply count');
        }
    }
    if (scenario.labyrinth && ['map', 'battle', 'rest', 'rewards'].indexOf(s.phase) >= 0)
        requireValue(s.discoveryPool, Array.isArray(s.discoveryPool), 'expedition discovery pool');
    if (s.discoveryPool !== undefined) {
        list(s.discoveryPool, 200, 'discovery pool');
        requireValue(s.discoveryPool, !!scenario.labyrinth &&
            new Set(s.discoveryPool).size === s.discoveryPool.length &&
            s.discoveryPool.every((kind) => typeof kind === 'string' && definitions[kind]?.chapter === 'ashen-labyrinth'),
            'discovery pool references');
    }
    if (s.synthesisRewardBoosts !== undefined) {
        object(s.synthesisRewardBoosts, 'synthesis reward boosts');
        for (const kind of Object.keys(s.synthesisRewardBoosts))
            integer(s.synthesisRewardBoosts[kind], 2, 2, 'synthesis reward boost');
    }
    if (s.synthesisBoostedRecipes !== undefined) {
        list(s.synthesisBoostedRecipes, 500, 'synthesis boosted recipes');
        requireValue(
            s.synthesisBoostedRecipes,
            new Set(s.synthesisBoostedRecipes).size === s.synthesisBoostedRecipes.length &&
                s.synthesisBoostedRecipes.every((id) => typeof id === 'string'),
            'synthesis boosted recipe ids'
        );
    }
    if (s.synthesisMaterialBoostedRecipes !== undefined) {
        list(s.synthesisMaterialBoostedRecipes, 500, 'synthesis material boosted recipes');
        requireValue(
            s.synthesisMaterialBoostedRecipes,
            new Set(s.synthesisMaterialBoostedRecipes).size === s.synthesisMaterialBoostedRecipes.length &&
                s.synthesisMaterialBoostedRecipes.every((id) => typeof id === 'string'),
            'synthesis material boosted recipe ids'
        );
    }
    list(s.cards, scenario.runDeck ? Number.MAX_SAFE_INTEGER : scenario.fieldDeck ? 10000 : 100, 'cards');
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
        if (definitions[card.kind].role !== 'supply') requireValue(card.zone, card.zone === 'base', 'weightless card zone');
        else requireValue(card, !card.selected, 'supply item');
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
    const baseWeight = s.cards.filter(c => c.zone === 'base')
        .reduce((n, c) => n + carriedWeight(definitions[c.kind]), 0);
    const overflowWeight = s.cards
        .filter((c) => c.zone === 'overflow')
        .reduce((n, c) => n + carriedWeight(definitions[c.kind]), 0);
    if (scenario.fieldDeck) {
        requireValue(
            s.cards,
            s.cards.every(
                (c) =>
                    c.selected &&
                    c.zone === 'base' &&
                    (definitions[c.kind].role === 'normal' || definitions[c.kind].role === 'basic')
            ),
            'field deck'
        );
    } else requireValue(baseWeight, baseWeight <= 30 && overflowWeight <= 10, 'inventory weight');
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
            integer(b.stamina, 0, scenario.labyrinth ? MAX_BONUS_STAMINA : budget, 'stamina');
        } else {
            integer(b.maxStamina ?? 0, 0, 0, 'legacy maxStamina');
            integer(b.stamina ?? 0, 0, 0, 'legacy stamina');
        }
        flag(b.boosted, 'boosted');
        if (scenario.fieldDeck) flag(b.attackedThisTurn, 'attack history');
        if (b.coreExposed !== undefined) {
            flag(b.coreExposed, 'core exposed');
            requireValue(
                b.coreExposed,
                !!scenario.enemies[b.enemy].discoverAtHalf && b.hp * 2 <= b.maxHp,
                'elite discovery'
            );
        }
        if (b.discovery !== undefined) {
            list(b.discovery, 3, 'discovery');
            requireValue(
                b.discovery,
                !!scenario.fieldDeck && !scenario.labyrinth &&
                    (b.turn === 1 || !!b.coreExposed) &&
                    b.discovery.length > 0 &&
                    new Set(b.discovery).size === b.discovery.length &&
                    b.discovery.every(
                        (kind) =>
                            Object.prototype.hasOwnProperty.call(definitions, kind) &&
                            definitions[kind].role === 'normal'
                    ),
                'discovery options'
            );
        }
        requireValue(b.intent, b.intent === 'attack' || b.intent === 'prepare', 'intent');
        for (const [name, cards] of [
            ['draw', b.draw],
            ['hand', b.hand],
            ['discard', b.discard],
        ] as const) {
            list(
                cards,
                name === 'hand' ? (scenario.runDeck ? 10 : 6) : scenario.runDeck ? Number.MAX_SAFE_INTEGER : 10000,
                name
            );
            cards.forEach((card) => identity(card, combat, true));
        }
        if (b.weapon !== null && b.weapons === undefined) {
            identity(b.weapon, combat, true);
            requireValue(
                b.weapon.kind,
                definitions[b.weapon.kind].effect.type === 'equip',
                'weapon'
            );
        }
        if (b.weapons !== undefined) {
            list(b.weapons, 2, 'weapons');
            b.weapons.forEach((card) => {
                identity(card, combat, true);
                requireValue(
                    card.kind,
                    definitions[card.kind].effect.type === 'equip',
                    'weapons entry'
                );
            });
            requireValue(
                b.weapons,
                b.weapons.reduce((slots, card) => slots + (definitions[card.kind].weaponSlots ?? 1), 0) <= 2,
                'weapon slots'
            );
        }
        if (b.gainedStrength !== undefined)
            integer(b.gainedStrength, 0, Number.MAX_SAFE_INTEGER, 'gained strength');
        if (b.rage !== undefined) integer(b.rage, 0, 5, 'rage');
        if (b.lastDefenseCardKind !== undefined)
            requireValue(
                b.lastDefenseCardKind,
                Object.prototype.hasOwnProperty.call(definitions, b.lastDefenseCardKind),
                'last defense card'
            );
        if (scenario.labyrinth) {
            const calm = b.calm!;
            object(calm, 'calm');
            integer(calm.limit, CALM_LIMIT, MAX_CALM_LIMIT, 'calm limit');
            integer(calm.persistent, 0, calm.limit, 'persistent calm');
            integer(calm.temporary, 0, calm.limit - calm.persistent, 'temporary calm');
            integer(calm.applied, 0, CALM_PER_TURN, 'calm applied this turn');
            integer(calm.spent, 0, MAX_CALM_LIMIT + CALM_PER_TURN, 'calm spent this turn');
            integer(calm.guardPerLayer, 0, 12, 'guard per layer');
            integer(calm.drawOnDefer, 0, 6, 'draw on defer');
            integer(calm.counter, 0, 12, 'deferred counter');
            flag(calm.calibrated, 'calibrated');
            flag(calm.freeSkill, 'free skill');
            requireValue(calm.deferred, [null, 'scheduled', 'extra-turn'].indexOf(calm.deferred) >= 0, 'defer state');
            requireValue(calm.retained, calm.retained === null || b.hand.some((c) => c.id === calm.retained), 'retained hand card');
        } else requireValue(b.calm, b.calm === undefined, 'legacy combat effects');
        if (b.cardChoice !== undefined) {
            const choice = b.cardChoice;
            object(choice, 'combat card choice');
            list(choice.ids, 10000, 'combat choice ids');
            requireValue(
                choice.mode,
                choice.mode === 'replace-weapon' ? !!scenario.runDeck : scenario.labyrinth &&
                    (choice.mode === 'discard-to-top' || choice.mode === 'retain-hand'),
                'combat choice mode'
            );
            const choices = choice.mode === 'discard-to-top' ? b.discard
                : choice.mode === 'retain-hand' ? b.hand
                : choice.mode === 'replace-weapon' ? (b.weapons ?? []) : null;
            requireValue(choice.ids, !!choices && choice.ids.length > 0 &&
                new Set(choice.ids).size === choice.ids.length &&
                choice.ids.every((id) => choices.some((c) => c.id === id)), 'combat choice');
            if (choice.mode === 'replace-weapon')
                requireValue(
                    b.pendingEquip,
                    b.hand.some((card) => card.id === b.pendingEquip && definitions[card.kind].effect.type === 'equip'),
                    'pending equip'
                );
            else requireValue(b.pendingEquip, b.pendingEquip === undefined, 'pending equip');
        } else requireValue(b.pendingEquip, b.pendingEquip === undefined, 'pending equip');
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
        if (scenario.labyrinth)
            requireValue(r.discovery, r.discovery === true && r.supplyTaken && r.cards.length > 0 &&
                new Set(r.cards).size === r.cards.length && r.cards.every((kind) => (s.discoveryPool?.indexOf(kind) ?? -1) >= 0),
                'labyrinth reward candidates');
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
            'treatmentCost',
            'treatmentSpent',
        ] as const)
            integer(t[key], 0, 100000, key);
        flag(t.treated, 'treated');
        if (t.discoveredCards !== undefined)
            integer(t.discoveredCards, 0, 100000, 'discovered cards');
        list(t.lostOverflow, 100, 'lostOverflow');
        t.lostOverflow.forEach((v) => text(v, 'lost card'));
    }
    requireValue(s.nextId, s.nextId >= highestId, 'nextId');
    // An explicit field list prevents prototype keys and future fields from entering the model.
    const result: GameState = {
        schemaVersion: 3,
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
        health: s.health,
        cards: s.cards,
        storedSupplies: s.storedSupplies,
        route: s.route,
        fixedDone: s.fixedDone,
        pathIndex: s.pathIndex,
        visited: s.visited,
        ...(s.discoveryPool === undefined ? {} : { discoveryPool: s.discoveryPool }),
        ...(s.synthesisRewardBoosts === undefined
            ? {}
            : { synthesisRewardBoosts: { ...s.synthesisRewardBoosts } }),
        ...(s.synthesisBoostedRecipes === undefined
            ? {}
            : { synthesisBoostedRecipes: [...s.synthesisBoostedRecipes] }),
        ...(s.synthesisMaterialBoostedRecipes === undefined
            ? {}
            : { synthesisMaterialBoostedRecipes: [...s.synthesisMaterialBoostedRecipes] }),
        battle: s.battle
            ? { ...s.battle, stamina: s.battle.stamina ?? 0, maxStamina: s.battle.maxStamina ?? 0 }
            : null,
        rewards: s.rewards,
        settlement: s.settlement
            ? {
                  returnedSupplies: s.settlement.returnedSupplies,
                  returnedCards: s.settlement.returnedCards,
                  ...(s.settlement.discoveredCards !== undefined
                      ? { discoveredCards: s.settlement.discoveredCards }
                      : {}),
                  lostOverflow: s.settlement.lostOverflow,
                  treatmentCost: s.settlement.treatmentCost,
                  treated: s.settlement.treated,
                  treatmentSpent: s.settlement.treatmentSpent,
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

/** Decode earlier armor/weight saves without rerolling any deck or encounter. */
export function migrateLegacyGameState(raw: unknown, definitions: Readonly<Record<string, CardDefinition>> = CARD): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as GameState).schemaVersion === 3) return raw;
    const s = upgradeJournal(raw) as any;
    if (s.schemaVersion !== 2) return s;
    s.schemaVersion = 3;
    s.health = s.health ?? s.armor;
    delete s.armor;
    delete s.critical;
    if (s.settlement) {
        const t = s.settlement;
        t.treatmentCost = t.treatmentCost ?? t.repairCost;
        t.treated = t.treated ?? t.repaired;
        t.treatmentSpent = t.treatmentSpent ?? t.repairSpent;
    }
    if (Array.isArray(s.cards)) {
        for (const card of s.cards) {
            const definition = card && definitions[card.kind];
            if (!definition) continue;
            if (definition.role === 'supply') {
                card.selected = false;
                continue;
            }
            if (card.zone !== 'overflow') continue;
            card.zone = 'base';
            const battle = s.battle;
            if (battle && card.selected && isBattleCard(definition) &&
                [battle.hand, battle.draw, battle.discard].every(pile => Array.isArray(pile) &&
                    !pile.some((c: CombatCard) => c.id === card.id || c.origin === card.id)) &&
                battle.weapon?.origin !== card.id) {
                battle.discard.push({ id: card.id, kind: card.kind, origin: card.id, temporary: false });
            }
        }
    }
    if (Array.isArray(s.logs)) s.logs = s.logs.map((line: unknown) =>
        typeof line === 'string'
            ? line.replace(/护甲/g, '血量')
                .replace(/，(?:负重 \d+ \/ \d+|释放 \d+ 负重)/g, '')
                .replace(/超出负重的部分已放弃。/g, '其余物资已放弃。')
            : line);
    return s;
}

/** Upgrade the old terminal teaching loop without replaying paid costs or deleting progress. */
function upgradeJournal(raw: unknown): unknown {
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
