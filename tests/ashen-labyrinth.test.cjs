const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const from = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const catalog = from('core/content/CardCatalog');
const { ASHEN_LABYRINTH_SCENARIO, FIELD_SCENARIO, RUN_DECK_SCENARIO } = from('core/content/GameScenario');
const { GameSession } = from('application/GameSession');
const { enterEncounterPreview } = from('presentation/dev/EncounterPreview');
const { SaveRepository } = from('infrastructure/SaveRepository');
const { generateAshenLabyrinthMap, nextMapNodes } = from('core/content/ExpeditionMap');
const { routeMapModel } = from('presentation/map/RouteMapModel');
const source = require('../assets/resources/data/cards.json');
const ok = (value) => assert.ok(value.ok, value.message);

function install(enabled) {
    const next = structuredClone(source);
    next.labyrinth.enabledDecks = enabled ?? next.labyrinth.enabledDecks;
    return catalog.installCatalog(next);
}
function start(s, tier = 'standard', route = 'A') {
    ok(s.execute({ type: 'start', tier }));
    ok(s.execute({ type: 'enter-node' }));
    if (!s.view.expeditionMap) ok(s.execute({ type: 'choose-route', route }));
    return s;
}
function enter(s, kind) {
    const target = routeMapModel(s.view).points.find(point =>
        point.state === 'available' && s.view.scenario.nodes[point.kind]?.type === kind);
    assert.ok(target, `Expected a reachable ${kind} from ${s.view.currentNode}`);
    ok(s.execute({ type: 'enter-node', id: target.kind }));
}
function encounter(enabled) {
    install(enabled);
    const s = start(new GameSession(17));
    enter(s, 'battle');
    return s;
}

test('the temporary encounter preview reaches the generated map opening through normal commands', () => {
    install();
    for (const seed of [1, 19, 127]) {
        const session = new GameSession(seed);
        enterEncounterPreview(session);
        assert.equal(session.view.phase, 'battle');
        assert.equal(session.view.expeditionMap.activeNode, 'lampPassage');
        assert.deepEqual(session.view.visited, ['threshold']);
    }
});
function finishBattle(s) {
    for (let i = 0; i < 30 && s.view.battle; i++) {
        const g = s.game;
        while (g.battle) {
            if (g.battle.cardChoice) ok(s.execute({ type: 'resolve-combat-choice', id: null }));
            const legal = g.battle.hand.filter((card) => !g.cardBlocked(card));
            const selected = legal.find((c) => g.content.cards[c.kind].effect.labyrinth?.rule === 'gain-stamina')
                ?? (g.incomingDamage > g.battle.block ? legal.find((c) => g.content.cards[c.kind].effect.type === 'block') : undefined)
                ?? legal.find((c) => g.content.cards[c.kind].effect.type === 'damage');
            if (!selected) break;
            ok(s.execute({ type: 'play-card', id: selected.id }));
        }
        if (g.battle) ok(s.execute({ type: 'end-turn' }));
    }
    assert.ok(!s.view.battle);
    assert.notEqual(s.view.phase, 'failure');
}
const card = (kind, id = 'slash-100') => ({ id, kind: 'lab_' + kind, temporary: false });
let fixtureId = 400;
function play(s, kind) {
    const b = s.game.battle;
    const entry = card(kind, 'slash-' + ++fixtureId);
    b.hand.push(entry);
    ok(s.execute({ type: 'play-card', id: entry.id }));
}
function store() {
    const disk = new Map();
    return { getItem: (key) => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value) };
}

function walkablePaths(map, id = map.points[0].id) {
    const next = nextMapNodes(map, id);
    return next.length ? next.flatMap(child => walkablePaths(map, child).map(path => [id, ...path])) : [[id]];
}

function resolveRoom(s) {
    if (s.view.battle) finishBattle(s);
    if (s.view.phase === 'rewards') ok(s.execute({ type: 'discover', kind: s.view.rewards.cards[0] }));
    if (s.view.phase === 'rest') ok(s.execute({ type: 'finish-rest' }));
}

function hash(data) {
    const text = JSON.stringify(data);
    let result = 2166136261;
    for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
    return (result >>> 0).toString(16);
}

