const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const from = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const catalog = from('core/content/CardCatalog');
const { ASHEN_LABYRINTH_SCENARIO, FIELD_SCENARIO, RUN_DECK_SCENARIO } = from('core/content/GameScenario');
const { GameSession } = from('application/GameSession');
const { SaveRepository } = from('infrastructure/SaveRepository');
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
    ok(s.execute({ type: 'choose-route', route }));
    return s;
}
function encounter(enabled) {
    install(enabled);
    const s = start(new GameSession(17));
    ok(s.execute({ type: 'enter-node' }));
    return s;
}
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

test('an actual new game has the approved 12 cards and ten reachable locations on two routes', () => {
    install();
    for (const lane of ['A', 'B']) {
        const s = new GameSession(17);
        assert.equal(s.view.scenario.id, 'ashen-labyrinth');
        assert.equal(s.view.cards.length, 12);
        assert.equal(s.view.currentJournal.title, '灰里的门槛');
        const points = routeMapModel(s.view).points.filter((point) => point.kind !== 'home');
        assert.equal(points.length, 10);
        assert.equal(new Set(points.map((point) => point.kind)).size, 10);
        start(s, 'standard', lane);
        while (s.view.phase === 'map' && s.view.currentNode !== 'return') {
            ok(s.execute({ type: 'enter-node' }));
            if (s.view.battle) finishBattle(s);
            if (s.view.phase === 'rewards') ok(s.execute({ type: 'discover', kind: s.view.rewards.cards[0] }));
            if (s.view.phase === 'rest') ok(s.execute({ type: 'finish-rest' }));
        }
        assert.equal(s.view.visited.length, lane === 'A' ? 8 : 7);
        s.advanceTime(1);
        assert.equal(s.view.day, 2);
        assert.equal(s.view.currentJournal.id, 'labyrinth-cleared');
        assert.equal(s.view.cards.length, 12);
        assert.ok(s.view.settlement.discoveredCards > 0);
    }
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
        ok(s.execute({ type: 'enter-node' }));
        assert.ok(s.view.rewards.cards.every((id) => pool.includes(id)));
        ok(s.execute({ type: 'discover', kind: null }));
        ok(s.execute({ type: 'enter-node' }));
        assert.ok([...s.view.battle.hand, ...s.view.battle.draw].some((c) => c.kind === kind));
    }
});

test('an open offer and the in-progress pool resume when the editor selection changes', () => {
    install(['calibration']);
    const disk = store();
    const s = start(new GameSession(22, new SaveRepository(disk)));
    ok(s.execute({ type: 'enter-node' }));
    finishBattle(s);
    const pending = s.game.exportState();
    install(['defer']);
    const resumed = new GameSession(4, new SaveRepository(disk));
    assert.ok(resumed.restored);
    assert.deepEqual(resumed.game.exportState(), pending);
    ok(resumed.execute({ type: 'discover', kind: null }));
    ok(resumed.execute({ type: 'enter-node' }));
    assert.deepEqual(resumed.view.rewards.cards.slice().sort(), pending.discoveryPool.slice().sort());
    ok(resumed.execute({ type: 'new-game' }));
    ok(resumed.execute({ type: 'start', tier: 'standard' }));
    assert.ok(resumed.game.discoveryPool.includes('lab_vent'));
    assert.ok(!resumed.game.discoveryPool.includes('lab_valve'));
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
    const hash = (data) => {
        const text = JSON.stringify(data);
        let result = 2166136261;
        for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
        return (result >>> 0).toString(16);
    };
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
