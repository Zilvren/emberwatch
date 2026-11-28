const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const from = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const catalog = from('core/content/CardCatalog');
const { ASHEN_LABYRINTH_SCENARIO, FIELD_SCENARIO, RUN_DECK_SCENARIO } = from('core/content/GameScenario');
const { GameSession } = from('application/GameSession');
const { SurvivalGame } = from('core/SurvivalGame');
const { enterEncounterPreview } = from('presentation/dev/EncounterPreview');
const { SaveRepository } = from('infrastructure/SaveRepository');
const { ASHEN_ROOM_TARGETS, generateAshenLabyrinthMap, nextMapNodes, pointRoomId } = from('core/content/ExpeditionMap');
const { routeMapModel } = from('presentation/map/RouteMapModel');
const source = require('../assets/resources/data/cards.json');
const legacyMap = require('./fixtures/ashen-map-v1.cjs');
const ok = (value) => assert.ok(value.ok, value.message);

function install(discoveryPool) {
    const next = catalog.validateCatalog(source);
    if (discoveryPool) next.labyrinth.discoveryPool = [...discoveryPool];
    return catalog.installCatalog(next);
}
function start(s, tier = 'standard', route = 'A') {
    ok(s.execute({ type: 'start', tier }));
    ok(s.execute({ type: 'enter-node' }));
    if (s.view.expeditionMap?.version === 2) ok(s.execute({ type: 'discover', kind: null }));
    if (!s.view.expeditionMap) ok(s.execute({ type: 'choose-route', route }));
    return s;
}
function startLegacy(repo = new SaveRepository(store())) {
    const fresh = new GameSession(17);
    ok(fresh.execute({ type: 'start', tier: 'standard' }));
    const checkpoint = fresh.game.exportState();
    checkpoint.expeditionMap = structuredClone(legacyMap);
    checkpoint.discoveryPool = fresh.game.content.catalog.labyrinth.discoveryPool.slice();
    repo.save(checkpoint);
    const s = new GameSession(17, repo);
    assert.ok(s.restored, s.startupMessage);
    ok(s.execute({ type: 'enter-node' }));
    return s;
}
function enter(s, kind) {
    const target = routeMapModel(s.view).points.find(point =>
        point.state === 'available' && s.view.scenario.nodes[point.kind]?.type === kind);
    assert.ok(target, `Expected a reachable ${kind} from ${s.view.currentNode}`);
    ok(s.execute({ type: 'enter-node', id: target.id }));
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
            const attacks = legal.filter(c => g.content.cards[c.kind].effect.type === 'damage')
                .sort((a, b) => g.attackDamage(b.kind) - g.attackDamage(a.kind));
            const selected = attacks.find(c => g.attackDamage(c.kind) >= g.battle.hp) ??
                legal.find((c) => g.content.cards[c.kind].effect.labyrinth?.rule === 'gain-stamina')
                ?? (g.incomingDamage > g.battle.block ? legal.find((c) => g.content.cards[c.kind].effect.type === 'block') : undefined)
                ?? attacks[0];
            if (!selected) break;
            ok(s.execute({ type: 'play-card', id: selected.id }));
        }
        if (g.battle) ok(s.execute({ type: 'end-turn' }));
    }
    assert.ok(!s.view.battle);
    assert.notEqual(s.view.phase, 'failure', s.view.failureReason);
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
    while (s.view.phase === 'rewards') {
        const kind = s.view.rewards.cards.find(kind => !s.view.rewardCardBlocked(kind));
        ok(s.execute({ type: 'discover', kind: kind ?? null }));
    }
    if (s.view.phase === 'rest') ok(s.execute({ type: 'finish-rest' }));
}

function enterBirdPair() {
    install();
    const disk = store();
    const session = start(new GameSession(10, new SaveRepository(disk)));
    enter(session, 'battle');
    assert.deepEqual(session.view.battle.companions?.map(bird => bird.enemy), ['stymphalian-bird']);
    return { session, disk };
}