test('both lower-risk and combat-heavy routes clear all seventeen layers and a new day rolls a fresh map', () => {
    install();
    for (const opening of ['serviceDuct', 'lampPassage']) {
        const s = new GameSession(17);
        assert.equal(s.view.scenario.id, 'ashen-labyrinth');
        assert.equal(s.view.cards.length, 12);
        assert.equal(s.view.currentJournal.title, '灰里的门槛');
        start(s);
        const graph = s.view.expeditionMap;
        const path = walkablePaths(graph).find(candidate => candidate[1] === opening &&
            (opening === 'serviceDuct' ? !candidate.includes('ashGallery') && !candidate.includes('returnBridge')
                : candidate.includes('ashGallery') && candidate.includes('returnBridge')));
        assert.equal(path?.length, 17);
        const model = routeMapModel(s.view);
        assert.equal(model.points.find(point => point.id === 'threshold').title, '门槛补给');
        assert.deepEqual(model.points.filter(point => point.state === 'current').map(point => point.id), ['threshold']);
        assert.ok(model.points.filter(point => point.state !== 'visited' && point.state !== 'current' &&
            (point.icon === 'supply' || point.icon === 'scavenge')).every(point => point.title === '未知地点'));
        const positions = new Map(model.points.map(point => [point.id, point.y]));
        assert.ok(model.edges.every(edge => positions.get(edge.to) > positions.get(edge.from)));
        assert.equal(s.execute({ type: 'choose-route', route: 'A' }).ok, false);
        for (const id of path.slice(1)) {
            assert.equal(s.execute({ type: 'enter-node', id: 'threshold' }).ok, false);
            ok(s.execute({ type: 'enter-node', id }));
            resolveRoom(s);
        }
        assert.deepEqual(s.view.visited, path);
        assert.equal(s.view.currentNode, 'return');
        s.advanceTime(1);
        assert.equal(s.view.day, 2);
        assert.equal(s.view.currentJournal.id, 'labyrinth-cleared');
        assert.equal(s.view.cards.length, 12);
        assert.ok(s.view.settlement.discoveredCards > 0);
        ok(s.execute({ type: 'continue-journal' }));
        ok(s.execute({ type: 'start', tier: 'standard' }));
        assert.notEqual(s.view.expeditionMap.seed, graph.seed);
        assert.notDeepEqual(s.view.expeditionMap.points, graph.points);
        assert.deepEqual(s.view.visited, []);
    }
});

test('every generated path traverses seventeen consecutive levels with three rests and discoveries', () => {
    const { nodes } = ASHEN_LABYRINTH_SCENARIO;
    const counts = new Set();
    for (let seed = 0; seed < 512; seed++) {
        const day = seed % 31 + 1;
        const map = generateAshenLabyrinthMap(seed, day, nodes);
        assert.deepEqual(generateAshenLabyrinthMap(seed, day, nodes), map);
        const paths = walkablePaths(map);
        counts.add(paths.length);
        const model = routeMapModel({ scenario: ASHEN_LABYRINTH_SCENARIO, phase: 'map',
            visited: paths[0].slice(0, 6), expeditionMap: map });
        const choices = model.points.filter(point => point.state === 'available');
        const hints = choices.map(point => point.decisionHint);
        assert.ok(hints.includes('第 10 层遇战') && hints.includes('第 9、10 层连战'));
        for (const point of choices) {
            const routes = paths.filter(path => path[6] === point.id);
            const fights = routes.filter(path => nodes[path[8]].type === 'battle').length;
            assert.equal(point.decisionHint, fights === 0 ? '第 10 层遇战'
                : fights === routes.length ? '第 9、10 层连战' : '第 9、10 层可能连战');
            assert.equal(point.title, '未知地点');
        }
        assert.ok(map.points.length >= 26 && map.points.length <= 35);
        assert.ok(paths.length >= 6);
        assert.ok(map.points.slice(1).filter(point => point.next.length > 1).length >= 2);
        assert.ok(paths.some(path => path[1] === 'serviceDuct' && !path.includes('ashGallery') && !path.includes('returnBridge')));
        assert.ok(paths.some(path => path.includes('ashGallery') && path.includes('returnBridge')));
        assert.equal(new Set(paths.flat()).size, map.points.length);
        const byId = new Map(map.points.map(point => [point.id, point]));
        for (const { layer, next } of map.points)
            assert.ok(next.every(id => byId.get(id).layer === layer + 1));
        for (const path of paths) {
            assert.equal(path.length, 17);
            assert.equal(path.at(-1), 'lampCourt');
            assert.deepEqual(path.filter(id => nodes[id].type === 'rest'), ['warmAlcove', 'leeAlcove', 'innerAlcove']);
            const opportunities = path.slice(0, -1).map(id => nodes[id]).filter(
                node => node.type === 'battle' || (node.type === 'scavenge' && node.discover));
            assert.ok(opportunities.length >= 6);
        }
    }
    assert.ok(counts.size > 1);
});

