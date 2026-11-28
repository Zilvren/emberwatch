const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader } = require('../tools/load-ts.cjs');

const load = createLoader();
const from = (file) => load(path.resolve(__dirname, '../assets/game', file + '.ts'));
const { installCatalog } = from('core/content/CardCatalog');
const { SYNTHESIS_SCENARIO, ASHEN_LABYRINTH_SCENARIO } = from('core/content/GameScenario');
const { GameSession } = from('application/GameSession');
const { SaveRepository } = from('infrastructure/SaveRepository');
const { enterEncounterPreview } = from('presentation/dev/EncounterPreview');
const { cardViewModel } = from('presentation/cards/CardViewModel');
const source = require('../assets/resources/data/cards.json');

const ok = (result) => assert.ok(result.ok, result.message);
const fist = (name) => 'fist_' + name;
const temporary = (name) => fist(name) + '_temp';
const present = (pile, kind) => pile.find((card) => card.kind === kind);

function storage() {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function enter(disk, scenario = ASHEN_LABYRINTH_SCENARIO) {
    const session = new GameSession(17, new SaveRepository(disk), scenario);
    enterEncounterPreview(session);
    assert.equal(session.view.phase, 'battle');
    return session;
}

function encounter() {
    installCatalog(source);
    const disk = storage();
    const session = enter(disk);
    session.game.battle.hp = session.game.battle.maxHp = 100;
    return { session, disk };
}

function deal(session, hand, draw = [], discard = []) {
    const game = session.game;
    const card = (kind) => {
        const id = 'card-' + ++game.nextId;
        if (game.content.cards[kind].role === 'temporary') return { kind, id, temporary: true };
        game.cards.push({ kind, id, zone: 'base', selected: true, found: true });
        return { kind, id, origin: id, temporary: false };
    };
    Object.assign(game.battle, { hand: hand.map(card), draw: draw.map(card), discard: discard.map(card) });
    return game.battle;
}

const play = (session, kind) => {
    const card = present(session.game.battle.hand, kind);
    assert.ok(card, 'Missing ' + kind);
    ok(session.execute({ type: 'play-card', id: card.id }));
    assert.notEqual(session.saveStatus, '保存失败，请勿关闭', session.saveWarning);
};
const choose = (session, id = null) => {
    ok(session.execute({ type: 'resolve-combat-choice', id }));
    assert.notEqual(session.saveStatus, '保存失败，请勿关闭', session.saveWarning);
};
const skip = (session) => {
    if (session.view.battle.cardChoice) choose(session);
};
const endTurn = (session) => ok(session.execute({ type: 'end-turn' }));

test('authoring shares one finisher and generates variants with their own costs and keywords', () => {
    const { session } = encounter();
    const content = session.view.content;
    const costs = {
        one_two: [0, 1], parry_counter: [0, 1], triple: [0, 2], straight_three: [1, 2],
        chain_counter: [0, 2], straight_four: [0, 3], parry_four: [0, 3],
    };
    for (const [key, [combatCost, rewardCost]] of Object.entries(costs)) {
        const combat = content.cards[temporary(key)], reward = content.cards[fist(key)];
        assert.deepEqual([combat.cost, reward.cost], [combatCost, rewardCost]);
        assert.equal(combat.effect, reward.effect);
        assert.equal(combat.art, reward.art);
        assert.equal(reward.reward, false);
        assert.equal(reward.role, 'normal');
    }
    const formal = cardViewModel(content.cards[fist('left_hook')], content.cards, '体力', { field: true });
    const copy = cardViewModel(content.cards[temporary('left_hook')], content.cards, '体力', { field: true });
    assert.ok(formal.keywords.includes('连击'));
    assert.ok(copy.keywords.includes('本场临时'));
    assert.ok(!copy.keywords.includes('连击') && !copy.tag.includes('连击'));
    assert.equal(copy.artKey, formal.id);
    assert.match(formal.effect, /抽 1/);
    assert.ok(session.game.discoveryPool.includes(fist('breath')));
    assert.ok(!session.game.discoveryPool.includes(fist('straight_four')));
});

test('discoveries move owned instances or create one temporary move, and a combo upgrades at one id through a reload', () => {
    const { session, disk } = encounter();
    const b = deal(session,
        ['lab_press', fist('left_hook'), fist('straight')],
        ['lab_step', 'lab_open'], [fist('right_hook')]);
    const right = present(b.discard, fist('right_hook'));
    play(session, 'lab_press');
    play(session, fist('left_hook'));
    assert.equal(b.cardChoice.mode, 'deck-discovery');
    assert.equal(b.cardChoice.ids.length, 3);
    assert.ok(b.cardChoice.ids.includes(right.id));
    assert.equal(session.execute({ type: 'end-turn' }).ok, false);
    choose(session, right.id);
    assert.strictEqual(present(b.hand, right.kind), right);
    assert.ok(!present(b.discard, right.kind));
    play(session, right.kind);
    assert.equal(b.cardChoice.mode, 'fist-discovery');
    assert.equal(new Set(b.cardChoice.ids).size, 3);
    const finisher = present(b.hand, temporary('one_two'));
    const resumed = new GameSession(3, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(), session.game.exportState());
    const r = resumed.game.battle;
    const special = r.cardChoice.ids[0];
    choose(resumed, special);
    const discovered = present(r.hand, special);
    assert.ok(discovered.temporary && !discovered.origin);
    assert.ok(!resumed.view.cards.some((card) => card.id === discovered.id));
    play(resumed, fist('straight'));
    assert.equal(present(r.hand, temporary('straight_three')).id, finisher.id);
    skip(resumed);
    assert.deepEqual(resumed.game.fistUnlocks, [fist('one_two'), fist('straight_three')]);
});

test('a full hand puts the finisher on top, and the next distinct move upgrades that same card', () => {
    const { session } = encounter();
    const b = deal(session, ['lab_open', fist('right_hook'), fist('left_hook'),
        temporary('uppercut'), 'lab_step', 'lab_anchor'],
    ['lab_screen', 'lab_clip', 'lab_cell']);
    play(session, 'lab_open');
    play(session, fist('right_hook'));
    assert.equal(b.cardChoice.mode, 'deck-discovery');
    choose(session, b.cardChoice.ids.find((id) => b.discard.some((card) => card.id === id)));
    assert.equal(b.hand.length, 6);
    play(session, fist('left_hook'));
    assert.equal(b.hand.length, 6);
    assert.equal(b.draw[0].kind, temporary('one_two'));
    const id = b.draw[0].id;
    const special = b.cardChoice.ids[0];
    choose(session, special);
    assert.equal(b.draw[0].kind, special);
    play(session, temporary('uppercut'));
    assert.deepEqual(present(b.draw, temporary('triple')), { id, kind: temporary('triple'), temporary: true });
    assert.equal(b.cardChoice, undefined);
    endTurn(session);
    assert.equal(b.fist.finisherId, undefined);
    assert.ok([...b.hand, ...b.draw, ...b.discard].some((card) => card.id === id));
});

test('repeats, incompatible moves and support end a segment while old finishers can still be used', () => {
    const { session } = encounter();
    const b = deal(session, [temporary('left_hook'), temporary('straight'), temporary('parry'),
        temporary('right_hook'), temporary('right_hook'), fist('stance')], [fist('uppercut'), fist('left_hook')]);
    play(session, temporary('left_hook'));
    play(session, temporary('straight'));
    const first = present(b.hand, temporary('one_two')) ?? present(b.draw, temporary('one_two'));
    play(session, temporary('parry'));
    assert.deepEqual(b.fist.moves, ['parry']);
    play(session, temporary('right_hook'));
    assert.ok(present(b.hand, temporary('parry_counter')));
    play(session, temporary('right_hook'));
    assert.deepEqual(b.fist.moves, ['right-hook']);
    const removedFromDraw = b.draw.find((card) => card.kind.startsWith('fist_'));
    play(session, fist('stance'));
    assert.deepEqual(b.fist.moves, []);
    assert.ok(b.hand.some((card) => card.id === removedFromDraw.id));
    assert.ok([...b.hand, ...b.draw].some((card) => card.id === first.id));
    assert.ok(!b.discard.some((card) => card.kind === temporary('left_hook')));
    endTurn(session);
    assert.ok([...b.hand, ...b.draw, ...b.discard].some((card) => card.kind === temporary('parry_counter')));
});

test('parry finisher reflects full incoming damage or uses fixed damage, and only triggers this turn', () => {
    for (const [incoming, received, counter] of [[7, 0, 9], [8, 1, 4]]) {
        const { session } = encounter();
        const b = deal(session, [temporary('left_hook'), temporary('parry'), temporary('right_hook')]);
        b.attack = incoming;
        for (const name of ['left_hook', 'parry', 'right_hook', 'chain_counter']) play(session, temporary(name));
        assert.equal(b.block, 7);
        assert.deepEqual(b.fist.counters, [temporary('chain_counter')]);
        endTurn(session);
        assert.equal(session.view.health, 10 - received);
        assert.equal(b.hp, 100 - 4 - counter);
        assert.deepEqual(b.fist.counters, []);
        assert.equal(b.block, 0);
    }
    const { session } = encounter();
    const b = deal(session, [temporary('parry_counter')]);
    b.enemySequence = { actions: ['prepare', 'attack'], index: 0, loopStart: 0 };
    b.intent = 'prepare';
    play(session, temporary('parry_counter'));
    endTurn(session);
    assert.equal(b.hp, 100);
    assert.deepEqual(b.fist.counters, []);
});

test('each straight-four stack adds damage per hit, and parry-four grants block once per fist card', () => {
    const { session } = encounter();
    const b = deal(session, [temporary('straight_four'), temporary('straight_four'), temporary('parry_four'),
        temporary('parry_four'), temporary('triple'), 'lab_press']);
    b.gainedStrength = 1;
    play(session, temporary('straight_four'));
    assert.deepEqual([b.hp, b.fist.damageBonus], [86, 1]);
    play(session, temporary('straight_four'));
    assert.deepEqual([b.hp, b.fist.damageBonus], [70, 2]);
    play(session, temporary('parry_four'));
    assert.deepEqual([b.block, b.fist.blockBonus], [4, 1]);
    play(session, temporary('parry_four'));
    assert.deepEqual([b.block, b.fist.blockBonus], [9, 2]);
    play(session, temporary('triple'));
    assert.deepEqual([b.hp, b.block], [55, 11]);
    play(session, 'lab_press');
    assert.deepEqual([b.hp, b.block], [50, 11]);
    endTurn(session);
    assert.deepEqual([b.fist.damageBonus, b.fist.blockBonus], [2, 2]);
});

test('targeted support is atomic, round-trips while awaiting a choice and shares the stamina limit per turn', () => {
    for (const [targetKind, gain] of [[fist('parry'), 1], [temporary('parry'), 2]]) {
        const { session, disk } = encounter();
        const b = deal(session, [fist('breath'), fist('breath'), targetKind, fist('switch'), temporary('straight_three')]);
        const startStamina = b.stamina;
        play(session, fist('breath'));
        assert.equal(b.cardChoice.mode, 'recover-stamina');
        assert.deepEqual(b.cardChoice.ids, [present(b.hand, targetKind).id]);
        const resumed = new GameSession(19, new SaveRepository(disk));
        assert.ok(resumed.restored, resumed.startupMessage);
        const r = resumed.game.battle;
        assert.deepEqual(r.cardChoice, b.cardChoice);
        choose(resumed);
        assert.equal(r.stamina, startStamina);
        assert.equal(r.hand.length, 5);
        play(resumed, fist('breath'));
        const id = r.cardChoice.ids[0];
        choose(resumed, id);
        assert.equal(r.stamina, startStamina + gain);
        assert.ok(![...r.hand, ...r.draw, ...r.discard].some((card) => card.id === id));
        assert.equal(resumed.view.cards.some((card) => card.id === id), gain === 1);
        assert.match(resumed.view.cardBlocked(present(r.hand, fist('breath'))), /本回合已使用/);
    }
    const { session } = encounter();
    const b = deal(session, [fist('switch'), fist('straight'), fist('follow'), temporary('one_two')], [
        'lab_press', 'lab_step', 'lab_anchor',
    ]);
    play(session, fist('switch'));
    choose(session, b.cardChoice.ids[0]);
    assert.ok(present(b.discard, fist('straight')));
    assert.ok(present(b.hand, temporary('parry')));
    assert.match(session.view.cardBlocked(present(b.hand, fist('follow'))), /临时收招/);
    play(session, temporary('one_two'));
    play(session, fist('follow'));
    assert.equal(b.stamina, b.maxStamina - 1);
    assert.equal(b.hand.length, 4);
});

test('the highest finisher unlock is guaranteed on a counter win and the reward copy survives reload', () => {
    const { session, disk } = encounter();
    const b = deal(session, ['left_hook', 'right_hook', 'uppercut', 'parry'].map(temporary));
    b.hp = 14;
    b.attack = 7;
    for (const name of ['left_hook', 'right_hook', 'uppercut', 'parry']) play(session, temporary(name));
    assert.deepEqual(session.game.fistUnlocks, [fist('one_two'), fist('triple'), fist('parry_four')]);
    play(session, temporary('parry_four'));
    endTurn(session);
    assert.equal(session.view.phase, 'rewards');
    assert.equal(session.view.rewards.guaranteedFinisher, fist('parry_four'));
    assert.equal(session.view.rewards.cards[0], fist('parry_four'));
    assert.ok(!session.view.rewards.cards.includes(fist('one_two')));
    const resumed = new GameSession(55, new SaveRepository(disk));
    assert.ok(resumed.restored, resumed.startupMessage);
    ok(resumed.execute({ type: 'discover', kind: fist('parry_four') }));
    assert.ok(resumed.view.cards.some((card) => card.kind === fist('parry_four')));
    assert.ok(!resumed.view.cards.some((card) => card.kind.endsWith('_temp')));
    ok(resumed.execute({ type: 'new-game' }));
    assert.equal(resumed.game.fistUnlocks, undefined);
});

test('a synthesis exploration saved with the pre-fist catalog resumes with the new catalog', () => {
    const previous = structuredClone(source);
    previous.cards = previous.cards.filter((card) => !card.fist);
    const previousIds = new Set(previous.cards.map(card => card.id));
    previous.labyrinth.discoveryPool = previous.labyrinth.discoveryPool.filter(id => previousIds.has(id));
    installCatalog(previous);
    const disk = storage();
    const old = new GameSession(53, new SaveRepository(disk), SYNTHESIS_SCENARIO);
    ok(old.execute({ type: 'start', tier: 'standard' }));
    const expected = old.game.exportState();
    installCatalog(source);
    const resumed = new GameSession(44, new SaveRepository(disk), SYNTHESIS_SCENARIO);
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(), expected);
});