test('both targets have independent health, survive reload and grant a single room reward', () => {
    for (const slot of [0, 1]) {
        const { session, disk } = enterBirdPair(), game = session.game;
        const battle = game.battle;
        const attack = battle.hand.find(card => game.content.cards[card.kind].effect.type === 'damage');
        assert.ok(attack);
        // A one-hit survivor fixture allows both target orders to exercise the ordinary play command.
        battle.hp = battle.companions[0].hp = 1;
        const before = game.exportState(), supplies = game.supplies;
        assert.equal(session.execute({ type: 'play-card', id: attack.id, target: 2 }).ok, false);
        assert.deepEqual(game.exportState(), before);
        ok(session.execute({ type: 'play-card', id: attack.id, target: slot }));
        assert.deepEqual([battle.hp,battle.companions[0].hp], slot === 0 ? [0,1] : [1,0]);
        assert.equal(game.rewards, null);
        const resumed = new GameSession(1, new SaveRepository(disk));
        assert.equal(resumed.restored, true, resumed.startupMessage);
        assert.deepEqual(resumed.game.exportState(), game.exportState());
        if (!resumed.view.battle.hand.some(card => !resumed.view.cardBlocked(card))) ok(resumed.execute({ type: 'end-turn' }));
        const saved = resumed.game.exportState();
        const another = resumed.view.battle.hand.find(card => !resumed.view.cardBlocked(card));
        assert.ok(another, 'a card whose only invalid input is the defeated target');
        assert.equal(resumed.execute({ type:'play-card', id:another.id, target:slot }).ok, false);
        assert.deepEqual(resumed.game.exportState(), saved);
        finishBattle(resumed);
        assert.equal(resumed.view.phase,'rewards');
        assert.equal(resumed.view.supplies, supplies + resumed.view.scenario.enemies['stymphalian-bird'].rewardSupplies);
    }
});

test('a flock resolves each living intent once and resumes the next bird after an impact checkpoint', () => {
    const {session,disk} = enterBirdPair(), b = session.game.battle;
    assert.equal(b.enemy,'stymphalian-bird');
    assert.equal(b.companions[0].enemy,b.enemy);
    assert.deepEqual([b.intent,b.companions[0].intent],['attack','prepare']);
    const turn = b.turn, health = session.view.health;
    ok(session.execute({type:'enemy-action',slot:0,turn}));
    assert.equal(session.view.health,health-1);
    assert.equal(b.pendingEnemy,1);
    const resumed = new GameSession(999,new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(),session.game.exportState());
    const unchanged = resumed.game.exportState();
    assert.equal(resumed.execute({type:'enemy-action',slot:0,turn}).ok,false);
    assert.deepEqual(resumed.game.exportState(),unchanged);
    ok(resumed.execute({type:'enemy-action',slot:1,turn}));
    assert.equal(resumed.view.health,health-1);
    assert.equal(resumed.view.battle.turn,turn+1);
    assert.equal(resumed.view.battle.pendingEnemy,undefined);
    assert.equal(resumed.execute({type:'enemy-action',slot:1,turn}).ok,false);
    assert.deepEqual([resumed.view.battle.intent,resumed.view.battle.companions[0].boosted],['prepare',true]);
});