test('the hearth previews the saved connections in the rest and map screens without changing them', () => {
    install();
    const session = start(new GameSession(17));
    const path = walkablePaths(session.view.expeditionMap).find(route => route[1] === 'serviceDuct');
    for (const id of path.slice(1, 5)) {
        ok(session.execute({ type: 'enter-node', id }));
        resolveRoom(session);
    }
    ok(session.execute({ type: 'enter-node', id: 'warmAlcove' }));
    const saved = session.game.exportState();
    const rooms = new Map(saved.expeditionMap.points.map(point => [point.id, point]));
    // An earlier 17-floor layout can still offer an escape from the apparent double fight.
    rooms.get('stampedDrawer').next.push('edgeCache');
    const repo = new SaveRepository(store());
    repo.save(saved);
    const resumed = new GameSession(42, repo);
    const labels = () => routeMapModel(resumed.view).points
        .filter(point => point.decisionHint).map(point => [point.id, point.decisionHint, point.state]);
    assert.deepEqual(labels(), [
        ['fallenShelves', '第 10 层遇战', 'locked'], ['stampedDrawer', '第 9、10 层可能连战', 'locked'],
    ]);
    assert.deepEqual(resumed.game.exportState(), saved);
    ok(resumed.execute({ type: 'finish-rest' }));
    assert.deepEqual(labels(), [
        ['fallenShelves', '第 10 层遇战', 'available'], ['stampedDrawer', '第 9、10 层可能连战', 'available'],
    ]);
    ok(resumed.execute({ type: 'enter-node', id: 'fallenShelves' }));
    assert.deepEqual(resumed.view.expeditionMap.points, saved.expeditionMap.points);
});

test('a map saved by the first generator keeps its exact topology with the expanded map catalogue', () => {
    install();
    const disk = store(), repo = new SaveRepository(disk);
    const session = start(new GameSession(17));
    const snapshot = session.game.exportState();
    const oldPoints = [
        ['threshold', 0, 0, 'lightCut', 'serviceDuct'],
        ['lightCut', 1, -1, 'copperChest'],
        ['serviceDuct', 1, 1, 'copperChest'],
        ['copperChest', 2, 0, 'fallenShelves', 'ashGallery'],
        ['ashGallery', 3, 1, 'fallenShelves'],
        ['fallenShelves', 4, 0, 'lampPassage'],
        ['lampPassage', 5, 0, 'leeAlcove'],
        ['leeAlcove', 6, 0, 'lampCourt'],
        ['lampCourt', 7, 0],
    ].map(([id, layer, lane, ...next]) => ({ id, layer, lane, next }));
    snapshot.expeditionMap.points = oldPoints;
    repo.save(snapshot);
    const restored = new GameSession(2, new SaveRepository(disk));
    assert.ok(restored.restored, restored.startupMessage);
    assert.deepEqual(restored.view.expeditionMap.points, oldPoints);
    const route = routeMapModel(restored.view);
    assert.ok(route.height > 580);
    assert.deepEqual(route.points.filter(point => point.state === 'available').map(point => point.id),
        ['lightCut', 'serviceDuct']);
});

test('only the union of checked decks is offered after victory and an empty selection skips the offer', () => {
    for (const enabled of [[], ['calibration'], ['shared', 'defer']]) {
        const s = encounter(enabled);
        const pool = catalog.activeDiscoveryCards(s.game.content.catalog.labyrinth);
        assert.equal(s.view.battle.discovery, undefined);
        finishBattle(s);
        if (!enabled.length) {
            assert.equal(s.view.phase, 'map');
            continue;
        }
        const reward = s.view.rewards, before = s.view.cards.length;
        assert.ok(reward.discovery && reward.supplyTaken);
        assert.equal(reward.cards.length, Math.min(3, pool.length));
        assert.ok(reward.cards.every((id) => pool.includes(id)));
        const kind = reward.cards[0];
        assert.equal(s.execute({ type: 'discover', kind: 'lab_press' }).ok, false);
        ok(s.execute({ type: 'discover', kind }));
        assert.equal(s.execute({ type: 'discover', kind }).ok, false);
        assert.equal(s.view.cards.length, before + 1);
        enter(s, 'scavenge');
        assert.ok(s.view.rewards.cards.every((id) => pool.includes(id)));
        ok(s.execute({ type: 'discover', kind: null }));
        enter(s, 'scavenge');
        if (s.view.phase === 'rewards') ok(s.execute({ type: 'discover', kind: null }));
        enter(s, 'battle');
        assert.ok([...s.view.battle.hand, ...s.view.battle.draw].some((c) => c.kind === kind));
    }
});

