import { CARD, CardDefinition, carriedWeight, isBattleCard, isLabyrinthRewardCard, type CardKind } from '../content/CardCatalog';
import { getScenario, hasId, nodeDefinition, NodeKind, Route, STAMINA_SCENARIO, supportsFistCombos, supportsWeaponSlots, type GameScenario } from '../content/GameScenario';
import { FIST_MOVES, fistFinisherFor, fistMove, fistSupport, fistTargetMatches, isFistBattleReward } from '../content/FistCards';
import { ASHEN_MAP_LAST_LAYER, ASHEN_MAP_OUTER_LANE, nextMapNodes, pointRoomId, type ExpeditionMap } from '../content/ExpeditionMap';
import { EntryTierId, entryTier } from '../content/EntryTiers';
import { battleEnemies, hasLivingEnemy, validEnemyActions, type BattleEnemy } from '../content/LabyrinthEnemies';
import { isPhase } from './GamePhase';
import {
    getJournalCatalog,
    JournalCatalog,
    JournalRecord,
    mapClearMilestone,
    validMilestoneId,
} from '../content/JournalCatalog';
import type { Battle, CombatCard, OwnedCard, Phase, Rewards, Settlement } from '../RulesTypes';
import { MAX_SUPPLY_POINTS } from '../RulesTypes';
import { CALM_LIMIT, CALM_PER_TURN, MAX_CALM_LIMIT, MAX_BONUS_STAMINA } from '../systems/LabyrinthCombat';
export interface GameState {
    schemaVersion: 4;
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
    expeditionMap: ExpeditionMap | null;
    fixedDone: boolean;
    pathIndex: number;
    visited: NodeKind[];
    discoveryPool?: string[];
    fistUnlocks?: string[];
    synthesisRewardBoosts?: Record<string, number>;
    synthesisBoostedRecipes?: string[];
    synthesisMaterialBoostedRecipes?: string[];
    battle: Battle | null;
    rewards: Rewards | null;
    settlement: Settlement | null;
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

function validateFistBattle(
    battle: Battle,
    definitions: Readonly<Record<string, CardDefinition>>,
    unlocks: readonly string[],
    allowed: boolean
): void {
    const fist = battle.fist;
    if (fist === undefined) return;
    object(fist, 'fist battle');
    requireValue(fist, allowed, 'fist scenario');
    list(fist.moves, 3, 'fist moves');
    requireValue(fist.moves, new Set(fist.moves).size === fist.moves.length &&
        fist.moves.every((move) => FIST_MOVES.indexOf(move) >= 0) &&
        !(fist.moves.indexOf('straight') >= 0 && fist.moves.indexOf('parry') >= 0), 'fist sequence');
    const combo = fistFinisherFor(fist.moves);
    if (combo) {
        const finisher = [...battle.hand, ...battle.draw].find((card) => card.id === fist.finisherId);
        const definition = finisher && definitions[finisher.kind];
        requireValue(fist.finisherId, definition?.role === 'temporary' &&
            definition.fist?.type === 'finisher' && definition.fist.combo === combo, 'live fist finisher');
    } else requireValue(fist.finisherId, fist.finisherId === undefined, 'idle fist sequence');
    if (fist.lastPlayed !== undefined) {
        object(fist.lastPlayed, 'last played card');
        const card = definitions[fist.lastPlayed.kind];
        flag(fist.lastPlayed.temporary, 'last played temporary');
        requireValue(fist.lastPlayed.kind, !!card &&
            (!card.fist || fist.lastPlayed.temporary === (card.role === 'temporary')), 'last played kind');
    }
    list(fist.unlockedHere, 7, 'battle finisher unlocks');
    requireValue(fist.unlockedHere, new Set(fist.unlockedHere).size === fist.unlockedHere.length &&
        fist.unlockedHere.every((kind) => unlocks.indexOf(kind) >= 0), 'battle finisher unlocks');
    integer(fist.damageBonus, 0, Number.MAX_SAFE_INTEGER, 'fist damage bonus');
    integer(fist.blockBonus, 0, Number.MAX_SAFE_INTEGER, 'fist block bonus');
    flag(fist.recoveredStamina, 'fist recovered stamina');
    list(fist.counters, 10000, 'fist counters');
    requireValue(fist.counters, fist.counters.every((kind) => {
        const card = definitions[kind]?.fist;
        return card?.type === 'finisher' && !!card.counter;
    }), 'fist counter kinds');
}

function isFistChoiceValid(battle: Battle, definitions: Readonly<Record<string, CardDefinition>>): boolean {
    const choice = battle.cardChoice!;
    if (battle.discovery) return false;
    if (choice.mode === 'fist-discovery')
        return !!battle.fist && choice.ids.length === 3 && choice.ids.every((kind) =>
            definitions[kind]?.role === 'temporary' && !!fistMove(definitions[kind]));
    if (choice.mode === 'deck-discovery') {
        const available = [...battle.draw, ...battle.discard];
        return !!battle.fist && choice.ids.length <= 3 && choice.ids.every((id) =>
            available.some((card) => card.id === id && !card.temporary && !!card.origin));
    }
    if (choice.mode === 'switch-stance' || choice.mode === 'recover-stamina') {
        const mode = choice.mode;
        return (mode !== 'recover-stamina' || !battle.fist?.recoveredStamina) &&
            battle.hand.some((card) => card.id === choice.sourceId && fistSupport(definitions[card.kind]) === mode) &&
            choice.ids.every((id) => battle.hand.some((card) =>
                card.id === id && fistTargetMatches(mode, definitions[card.kind])));
    }
    return false;
}

function validateExpeditionMap(state: GameState, scenario: GameScenario): ExpeditionMap | null {
    const map = state.expeditionMap;
    if (map === null) return null;
    object(map, 'expedition map');
    requireValue(map, !!scenario.labyrinth && state.route === null && state.pathIndex === 0, 'map scenario');
    integer(map.seed, 0, 0xffffffff, 'map seed');
    list(map.points, (ASHEN_MAP_LAST_LAYER + 1) * (ASHEN_MAP_OUTER_LANE * 2 + 1), 'map points');
    const ids = new Set<NodeKind>(), positions = new Set<string>();
    requireValue(map.version, map.version === undefined || map.version === 2, 'map version');
    for (const point of map.points) {
        object(point, 'map point');
        integer(point.layer, 0, ASHEN_MAP_LAST_LAYER, 'map layer');
        integer(point.lane, -ASHEN_MAP_OUTER_LANE, ASHEN_MAP_OUTER_LANE, 'map lane');
        const position = `${point.layer}:${point.lane}`;
        const coordinateId = `room-${point.layer + 1}-${point.lane + ASHEN_MAP_OUTER_LANE + 1}`;
        requireValue(point.id, (point.id === coordinateId || hasId(scenario.nodes, point.id)) &&
            !ids.has(point.id) && !positions.has(position), 'map point identity');
        requireValue(point, hasId(scenario.nodes, pointRoomId(point)) &&
            (map.version === 2 || point.room === undefined), 'map room');
        ids.add(point.id);
        positions.add(position);
        list(point.next, 3, 'map connections');
    }
    const points = new Map(map.points.map((point) => [point.id, point]));
    const entrance = map.points[0];
    requireValue(entrance, entrance?.id === scenario.fixedNodeId && entrance.layer === 0 &&
        pointRoomId(entrance) === scenario.fixedNodeId, 'map entrance');
    const boss = points.get('lampCourt');
    const lastLayer = boss?.layer;
    requireValue(points, !!boss && pointRoomId(boss) === 'lampCourt' &&
        (lastLayer === ASHEN_MAP_LAST_LAYER || (lastLayer === 7 && map.version === undefined)),
        'map destination');
    for (const point of map.points) {
        requireValue(point.next, (point.next.length === 0) === (point.id === 'lampCourt') &&
            new Set(point.next).size === point.next.length && point.next.every((id) => {
                const next = points.get(id);
                return !!next && next.layer > point.layer &&
                    (lastLayer === 7 || next.layer === point.layer + 1);
            }), 'map connections');
    }
    const reachable = new Set<NodeKind>([entrance.id]);
    for (const point of [...map.points].sort((a, b) => a.layer - b.layer))
        if (reachable.has(point.id)) for (const next of point.next) reachable.add(next);
    requireValue(reachable, reachable.size === points.size, 'map reachability');

    let last: NodeKind | undefined;
    for (const id of state.visited) {
        requireValue(id, nextMapNodes(map, last).indexOf(id) >= 0, 'visited map path');
        last = id;
    }
    requireValue(state.fixedDone, state.fixedDone === (last !== undefined), 'map entrance progress');
    const { phase } = state;
    const inRoom = phase === 'battle' || phase === 'rewards' || phase === 'rest';
    const next = nextMapNodes(map, last);
    requireValue(map.activeNode, inRoom ? map.activeNode !== null && next.indexOf(map.activeNode) >= 0 :
        map.activeNode === null, 'active map point');
    requireValue(phase, inRoom || phase === 'map' || ((phase === 'shelter' || phase === 'journal') &&
        last === 'lampCourt'), 'expedition map phase');
    if (map.deferredRewards !== undefined) {
        object(map.deferredRewards, 'deferred room rewards');
        requireValue(map.deferredRewards, phase === 'map' && map.deferredRewards.source === last &&
            map.deferredRewards.discovery === true, 'deferred room reward location');
    }
    if (map.activeNode !== null) {
        const room = nodeDefinition(scenario, map.activeNode, map);
        if (phase === 'battle') {
            const battle = state.battle;
            requireValue(room, room?.type === 'battle' && room.enemyId === battle?.enemy &&
                (room.companions?.length ?? 0) === (battle.companions?.length ?? 0) &&
                (room.companions ?? []).every((id, slot) => battle.companions?.[slot]?.enemy === id), 'active map battle');
        }
        if (phase === 'rewards') requireValue(room, !!room && map.activeNode === state.rewards?.source && room.type !== 'rest', 'active map reward');
        if (phase === 'rest') requireValue(room, room?.type === 'rest', 'active map rest');
    }
    return {
        seed: map.seed,
        points: map.points.map(({ id, layer, lane, next, room }) => ({
            id, layer, lane, next,
            ...(room === undefined ? {} : { room }),
        })),
        activeNode: map.activeNode,
        ...(map.version === undefined ? {} : { version: map.version }),
        ...(map.deferredRewards === undefined ? {} : { deferredRewards: map.deferredRewards }),
    };
}

/** Validate before touching a live model; never hydrate arbitrary object properties. */
export function validateGameState(
    raw: unknown,
    definitions: Readonly<Record<string, CardDefinition>> = CARD,
    journals: JournalCatalog = getJournalCatalog()
): GameState {
    object(raw, 'state');
    const s = migrateLegacyGameState(raw, definitions) as GameState;
    integer(s.schemaVersion, 4, 4, 'schemaVersion');
    text(s.scenarioId, 'scenarioId', 80);
    integer(s.scenarioVersion, 1, 100000, 'scenarioVersion');
    const scenario = getScenario(s.scenarioId, s.scenarioVersion);
    const fistEnabled = supportsFistCombos(scenario);
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
    integer(s.supplies, 0, MAX_SUPPLY_POINTS, 'supplies');
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
    list(s.visited, 100, 'visited');
    const expeditionMap = validateExpeditionMap(s, scenario);
    if (!expeditionMap)
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
            s.discoveryPool.every((kind) => typeof kind === 'string' && isLabyrinthRewardCard(definitions[kind])),
            'discovery pool references');
        if (expeditionMap?.version === 2)
            requireValue(s.discoveryPool, s.discoveryPool.some((id) => !definitions[id].fist), 'room combat reward pool');
    }
    if (s.fistUnlocks !== undefined) {
        list(s.fistUnlocks, 7, 'run finisher unlocks');
        requireValue(s.fistUnlocks, fistEnabled &&
            new Set(s.fistUnlocks).size === s.fistUnlocks.length &&
            s.fistUnlocks.every((kind) => definitions[kind]?.role === 'normal' &&
                definitions[kind].fist?.type === 'finisher'), 'run finisher unlocks');
    }
    const fistUnlocks = s.fistUnlocks ?? [];
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
        combat = new Set<string>(),
        ownedKinds = new Map<string, string>();
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
            requireValue(card.kind, definitions[card.kind].role !== 'supply', 'supply in battle');
            if (card.origin !== undefined)
                requireValue(card.origin, owned.has(card.origin), 'card origin');
            if (definitions[card.kind].fist) {
                requireValue(card, fistEnabled &&
                    (definitions[card.kind].role === 'temporary'
                        ? card.temporary && card.origin === undefined
                        : !card.temporary && card.origin === card.id && ownedKinds.get(card.id) === card.kind),
                    'fist combat card');
            }
        }
    };
    s.cards.forEach((card) => {
        identity(card, owned, false);
        ownedKinds.set(card.id, card.kind);
        const definition = definitions[card.kind];
        if (definition.fist)
            requireValue(card, fistEnabled && definition.role === 'normal' &&
                (definition.fist.type !== 'finisher' || fistUnlocks.indexOf(card.kind) >= 0), 'owned fist card');
        flag(card.selected, 'selected');
        flag(card.found, 'found');
        if (card.packedWeight !== undefined) {
            requireValue(card.kind, definitions[card.kind].role === 'supply', 'packed item');
            integer(card.packedWeight, 1, 30, 'packed weight');
        }
        requireValue(card.zone, card.zone === 'base' || card.zone === 'overflow', 'zone');
        if (definitions[card.kind].role !== 'supply') requireValue(card.zone, card.zone === 'base', 'weightless card zone');
        else requireValue(card, !card.selected, 'supply item');
        if (scenario.runDeck) {
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
        .reduce((n, c) => n + carriedWeight(definitions[c.kind], c.packedWeight), 0);
    const overflowWeight = s.cards
        .filter((c) => c.zone === 'overflow')
        .reduce((n, c) => n + carriedWeight(definitions[c.kind], c.packedWeight), 0);
    if (scenario.fieldDeck) {
        requireValue(
            s.cards,
            s.cards.every(
                (c) => definitions[c.kind].role === 'supply'
                    ? !!scenario.labyrinth && c.found && ['map', 'rewards', 'battle', 'rest'].indexOf(s.phase) >= 0
                    : c.selected && c.zone === 'base' && isBattleCard(definitions[c.kind])
            ),
            'field deck'
        );
    }
    requireValue(baseWeight, baseWeight <= 30 && overflowWeight <= 10, 'inventory weight');
    requireValue(s.battle, (s.phase === 'battle') === (s.battle !== null), 'battle phase');
    if (s.battle) {
        const b = s.battle;
        object(b, 'battle');
        if (b.companions !== undefined) {
            list(b.companions, 1, 'companions');
            requireValue(b.companions, !!scenario.labyrinth && !!expeditionMap && b.companions.length === 1, 'encounter formation');
        }
        for (const member of battleEnemies(b as Battle)) validateBattleEnemy(member, scenario, !!b.companions);
        requireValue(b, hasLivingEnemy(b), 'living enemy');
        if (b.pendingEnemy !== undefined) {
            integer(b.pendingEnemy, 1, b.companions?.length ?? 0, 'pending enemy');
            requireValue(b.pendingEnemy, b.companions[b.pendingEnemy - 1].hp > 0 && b.stamina === 0 &&
                !b.discovery && !b.cardChoice && b.calm?.deferred !== 'scheduled', 'pending enemy action');
        }
        integer(b.turn, 1, 1000000, 'turn');
        integer(b.block, 0, 100000, 'block');
        integer(b.equippedTurn, 0, b.turn, 'equippedTurn');
        if (scenario.battleResource === 'stamina') {
            const budget = entryTier(savedTier)!.stamina;
            integer(b.maxStamina, budget, budget, 'maxStamina');
            integer(b.stamina, 0, scenario.labyrinth ? MAX_BONUS_STAMINA : budget + (fistEnabled ? 2 : 0), 'stamina');
        } else {
            integer(b.maxStamina ?? 0, 0, 0, 'legacy maxStamina');
            integer(b.stamina ?? 0, 0, 0, 'legacy stamina');
        }
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
        validateFistBattle(b, definitions, fistUnlocks, fistEnabled);
        if (b.cardChoice !== undefined) {
            const choice = b.cardChoice;
            object(choice, 'combat card choice');
            list(choice.ids, 10000, 'combat choice ids');
            const choices = choice.mode === 'discard-to-top' ? b.discard
                : choice.mode === 'retain-hand' ? b.hand
                : choice.mode === 'replace-weapon' ? (b.weapons ?? (b.weapon ? [b.weapon] : [])) : null;
            requireValue(choice.ids, choice.ids.length > 0 && new Set(choice.ids).size === choice.ids.length &&
                (choices ? (choice.mode === 'replace-weapon' ? supportsWeaponSlots(scenario) : !!scenario.labyrinth) &&
                    choice.ids.every((id) => choices.some((c) => c.id === id))
                    : fistEnabled && isFistChoiceValid(b, definitions)), 'combat choice');
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
    for (const r of [s.rewards, expeditionMap?.deferredRewards]) {
        if (r === null || r === undefined) continue;
        object(r, 'rewards');
        const room = nodeDefinition(scenario, r.source, expeditionMap);
        requireValue(r.source, !!room, 'reward source');
        integer(r.supplies, 0, 100000, 'reward supplies');
        flag(r.supplyTaken, 'supplyTaken');
        flag(r.cardTaken, 'cardTaken');
        list(r.cards, 3, 'reward cards');
        requireValue(r.nextCards, r.nextCards === undefined || expeditionMap?.version === 2, 'next room reward');
        if (scenario.labyrinth) {
            const pool = s.discoveryPool ?? [];
            const stock = (cards: readonly CardKind[]) =>
                cards.length === 1 && definitions[cards[0]]?.role === 'supply';
            const combat = (cards: readonly CardKind[]) => cards.length > 0 &&
                new Set(cards).size === cards.length && cards.every((kind) =>
                    !!definitions[kind] && definitions[kind].role !== 'supply' &&
                    (pool.indexOf(kind) >= 0 ||
                        (room?.type === 'battle' && fistUnlocks.indexOf(kind) >= 0)) &&
                    (!definitions[kind].fist || room?.type === 'battle'));
            let allowed: boolean;
            if (expeditionMap?.version === 2) {
                const isBattle = room?.type === 'battle';
                if (r.nextCards !== undefined) {
                    list(r.nextCards, 3, 'next reward cards');
                    allowed = (isBattle || room?.type === 'scavenge') &&
                        ((combat(r.cards) && stock(r.nextCards)) || (stock(r.cards) && combat(r.nextCards)));
                } else allowed = (isBattle || room?.type === 'scavenge') && (stock(r.cards) || combat(r.cards));
            } else {
                allowed = room?.type === 'scavenge' && room.supplyCard ? stock(r.cards) : combat(r.cards);
            }
            requireValue(r.discovery, r.discovery === true && !r.cardTaken && r.supplyTaken && r.cards.length > 0 &&
                new Set(r.cards).size === r.cards.length && allowed,
                'labyrinth reward candidates');
        }
        if (r.guaranteedFinisher !== undefined)
            requireValue(r.guaranteedFinisher, fistEnabled &&
                (r.cards[0] === r.guaranteedFinisher || r.nextCards?.[0] === r.guaranteedFinisher) &&
                fistUnlocks.indexOf(r.guaranteedFinisher) >= 0 && room?.type === 'battle',
                'guaranteed finisher');
        r.cards.forEach((kind) =>
            requireValue(
                kind,
                Object.prototype.hasOwnProperty.call(definitions, kind) &&
                    (!definitions[kind].fist || (fistEnabled && room?.type === 'battle' &&
                        (isFistBattleReward(definitions[kind]) || fistUnlocks.indexOf(kind) >= 0))),
                'reward kind'
            )
        );
    }
    if (s.settlement !== null) {
        const t = s.settlement;
        object(t, 'settlement');
        integer(t.returnedSupplies, 0, MAX_SUPPLY_POINTS, 'returnedSupplies');
        for (const key of [
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
        schemaVersion: 4,
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
        expeditionMap,
        fixedDone: s.fixedDone,
        pathIndex: s.pathIndex,
        visited: s.visited,
        ...(s.discoveryPool === undefined ? {} : { discoveryPool: s.discoveryPool }),
        ...(s.fistUnlocks === undefined ? {} : { fistUnlocks: [...s.fistUnlocks] }),
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
            ? {
                  ...s.battle,
                  stamina: s.battle.stamina ?? 0,
                  maxStamina: s.battle.maxStamina ?? 0,
                  ...(s.battle.enemySequence ? { enemySequence: {
                      actions: [...s.battle.enemySequence.actions],
                      index: s.battle.enemySequence.index,
                      loopStart: s.battle.enemySequence.loopStart ?? 0,
                  } } : {}),
              }
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
        failureReason: s.failureReason,
        revision: s.revision,
        run: s.run,
        returnElapsed: s.returnElapsed,
    };
    return JSON.parse(JSON.stringify(result));
}

function validateBattleEnemy(member: BattleEnemy, scenario: GameScenario, group: boolean): void {
    object(member, 'battle enemy');
    requireValue(member.enemy, hasId(scenario.enemies, member.enemy), 'enemy');
    integer(member.hp, group ? 0 : 1, 100000, 'hp');
    integer(member.maxHp, Math.max(1, member.hp), 100000, 'maxHp');
    integer(member.attack, 0, 100000, 'attack');
    integer(member.strongAttack, 0, 100000, 'strongAttack');
    flag(member.boosted, 'boosted');
    requireValue(member.intent, member.intent === 'attack' || member.intent === 'prepare', 'intent');
    const sequence = member.enemySequence;
    if (sequence === undefined) return;
    object(sequence, 'enemy action sequence');
    requireValue(sequence, !!scenario.labyrinth && validEnemyActions(sequence.actions), 'enemy actions');
    integer(sequence.index, 0, sequence.actions.length - 1, 'enemy action index');
    integer(sequence.loopStart ?? 0, 0, sequence.actions.length - 1, 'enemy loop start');
    const action = sequence.actions[sequence.index];
    requireValue(member.intent, member.intent === (action === 'prepare' ? 'prepare' : 'attack') &&
        member.boosted === (action === 'heavy'), 'enemy action intent');
}

/** Decode earlier armor/weight saves without rerolling any deck or encounter. */
export function migrateLegacyGameState(raw: unknown, definitions: Readonly<Record<string, CardDefinition>> = CARD): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const { schemaVersion } = raw as { schemaVersion?: number };
    if (schemaVersion === 4) return raw;
    if (schemaVersion === 3) return { ...raw, schemaVersion: 4, expeditionMap: null };
    const s = upgradeJournal(raw) as any;
    if (s.schemaVersion !== 2) return s;
    s.schemaVersion = 4;
    s.expeditionMap = null;
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