test('a deferred flock keeps both intents and spends the player guard only once across both hits', () => {
    const {session} = enterBirdPair();
    const b = session.game.battle, health = session.view.health;
    for (const bird of [b, ...b.companions]) {
        bird.attack = 2;
        bird.intent = 'attack';
        bird.boosted = false;
        bird.enemySequence = {actions:['attack','prepare'],index:0,loopStart:0};
    }
    b.calm.deferred = 'scheduled';
    ok(session.execute({type:'end-turn'}));
    assert.equal(session.view.health, health);
    assert.deepEqual([b.enemySequence.index,b.companions[0].enemySequence.index],[0,0]);
    assert.equal(session.view.incomingDamage,4);
    b.block = 3;
    ok(session.execute({type:'end-turn'}));
    assert.equal(session.view.health,health-1);
    assert.deepEqual([b.intent,b.companions[0].intent],['prepare','prepare']);
});

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
    const old = startLegacy(new SaveRepository(disk));
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
    let s = startLegacy(new SaveRepository(disk));
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
    ok(s.execute({ type: 'discover', kind: s.view.rewards.cards[0] }));
    if (s.view.rewards) ok(s.execute({ type: 'discover', kind: null }));
    enter(s, 'battle');
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
    const s = startLegacy(repo);
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
    const disk = store(), s = startLegacy(new SaveRepository(disk));
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
    const empty = startLegacy();
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
    const scores = [];
    for (const risk of [1, -1]) {
        const s = new GameSession(17);
        assert.equal(s.view.scenario.id, 'ashen-labyrinth');
        assert.equal(s.view.cards.length, 12);
        assert.equal(s.view.currentJournal.title, '灰里的门槛');
        start(s);
        const graph = s.view.expeditionMap;
        const rooms = new Map(graph.points.map(point => [point.id, s.view.scenario.nodes[pointRoomId(point)]]));
        const danger = path => path.reduce((sum, id) => sum +
            (rooms.get(id).icon === 'elite' ? 3 : Number(rooms.get(id).type === 'battle')), 0);
        const path = walkablePaths(graph).sort((a, b) => risk * (danger(a) - danger(b)))[0];
        scores.push(danger(path));
        assert.equal(path.length, 17);
        const model = routeMapModel(s.view);
        assert.equal(model.points.find(point => point.id === 'threshold').title, '门槛补给');
        assert.deepEqual(model.points.filter(point => point.state === 'current').map(point => point.id), ['threshold']);
        assert.ok(model.points.every(point => point.title === rooms.get(point.id).title));
        const positions = new Map(model.points.map(point => [point.id, point.y]));
        assert.ok(model.edges.every(edge => positions.get(edge.to) > positions.get(edge.from)));
        assert.equal(s.execute({ type: 'choose-route', route: 'A' }).ok, false);
        for (const id of path.slice(1, -1)) {
            ok(s.execute({ type: 'enter-node', id }));
            resolveRoom(s);
            assert.equal(s.execute({ type: 'enter-node', id: 'threshold' }).ok, false);
        }
        ok(s.execute({ type: 'enter-node', id: 'lampCourt' }));
        finishBattle(s);
        const bossReward = structuredClone(s.view.rewards);
        ok(s.execute({ type: 'discover', kind: null }));
        s.advanceTime(1);
        assert.equal(s.view.day, 1);
        assert.equal(s.view.phase, 'map');
        assert.ok(routeMapModel(s.view).points.find(point => point.id === 'lampCourt').resumeRewards);
        ok(s.execute({ type: 'enter-node', id: 'lampCourt' }));
        assert.deepEqual(s.view.rewards, bossReward);
        ok(s.execute({ type: 'discover', kind: null }));
        assert.deepEqual(s.view.visited, path);
        assert.equal(s.view.currentNode, 'return');
        ok(s.execute({ type: 'enter-node' }));
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
    assert.ok(scores[0] < scores[1]);
});

test('maps place room quotas across connected routes, with public room types on all seventeen floors', () => {
    const { nodes } = ASHEN_LABYRINTH_SCENARIO;
    const counts = new Set();
    for (let seed = 0; seed < 512; seed++) {
        const day = seed % 31 + 1;
        const map = generateAshenLabyrinthMap(seed, day, nodes);
        assert.deepEqual(generateAshenLabyrinthMap(seed, day, nodes), map);
        assert.equal(map.version, 2);
        const paths = walkablePaths(map);
        counts.add(paths.length);
        const model = routeMapModel({ scenario: ASHEN_LABYRINTH_SCENARIO, phase: 'map',
            visited: paths[0].slice(0, 6), expeditionMap: map });
        assert.equal(new Set(paths.flat()).size, map.points.length);
        const byId = new Map(map.points.map(point => [point.id, point]));
        const room = id => nodes[pointRoomId(byId.get(id))];
        assert.ok(model.points.every(point => point.title === room(point.id).title));
        assert.deepEqual(new Set(model.points.map(point => point.icon)), new Set(['scavenge', 'battle', 'elite', 'rest']));
        assert.equal(model.points.filter(p => p.icon === 'rest').length, ASHEN_ROOM_TARGETS.rest + 2);
        assert.equal(model.points.filter(p => p.icon === 'elite').length, ASHEN_ROOM_TARGETS.elite);
        assert.equal(room('lampCourt').icon, 'battle');
        assert.equal(model.points.filter(p => p.icon === 'scavenge').length, ASHEN_ROOM_TARGETS.salvage + 1);
        assert.ok(map.points.slice(1).filter(point => point.next.length > 1).length >= 2);
        assert.ok(map.points.filter(p => p.layer === 1).every(p => room(p.id).icon === 'battle'));
        assert.ok(map.points.filter(p => p.layer < 5).every(p => room(p.id).icon !== 'elite'));
        for (const { id, layer, next } of map.points) {
            assert.ok(next.every(id => byId.get(id).layer === layer + 1));
            const special = next.map(id => room(id).icon).filter(icon => icon !== 'battle');
            assert.equal(new Set(special).size, special.length);
            if (room(id).icon === 'rest' || room(id).icon === 'elite') assert.ok(!special.includes(room(id).icon));
        }
        for (const path of paths) {
            assert.equal(path.length, 17);
            assert.equal(path[10], 'leeAlcove');
            assert.equal(path[15], 'innerAlcove');
            assert.equal(path[16], 'lampCourt');
        }
    }
    assert.ok(counts.size > 1);
});