test('an open offer and the in-progress pool resume when the editor selection changes', () => {
    install(['calibration']);
    const disk = store();
    const s = start(new GameSession(22, new SaveRepository(disk)));
    enter(s, 'battle');
    const battle = s.game.exportState();
    const restoredBattle = new GameSession(1, new SaveRepository(disk));
    assert.ok(restoredBattle.restored);
    assert.deepEqual(restoredBattle.game.exportState(), battle);
    finishBattle(s);
    const pending = s.game.exportState();
    install(['defer']);
    const resumed = new GameSession(4, new SaveRepository(disk));
    assert.ok(resumed.restored);
    assert.deepEqual(resumed.game.exportState(), pending);
    ok(resumed.execute({ type: 'discover', kind: null }));
    enter(resumed, 'scavenge');
    assert.deepEqual(resumed.view.rewards.cards.slice().sort(), pending.discoveryPool.slice().sort());
    ok(resumed.execute({ type: 'new-game' }));
    ok(resumed.execute({ type: 'start', tier: 'standard' }));
    assert.ok(resumed.game.discoveryPool.includes('lab_vent'));
    assert.ok(!resumed.game.discoveryPool.includes('lab_valve'));
});

test('a version-three labyrinth checkpoint follows its saved route, then receives a generated map', () => {
    install();
    const disk = store(), repo = new SaveRepository(disk);
    start(new GameSession(17, repo));
    const { checksum, ...legacy } = JSON.parse(disk.getItem(repo.key));
    legacy.version = legacy.state.schemaVersion = 3;
    delete legacy.state.expeditionMap;
    legacy.state.route = 'B';
    disk.setItem(repo.key, JSON.stringify({ ...legacy, checksum: hash(legacy) }));

    const resumed = new GameSession(222, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.equal(resumed.view.expeditionMap, null);
    while (resumed.view.currentNode !== 'return') {
        ok(resumed.execute({ type: 'enter-node' }));
        resolveRoom(resumed);
    }
    assert.deepEqual(resumed.view.visited, ['threshold', ...resumed.view.scenario.routes.B]);
    resumed.advanceTime(1);
    ok(resumed.execute({ type: 'continue-journal' }));
    assert.equal(resumed.view.day, 2);
    ok(resumed.execute({ type: 'start', tier: 'standard' }));
    assert.deepEqual(resumed.view.expeditionMap, generateAshenLabyrinthMap(17, 2, ASHEN_LABYRINTH_SCENARIO.nodes));
});

test('a packaged salt-field save predating the labyrinth keeps its exact chapter and battle', () => {
    const old = structuredClone(source);
    delete old.labyrinth;
    old.cards = old.cards.filter((card) => !card.chapter);
    catalog.installCatalog(old);
    const disk = store();
    const s = start(new GameSession(17, new SaveRepository(disk), FIELD_SCENARIO));
    ok(s.execute({ type: 'enter-node' }));
    const state = s.game.exportState();
    install();
    const resumed = new GameSession(2, new SaveRepository(disk));
    assert.ok(resumed.restored);
    assert.deepEqual(resumed.game.exportState(), state);
    assert.equal(resumed.view.scenario.version, 2);
});

test('both historical stamina-expedition@2 signatures recover their own rules', () => {
    const { version, fixedReward, cards, expedition, recipes } = install();
    const legacyCards = cards.filter(({ chapter }) => !chapter);
    const oldFieldCards = legacyCards.map((card) =>
        card.id === 'attack' ? { ...card, text: '固有能力，永不丢失' } : card);
    const tideOnly = new Set(['follow_up', 'shield_push', 'scrap_shiv', 'rummage']);
    const oldSynthesisCards = legacyCards.filter(({ id }) => !tideOnly.has(id));
    for (const [scenario, oldCatalog] of [
        [FIELD_SCENARIO, { version, fixedReward, cards: oldFieldCards, expedition }],
        [RUN_DECK_SCENARIO, { version, fixedReward, cards: oldSynthesisCards, recipes }],
    ]) {
        const disk = store();
        const repo = new SaveRepository(disk);
        const session = new GameSession(17, undefined, scenario);
        ok(session.execute({ type: 'start', tier: 'standard' }));
        ok(session.execute({ type: 'enter-node' }));
        const state = session.game.exportState();
        const body = { format: 'the-end-save', version: 2, savedAt: '2026-11-20T12:00:00.000Z',
            catalogHash: hash(oldCatalog), state: { ...state, scenarioId: 'stamina-expedition', scenarioVersion: 2 } };
        disk.setItem(repo.key, JSON.stringify({ ...body, checksum: hash(body) }));
        const restored = new GameSession(19, repo);
        assert.ok(restored.restored, restored.startupMessage);
        assert.equal(restored.view.scenario.id, scenario.id);
        assert.deepEqual(restored.game.exportState(), state);
    }
});

test('temporary and persistent calm share the cap, preserve the original intent and grant one extra turn', () => {
    const s = encounter();
    const b = s.game.battle;
    b.hp = b.maxHp = 80;
    b.stamina = 30;
    play(s, 'reading');
    play(s, 'probe');
    play(s, 'pulse');
    assert.deepEqual([b.calm.persistent, b.calm.temporary, b.calm.applied], [2, 1, 3]);
    ok(s.game.endTurn());
    assert.equal(b.calm.temporary, 0);
    assert.equal(b.calm.persistent, 2);
    b.intent = 'attack';
    b.boosted = true;
    b.stamina = 30;
    play(s, 'vent');
    assert.equal(b.calm.deferred, 'scheduled');
    assert.equal(s.game.attackDamage('lab_opening'), 7);
    const hp = s.view.health;
    ok(s.game.endTurn());
    assert.equal(b.calm.deferred, 'extra-turn');
    assert.equal(b.intent, 'attack');
    assert.equal(b.calm.persistent + b.calm.temporary + b.block, 0);
    assert.equal(s.view.health, hp);
    play(s, 'return_shield');
    const enemy = b.hp;
    ok(s.game.endTurn());
    assert.equal(b.intent, 'prepare');
    assert.equal(b.calm.deferred, null);
    assert.equal(b.hp, enemy - 3);
    assert.equal(s.view.health, hp);
});

test('capacity raises the threshold and calibration consumes only available layers; battery exhausts for the battle', () => {
    const s = encounter(), b = s.game.battle;
    b.hp = b.maxHp = 90;
    b.stamina = 30;
    play(s, 'valve');
    assert.equal(b.calm.limit, 6);
    b.calm.persistent = 3;
    play(s, 'test_hit');
    assert.equal(b.calm.persistent, 4);
    assert.equal(b.calm.deferred, null);
    play(s, 'bracelet');
    play(s, 'calibration');
    assert.equal(s.game.attackDamage('lab_press'), 16);
    const hp = b.hp;
    play(s, 'press');
    assert.equal(b.hp, hp - 16);
    assert.equal(b.calm.persistent, 0);
    assert.equal(b.block, 4);
    play(s, 'bypass');
    assert.equal(s.game.cardCost('lab_screen'), 0);
    assert.equal(s.game.cardCost('lab_anchor'), 2);
    const before = b.stamina;
    play(s, 'screen');
    assert.equal(b.stamina, before);
    assert.equal(s.game.cardCost('lab_screen'), 2);
    const use = b.stamina;
    play(s, 'cell');
    assert.equal(b.stamina, use + 2);
    assert.ok(!b.discard.some((c) => c.id === 'slash-' + fixtureId));
});

test('choice effects keep card instances intact and lock the turn until the choice is handled', () => {
    const s = encounter(), b = s.game.battle;
    b.hand = [card('press', 'slash-101'), card('step', 'slash-102')];
    b.draw = [];
    b.discard = [card('screen', 'slash-103')];
    play(s, 'loop_box');
    assert.deepEqual(b.cardChoice.ids, ['slash-103']);
    assert.equal(s.execute({ type: 'end-turn' }).ok, false);
    ok(s.execute({ type: 'resolve-combat-choice', id: 'slash-103' }));
    assert.equal(b.draw[0].id, 'slash-103');
    play(s, 'clip');
    ok(s.execute({ type: 'resolve-combat-choice', id: 'slash-101' }));
    ok(s.execute({ type: 'end-turn' }));
    assert.equal(b.hand[0].id, 'slash-101');
    assert.equal(b.hand[1].id, 'slash-103');
    assert.equal(b.hand.filter((c) => c.id === 'slash-101').length, 1);
    assert.equal(ASHEN_LABYRINTH_SCENARIO.enemies['veil-idol'].strongAttack, 4);
});
