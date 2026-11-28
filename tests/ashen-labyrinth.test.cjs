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

function install(discoveryPool) {
    const next = catalog.validateCatalog(source);
    if (discoveryPool) next.labyrinth.discoveryPool = [...discoveryPool];
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
function encounter(discoveryPool) {
    install(discoveryPool);
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

function supplyFixture() {
    const data = structuredClone(source);
    const battery = { id: 'qa_battery', name: '测试电池', tag: '物资', role: 'supply',
        chapter: 'ashen-labyrinth', cost: 0, initialCount: 0, reward: true, weight: 6, supplyValue: 4,
        color: '#87a895', art: 'battery', text: '', effect: { type: 'none', amount: 0 } };
    data.cards = data.cards.filter(card => card.role !== 'supply').concat(battery,
        { ...battery, id: 'qa_voucher', name: '测试票券', art: 'cash', weight: 1, supplyValue: 6 });
    return data;
}

test('labyrinth stock has positive carry weight and stays outside the combat discovery decks', () => {
    const data = catalog.installCatalog(supplyFixture());
    const goods = data.cards.filter(card => card.role === 'supply');
    assert.ok(goods.every(card => card.weight > 0 && !catalog.REWARD_POOL.includes(card.id)));
    for (const invalid of [
        raw => { raw.cards.find(card => card.role === 'supply').weight = 0; },
        raw => { raw.labyrinth.discoveryPool.push(goods[0].id); },
    ]) {
        const raw = structuredClone(data);
        invalid(raw);
        assert.throws(() => catalog.validateCatalog(raw));
    }
    const legacy = new GameSession(17, undefined, RUN_DECK_SCENARIO);
    assert.deepEqual(legacy.game.content.supplyPool, []);
    const beforeLoot = structuredClone(source);
    beforeLoot.cards = beforeLoot.cards.filter(card => card.role !== 'supply');
    catalog.installCatalog(beforeLoot);
    const disk = store();
    const old = start(new GameSession(17, new SaveRepository(disk)));
    const checkpoint = old.game.exportState();
    catalog.installCatalog(data);
    const upgraded = new GameSession(1, new SaveRepository(disk));
    assert.ok(upgraded.restored);
    assert.deepEqual(upgraded.game.exportState(), checkpoint);
    ok(upgraded.execute({ type: 'enter-node', id: 'serviceDuct' }));
    assert.equal(upgraded.game.content.cards[upgraded.view.rewards.cards[0]].role, 'supply');
});

test('a real labyrinth run banks loot once, keeps it through defeat, and redeems only the chosen copy', () => {
    catalog.installCatalog(supplyFixture());
    const disk = store();
    const resume = () => new GameSession(42, new SaveRepository(disk));
    let s = start(new GameSession(17, new SaveRepository(disk)));
    const sites = s.view.scenario.nodes;
    const lootRooms = path => path.filter(id => sites[id].supplyCard).length;
    const plan = walkablePaths(s.view.expeditionMap).filter(path => path[1] === 'serviceDuct')
        .sort((a, b) => lootRooms(b) - lootRooms(a))[0];
    const brought = {};
    for (const id of plan.slice(1)) {
        ok(s.execute({ type: 'enter-node', id }));
        if (!sites[id].supplyCard) {
            resolveRoom(s);
            continue;
        }
        const offer = s.game.exportState();
        const kind = s.view.rewards.cards[0];
        const weight = s.game.content.cards[kind].weight;
        const beforeWeight = s.game.baseWeight;
        const deck = s.view.usableCards;
        s = resume();
        assert.deepEqual(s.game.exportState(), offer);
        ok(s.execute({ type: 'discover', kind }));
        assert.equal(s.execute({ type: 'discover', kind }).ok, false);
        assert.equal(s.execute({ type: 'redeem-supply', kind }).ok, false);
        assert.equal(s.view.supplies, offer.supplies);
        assert.deepEqual(s.view.usableCards, deck);
        assert.deepEqual(resume().game.exportState(), s.game.exportState());
        if (s.view.carriedCards.at(-1).zone === 'base') {
            assert.equal(s.game.baseWeight, beforeWeight + weight);
            brought[kind] = (brought[kind] ?? 0) + 1;
        }
    }
    const balance = s.view.supplies;
    assert.ok(Object.values(brought).reduce((sum, n) => sum + n, 0) >= 2);
    s.advanceTime(1);
    s.advanceTime(1);
    assert.deepEqual(s.view.storedSupplies, brought);
    assert.equal(s.view.supplies, balance);
    assert.equal(s.view.carriedCards.length, 0);
    assert.equal(s.view.cards.length, 12);
    ok(s.execute({ type: 'continue-journal' }));
    const kind = Object.keys(brought)[0];
    const after = { ...brought };
    if (--after[kind] === 0) delete after[kind];
    s = resume();
    ok(s.execute({ type: 'redeem-supply', kind }));
    assert.equal(s.view.supplies, balance + s.game.content.cards[kind].supplyValue);
    assert.deepEqual(s.view.storedSupplies, after);
    assert.deepEqual(resume().game.exportState(), s.game.exportState());
    ok(s.execute({ type: 'start', tier: 'emergency' }));
    ok(s.execute({ type: 'enter-node' }));
    ok(s.execute({ type: 'enter-node', id: 'serviceDuct' }));
    ok(s.execute({ type: 'discover', kind: s.view.rewards.cards[0] }));
    const path = walkablePaths(s.view.expeditionMap).find(path => path[1] === 'serviceDuct');
    for (const id of path.slice(2)) {
        ok(s.execute({ type: 'enter-node', id }));
        if (s.view.phase === 'battle') break;
        resolveRoom(s);
    }
    const battle = s.view.battle;
    assert.ok(battle);
    assert.ok([...battle.hand, ...battle.draw].every(card => s.game.content.cards[card.kind].role !== 'supply'));
    while (s.view.battle) ok(s.execute({ type: 'end-turn' }));
    assert.equal(s.view.phase, 'failure');
    assert.equal(s.view.carriedCards.length, 0);
    assert.deepEqual(resume().view.storedSupplies, after);
});

test('a full bag blocks pickup without consuming it and discarding can promote a stored-overflow card', () => {
    const data = supplyFixture();
    const kind = 'qa_battery';
    for (const card of data.cards.filter(card => card.role === 'supply')) card.reward = card.id === kind;
    catalog.installCatalog(data);
    const disk = store(), repo = new SaveRepository(disk);
    const s = start(new GameSession(17, repo));
    ok(s.execute({ type: 'enter-node', id: 'serviceDuct' }));
    const state = s.game.exportState();
    for (let n = 0; n < 6; n++) {
        state.cards.push({ id: 'card-' + ++state.nextId, kind, found: true, selected: false, zone: n === 5 ? 'overflow' : 'base' });
    }
    repo.save(state);
    const loaded = new GameSession(1, new SaveRepository(disk));
    assert.deepEqual(loaded.game.exportState(), state);
    assert.equal(loaded.execute({ type: 'discover', kind }).ok, false);
    assert.deepEqual(loaded.game.exportState(), state);
    const carried = loaded.view.carriedCards;
    ok(loaded.execute({ type: 'discard-card', id: carried[0].id }));
    assert.equal(loaded.view.carriedCards.find(card => card.id === carried[5].id).zone, 'base');
    ok(loaded.execute({ type: 'discover', kind }));
    assert.equal(loaded.view.carriedCards.at(-1).zone, 'overflow');
    assert.equal(loaded.view.overflowWeight, 6);
    assert.equal(loaded.view.baseWeight, 30);
    assert.deepEqual(new GameSession(1, new SaveRepository(disk)).game.exportState(), loaded.game.exportState());
    // Resume just before the automatic return to verify the boundary with a full bag.
    const returning = loaded.game.exportState();
    returning.visited = walkablePaths(returning.expeditionMap).find(path => path[1] === 'serviceDuct');
    repo.save(returning);
    const home = new GameSession(1, new SaveRepository(disk));
    home.advanceTime(1);
    assert.deepEqual(home.view.storedSupplies, { [kind]: 5 });
    assert.deepEqual(home.view.settlement.lostOverflow, ['测试电池']);
    assert.equal(home.view.settlement.discoveredCards, 0);
    const retuned = structuredClone(data);
    retuned.cards.find(card => card.id === kind).supplyValue = 7;
    catalog.installCatalog(retuned);
    const retunedHome = new GameSession(1, new SaveRepository(disk));
    assert.deepEqual(retunedHome.view.storedSupplies, { [kind]: 5 });
    const balance = retunedHome.view.supplies;
    ok(retunedHome.execute({ type: 'continue-journal' }));
    ok(retunedHome.execute({ type: 'redeem-supply', kind }));
    assert.equal(retunedHome.view.supplies, balance + 7);
    const fullWallet = retunedHome.game.exportState();
    fullWallet.supplies = 1000000000;
    const treasuryStore = new SaveRepository(store());
    treasuryStore.save(fullWallet);
    const full = new GameSession(1, treasuryStore);
    assert.equal(full.execute({ type: 'redeem-supply', kind }).ok, false);
    assert.deepEqual(full.game.exportState(), fullWallet);
});

test('retuning or retiring loot preserves packed copies and pending offers across reloads', () => {
    const data = supplyFixture(), kind = 'qa_battery';
    data.cards.find(card => card.id === 'qa_voucher').reward = false;
    catalog.installCatalog(data);
    const disk = store(), s = start(new GameSession(17, new SaveRepository(disk)));
    ok(s.execute({ type: 'enter-node', id: 'serviceDuct' }));
    const retired = structuredClone(data);
    retired.cards.find(card => card.id === kind).reward = false;
    catalog.installCatalog(retired);
    const offered = new GameSession(9, new SaveRepository(disk));
    assert.ok(offered.restored);
    ok(offered.execute({ type: 'discover', kind }));
    assert.equal(offered.view.baseWeight, 6);
    const tuned = structuredClone(retired);
    tuned.cards.find(card => card.id === kind).weight = 25;
    catalog.installCatalog(tuned);
    const carried = new GameSession(1, new SaveRepository(disk));
    assert.ok(carried.restored);
    assert.equal(carried.view.baseWeight, 6);
    assert.equal(carried.view.rewardZone(kind), 'overflow');
    const empty = start(new GameSession(17));
    ok(empty.execute({ type: 'enter-node', id: 'serviceDuct' }));
    assert.equal(empty.view.rewards, null);
    const removed = structuredClone(tuned);
    removed.cards = removed.cards.filter(card => card.id !== kind);
    catalog.installCatalog(removed);
    const saved = disk.getItem('the-end.run.v1');
    const blocked = new GameSession(1, new SaveRepository(disk));
    assert.equal(blocked.restored, false);
    assert.equal(disk.getItem('the-end.run.v1'), saved);
});

function hash(data) {
    const text = JSON.stringify(data);
    let result = 2166136261;
    for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
    return (result >>> 0).toString(16);
}

test('both lower-risk and combat-heavy routes clear all seventeen layers and a new day rolls a fresh map', () => {
    install(['lab_probe', 'lab_bypass', 'lab_bracelet']);
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

test('old editor selections migrate to the same ordered, deduplicated reward pool', () => {
    const next = structuredClone(source);
    next.labyrinth = {
        starter: next.labyrinth.starter,
        decks: [
            { id: 'shared', name: '共用配合', cards: ['lab_probe', 'lab_bypass'] },
            { id: 'calibration', name: '蓄压倍率', cards: ['lab_bypass', 'lab_valve'] },
            { id: 'defer', name: '快速暂缓', cards: ['lab_vent'] },
        ],
        enabledDecks: ['calibration', 'shared'],
    };
    const migrated = catalog.validateCatalog(next);
    assert.deepEqual(migrated.labyrinth, {
        starter: next.labyrinth.starter,
        discoveryPool: ['lab_probe', 'lab_bypass', 'lab_valve'],
    });
    assert.deepEqual(catalog.validateCatalog(migrated), migrated);
    next.labyrinth.enabledDecks = [];
    assert.deepEqual(catalog.validateCatalog(next).labyrinth.discoveryPool, []);
    next.labyrinth.decks = [];
    assert.deepEqual(catalog.validateCatalog(next).labyrinth.discoveryPool, []);
    migrated.labyrinth.discoveryPool = ['knife', 'dragon_slayer'];
    assert.deepEqual(catalog.validateCatalog(migrated).labyrinth.discoveryPool, ['knife', 'dragon_slayer']);
    for (const invalid of [['lab_bypass', 'lab_bypass'], ['slash'], ['cash'], ['missing']]) {
        migrated.labyrinth.discoveryPool = invalid;
        assert.throws(() => catalog.validateCatalog(migrated), /焦土迷宫奖励池/);
    }
});

test('only cards selected for the reward pool are offered, and an empty pool skips the offer', () => {
    for (const pool of [[], ['lab_valve', 'lab_bracelet'], ['lab_bypass', 'lab_probe', 'lab_clip', 'lab_vent']]) {
        const s = encounter(pool);
        assert.equal(s.view.battle.discovery, undefined);
        finishBattle(s);
        if (!pool.length) {
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

test('migrated weapons can be discovered and resume from the Maze autosave', () => {
    const pool = ['knife', 'shield_spear', 'dragon_slayer'];
    install(pool);
    const disk = store();
    const s = start(new GameSession(17, new SaveRepository(disk)));
    ok(s.execute({ type: 'enter-node', id: 'serviceDuct' }));
    if (s.view.rewards) {
        assert.ok(s.view.rewards.cards.every(id => s.view.content.cards[id].role === 'supply'));
        ok(s.execute({ type: 'discover', kind: null }));
    }
    const room = nextMapNodes(s.view.expeditionMap, 'serviceDuct')[0];
    ok(s.execute({ type: 'enter-node', id: room }));
    assert.deepEqual(s.view.rewards.cards.slice().sort(), [...pool].sort());
    ok(s.execute({ type: 'discover', kind: 'dragon_slayer' }));
    const snapshot = s.game.exportState();
    assert.ok(snapshot.cards.some(card => card.kind === 'dragon_slayer' && card.found));
    const resumed = new GameSession(18, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(), snapshot);
});

test('the Maze keeps two weapon slots and resumes a paid or cancelled replacement safely', () => {
    install();
    const disk = store();
    let s = start(new GameSession(17, new SaveRepository(disk)));
    enter(s, 'battle');
    const hand = (kind) => {
        const owned = s.game.inventoryRules.addDiscovery(kind);
        s.game.battle.hand.push(s.game.combatRules.combatCard(owned));
        return owned.id;
    };
    const equip = (kind) => {
        const id = hand(kind);
        ok(s.execute({ type: 'play-card', id }));
        return id;
    };
    s.game.battle.hand = [];
    s.game.battle.stamina = 20;
    const knife = equip('knife');
    const dragon = equip('dragon_slayer');
    assert.deepEqual(s.view.battle.weapons.map(card => card.kind), ['knife', 'dragon_slayer']);
    assert.equal(s.view.strength, 4);
    assert.equal(s.game.attackDamage('slash_dragon'), 24);
    const remaining = s.view.battle.stamina;
    const guard = equip('metal_guard');
    assert.deepEqual(s.view.battle.cardChoice.ids, [knife, dragon]);
    assert.equal(s.view.battle.stamina, remaining);
    ok(s.execute({ type: 'resolve-combat-choice', id: null }));
    assert.equal(s.view.battle.stamina, remaining);
    assert.ok(s.view.battle.hand.some(card => card.id === guard));
    ok(s.execute({ type: 'play-card', id: guard }));
    const pending = s.game.exportState();
    s = new GameSession(19, new SaveRepository(disk));
    assert.ok(s.restored, s.startupMessage);
    assert.deepEqual(s.game.exportState(), pending);
    ok(s.execute({ type: 'resolve-combat-choice', id: knife }));
    assert.deepEqual(s.view.battle.weapons.map(card => card.kind), ['dragon_slayer', 'metal_guard']);
    assert.equal(s.view.battle.stamina, remaining - s.view.content.cards.metal_guard.cost);
    ok(s.execute({ type: 'end-turn' }));
    assert.ok(s.view.battle.hand.some(card => card.kind === 'slash_dragon' && card.temporary));
    assert.ok(s.view.battle.hand.some(card => card.kind === 'cover' && card.temporary));
    assert.ok(s.view.battle.hand.length <= 6);
});

test('shield-spear rage works alongside the Maze turn and defense rules', () => {
    const s = encounter();
    const b = s.game.battle;
    b.hp = b.maxHp = 100;
    b.hand = [];
    b.stamina = 60;
    const use = (kind) => {
        const entry = { id: 'slash-' + ++fixtureId, kind, temporary: false };
        b.hand.push(entry);
        ok(s.execute({ type: 'play-card', id: entry.id }));
    };
    use('shield_spear');
    assert.deepEqual(b.weapons.map((item) => item.kind), ['shield_spear']);
    for (let index = 0; index < 5; index++) use('lab_press');
    assert.equal(b.rage, 5);
    const hp = b.hp;
    use('shield_spear_charge');
    assert.equal(b.hp, hp - 15);
    assert.equal(b.rage, 1);
    use('lab_step');
    assert.equal(b.lastDefenseCardKind, 'lab_step');
    b.rage = 5;
    const block = b.block;
    use('shield_spear_guard');
    assert.equal(b.block, block + 5 + 3 * s.view.content.cards.lab_step.effect.amount);
    ok(s.execute({ type: 'end-turn' }));
    assert.equal(b.lastDefenseCardKind, undefined);
});

test('an open offer and the in-progress pool resume when the editor selection changes', () => {
    install(['lab_valve', 'lab_bracelet']);
    const disk = store();
    const s = start(new GameSession(22, new SaveRepository(disk)));
    enter(s, 'battle');
    const battle = s.game.exportState();
    const restoredBattle = new GameSession(1, new SaveRepository(disk));
    assert.ok(restoredBattle.restored);
    assert.deepEqual(restoredBattle.game.exportState(), battle);
    finishBattle(s);
    const pending = s.game.exportState();
    install(['lab_vent', 'lab_clip']);
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

test('each enemy uses its configured sequence and the current step survives deferral and catalog changes', () => {
    const configured = install();
    const plan = { attack: 1, strongAttack: 3, actions: ['heavy', 'prepare', 'prepare', 'attack'], loopStart: 1 };
    configured.labyrinth.enemyActions = { 'ash-moth': plan };
    catalog.installCatalog(configured);
    const disk = store();
    const session = start(new GameSession(17, new SaveRepository(disk)));
    enter(session, 'battle');
    assert.equal(session.view.battle.enemy, 'ash-moth');
    assert.equal(session.view.incomingDamage, 3);
    session.game.battle.calm.deferred = 'scheduled';
    ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.battle.enemySequence.index, 0);
    assert.equal(session.view.incomingDamage, 3);
    assert.equal(session.view.health, 10);
    ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.battle.enemySequence.index, 1);
    assert.equal(session.view.battle.intent, 'prepare');
    assert.equal(session.view.health, 7);
    const saved = session.game.exportState();

    configured.labyrinth.enemyActions['ash-moth'] = { attack: 2, strongAttack: 4, actions: ['attack'], loopStart: 0 };
    catalog.installCatalog(configured);
    const resumed = new GameSession(18, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(), saved);
    ok(resumed.execute({ type: 'end-turn' }));
    assert.equal(resumed.view.battle.enemySequence.index, 2);
    assert.equal(resumed.view.battle.intent, 'prepare');
    ok(resumed.execute({ type: 'end-turn' }));
    assert.equal(resumed.view.incomingDamage, 1);
    ok(resumed.execute({ type: 'end-turn' }));
    assert.equal(resumed.view.incomingDamage, 0);
    assert.equal(resumed.view.battle.enemySequence.index, 1);

    const fresh = start(new GameSession(17));
    enter(fresh, 'battle');
    assert.equal(fresh.view.incomingDamage, 2);
    assert.deepEqual(fresh.view.battle.enemySequence.actions, ['attack']);
    configured.labyrinth.enemyActions['ash-moth'].actions = [];
    assert.throws(() => catalog.validateCatalog(configured), /动作或伤害数值无效/);
});

test('a version-three labyrinth checkpoint follows its saved route, then receives a generated map', () => {
    const currentCatalog = install();
    const disk = store(), repo = new SaveRepository(disk);
    start(new GameSession(17, repo));
    const { checksum, ...legacy } = JSON.parse(disk.getItem(repo.key));
    legacy.version = legacy.state.schemaVersion = 3;
    delete legacy.state.expeditionMap;
    legacy.state.route = 'B';
    legacy.state.discoveryPool = ['lab_bypass'];
    legacy.catalogHash = hash({
        version: currentCatalog.version,
        starter: currentCatalog.labyrinth.starter,
        cards: currentCatalog.cards.filter(card => card.chapter === 'ashen-labyrinth' && card.role !== 'supply'),
    });
    disk.setItem(repo.key, JSON.stringify({ ...legacy, checksum: hash(legacy) }));

    const resumed = new GameSession(222, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.equal(resumed.view.expeditionMap, null);
    assert.deepEqual(resumed.view.discoveryPool, ['lab_bypass']);
    while (resumed.view.currentNode !== 'return') {
        ok(resumed.execute({ type: 'enter-node' }));
        resolveRoom(resumed);
    }
    assert.deepEqual(resumed.view.visited, ['threshold', ...resumed.view.scenario.routes.B]);
    resumed.advanceTime(1);
    ok(resumed.execute({ type: 'continue-journal' }));
    assert.equal(resumed.view.day, 2);
    ok(resumed.execute({ type: 'start', tier: 'standard' }));
    assert.deepEqual(resumed.view.discoveryPool, currentCatalog.labyrinth.discoveryPool);
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
    b.enemySequence = { actions: ['heavy', 'prepare'], index: 0, loopStart: 0 };
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