test('the same ten ordinary formations can open, interrupt or end a run, while elites have a separate pool', () => {
    install();
    const seeds = [1, 2, 4, 8, 10, 14, 18, 22, 24, 28];
    const draws = seeds.map(seed => start(new GameSession(seed)).game.exportState().randomState);
    const checkpoint = start(new GameSession(1)).game.exportState();
    const map = checkpoint.expeditionMap;
    const paths = walkablePaths(map);
    const nodes = ASHEN_LABYRINTH_SCENARIO.nodes;
    const middle = map.points.find(p => p.layer >= 6 && p.layer <= 12 && nodes[pointRoomId(p)].icon === 'battle');
    const elite = map.points.find(p => nodes[pointRoomId(p)].icon === 'elite');
    const singles = ['ash-moth', 'stone-claw', 'veil-idol', 'stymphalian-bird', 'cyclops',
        'minotaur', 'hydra', 'charybdis', 'symplegades'];
    const ordinary = new Set([...singles, 'stymphalian-bird,stymphalian-bird']);
    for (const id of ['lampPassage', middle.id, 'lampCourt', elite.id]) {
        const path = paths.find(route => route.includes(id));
        const encountered = new Set();
        for (const randomState of draws) {
            const before = structuredClone(checkpoint);
            before.visited = path.slice(0, path.indexOf(id));
            delete before.expeditionMap.deferredRewards;
            before.randomState = randomState;
            const game = SurvivalGame.fromState(before);
            ok(game.enterNode(id));
            const saved = game.exportState();
            const battle = saved.battle;
            encountered.add([battle.enemy, ...(battle.companions ?? []).map(bird => bird.enemy)].join(','));
            assert.deepEqual(SurvivalGame.fromState(saved).exportState(), saved);
            const invalid = structuredClone(saved);
            invalid.battle.enemy = id === elite.id ? 'stone-claw' : 'gate-warden';
            assert.throws(() => SurvivalGame.fromState(invalid), /active map battle/);
        }
        assert.deepEqual(encountered, id === elite.id ? new Set(['gate-warden']) : ordinary);
    }
});

test('the hearth previews the saved connections in the rest and map screens without changing them', () => {
    install();
    const session = startLegacy();
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
    const session = startLegacy();
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

test('a battle always offers combat cards, using the configured pool when available', () => {
    for (const pool of [[], ['lab_valve', 'lab_bracelet'], ['lab_bypass', 'lab_probe', 'lab_clip', 'lab_vent']]) {
        const s = encounter(pool);
        assert.equal(s.view.battle.discovery, undefined);
        finishBattle(s);
        const expected = pool.length ? pool : [s.game.content.catalog.fixedReward];
        const reward = s.view.rewards, before = s.view.cards.length;
        assert.ok(reward.discovery && reward.supplyTaken);
        assert.equal(reward.cards.length, Math.min(3, expected.length));
        assert.ok(reward.cards.every((id) => expected.includes(id)));
        const kind = reward.cards[0];
        assert.equal(s.execute({ type: 'discover', kind: 'lab_press' }).ok, false);
        ok(s.execute({ type: 'discover', kind }));
        assert.equal(s.execute({ type: 'discover', kind }).ok, false);
        assert.equal(s.view.cards.length, before + 1);
        if (s.view.rewards) assert.equal(s.view.content.cards[s.view.rewards.cards[0]].role, 'supply');
    }
});

test('salvage still offers a material card when every authored material is retired', () => {
    const data = supplyFixture();
    for (const card of data.cards) if (card.role === 'supply') card.reward = false;
    catalog.installCatalog(data);
    const repo = new SaveRepository(store());
    const s = new GameSession(17, repo);
    ok(s.execute({ type: 'start', tier: 'standard' }));
    ok(s.execute({ type: 'enter-node', id: 'threshold' }));
    assert.deepEqual(s.view.rewards.cards, [catalog.LABYRINTH_SPARE_PARTS]);
    assert.deepEqual(new GameSession(1, repo).view.rewards, s.view.rewards);
    ok(s.execute({ type: 'discover', kind: catalog.LABYRINTH_SPARE_PARTS }));
    assert.equal(s.view.carriedCards.at(-1).kind, catalog.LABYRINTH_SPARE_PARTS);
    assert.ok(new GameSession(1, repo).restored);
});

test('room offers can be switched, parked and reclaimed after reload without repeating the payout', () => {
    install(['lab_valve', 'lab_bracelet']);
    let s, repo;
    for (let seed = 1; seed <= 32; seed++) {
        repo = new SaveRepository(store());
        s = new GameSession(seed, repo);
        ok(s.execute({ type: 'start', tier: 'standard' }));
        ok(s.execute({ type: 'enter-node', id: 'threshold' }));
        if (s.view.rewards.nextCards) break;
    }
    const original = structuredClone(s.view.rewards);
    assert.equal(s.view.content.cards[original.cards[0]].role, 'supply');
    assert.deepEqual(original.nextCards.slice().sort(), ['lab_bracelet', 'lab_valve']);
    const supplies = s.view.supplies;
    const random = s.game.exportState().randomState;
    ok(s.execute({ type: 'switch-room-reward' }));
    assert.deepEqual(s.view.rewards.cards, original.nextCards);
    assert.deepEqual(s.view.rewards.nextCards, original.cards);
    const switched = structuredClone(s.view.rewards);
    ok(s.execute({ type: 'discover', kind: null }));
    assert.equal(s.view.phase, 'map');
    assert.deepEqual(s.view.expeditionMap.deferredRewards, switched);
    assert.equal(s.execute({ type: 'enter-node', id: 'lampCourt' }).ok, false);
    assert.deepEqual(routeMapModel(s.view).points.filter(p => p.resumeRewards).map(p => p.id), ['threshold']);
    const parked = s.game.exportState();
    s = new GameSession(324, repo);
    assert.ok(s.restored, s.startupMessage);
    assert.deepEqual(s.game.exportState(), parked);
    ok(s.execute({ type: 'enter-node', id: 'threshold' }));
    assert.deepEqual(s.view.rewards, switched);
    assert.equal(s.view.supplies, supplies);
    assert.equal(s.game.exportState().randomState, random);
    const battleChoice = switched.cards[0];
    ok(s.execute({ type: 'discover', kind: battleChoice }));
    ok(s.execute({ type: 'discover', kind: null }));
    s = new GameSession(1, repo);
    ok(s.execute({ type: 'enter-node', id: 'threshold' }));
    assert.deepEqual(s.view.rewards.cards, original.cards);
    assert.equal(s.view.rewards.nextCards, undefined);
    ok(s.execute({ type: 'discover', kind: original.cards[0] }));
    assert.deepEqual(s.view.visited, ['threshold']);
    assert.equal(s.view.cards.filter(card => card.found && card.kind === battleChoice).length, 1);
    assert.equal(s.view.carriedCards.filter(card => card.kind === original.cards[0]).length, 1);
    assert.equal(s.view.supplies, supplies);
    assert.equal(s.execute({ type: 'enter-node', id: 'threshold' }).ok, false);
});

test('moving to a connected room leaves its predecessor’s deferred reward behind', () => {
    install();
    let bonusSeen = false;
    let singleSeen = false;
    for (let seed = 1; seed <= 32 && !(bonusSeen && singleSeen); seed++) {
        const s = start(new GameSession(seed));
        const next = nextMapNodes(s.view.expeditionMap, 'threshold')[0];
        ok(s.execute({ type: 'enter-node', id: next }));
        assert.equal(s.view.expeditionMap.deferredRewards, undefined);
        assert.equal(s.execute({ type: 'enter-node', id: 'threshold' }).ok, false);
        finishBattle(s);
        const reward = s.view.rewards;
        assert.ok(reward.cards.length && reward.cards.every(kind => s.view.content.cards[kind].role !== 'supply'));
        if (reward.nextCards) {
            assert.equal(reward.nextCards.length, 1);
            assert.equal(s.view.content.cards[reward.nextCards[0]].role, 'supply');
            bonusSeen = true;
        } else singleSeen = true;
    }
    assert.ok(bonusSeen && singleSeen);
});

test('migrated weapons can be discovered and resume from the Maze autosave', () => {
    const pool = ['knife', 'shield_spear', 'dragon_slayer'];
    install(pool);
    const disk = store();
    const s = start(new GameSession(17, new SaveRepository(disk)));
    enter(s, 'battle');
    finishBattle(s);
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
    ok(resumed.execute({ type: 'enter-node', id: pending.rewards.source }));
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
    const session = start(new GameSession(1, new SaveRepository(disk)));
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

    const fresh = start(new GameSession(1));
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
