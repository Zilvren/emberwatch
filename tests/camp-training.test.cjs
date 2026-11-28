const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const from = file => load(path.resolve(__dirname, '../assets/game', file + '.ts'));
const { installCatalog } = from('core/content/CardCatalog');
const source = require('../assets/resources/data/cards.json');
installCatalog(source);
const { GameSession } = from('application/GameSession');
const { SurvivalGame } = from('core/SurvivalGame');
const { TUTORIAL_SCENARIO } = from('core/content/GameScenario');
const ok = result => assert.ok(result.ok, result.message);
const learn = (session, id) => session.execute({ type: 'learn-camp-skill', id });
const buy = (session, kind) => session.execute({ type: 'buy-keeper-card', kind });

function battle(session) {
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    ok(session.execute({ type: 'enter-node', id: 'threshold' }));
    ok(session.execute({ type: 'enter-node', id: 'lampPassage' }));
}

test('camp skills spend supplies once, enforce prerequisites, and survive reload, defeat and retry', () => {
    const session = new GameSession(17);
    const initial = session.game.exportState();
    assert.equal(SurvivalGame.fromState(initial).campSkills, undefined);
    assert.equal(learn(session, 'guard').ok, false);
    assert.deepEqual(session.game.exportState(), initial);
    ok(learn(session, 'footing'));
    ok(learn(session, 'guard'));
    const checkpoint = session.game.exportState();
    assert.equal(checkpoint.supplies, 2);
    assert.equal(learn(session, 'guard').ok, false);
    assert.equal(learn(session, 'initiative').ok, false);
    assert.deepEqual(session.game.exportState(), checkpoint);
    const restored = SurvivalGame.fromState(checkpoint);
    assert.deepEqual(restored.campSkills, ['footing', 'guard']);
    assert.throws(() => SurvivalGame.fromState({ ...checkpoint, campSkills: ['guard'] }));
    assert.throws(() => SurvivalGame.fromState({ ...checkpoint, campSkills: ['footing', 'footing'] }));
    battle(session);
    assert.equal(session.view.battle.block, 3);
    assert.equal(session.view.battle.hand.length, 5);
    assert.equal(learn(session, 'initiative').ok, false);
    while (session.view.phase === 'battle') ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.phase, 'failure');
    ok(session.execute({ type: 'retry' }));
    assert.deepEqual(session.view.campSkills, checkpoint.campSkills);
    assert.deepEqual(SurvivalGame.fromState(session.game.exportState()).campSkills, checkpoint.campSkills);
    ok(session.execute({ type: 'new-game' }));
    assert.equal(session.view.campSkills, undefined);
});

test('initiative adds one opening card and other campaigns cannot learn or trade at the gate', () => {
    const session = new GameSession(17);
    ok(learn(session, 'footing'));
    ok(learn(session, 'initiative'));
    battle(session);
    assert.equal(session.view.battle.hand.length, 6);
    assert.equal(session.view.battle.block, 1);
    ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.battle.hand.length, 5);
    const legacy = new GameSession(17, undefined, TUTORIAL_SCENARIO);
    assert.equal(learn(legacy, 'footing').ok, false);
    assert.equal(buy(legacy, 'lab_damper').ok, false);
});

test('the keeper sells only enabled cards and refuses duplicate or unaffordable purchases', (t) => {
    const catalog = structuredClone(source);
    t.after(() => installCatalog(source));
    catalog.labyrinth.discoveryPool = ['fist_left_hook'];
    installCatalog(catalog);
    const restricted = new GameSession(17);
    assert.equal(buy(restricted, 'lab_damper').ok, false);
    assert.equal(restricted.view.supplies, 10);
    ok(buy(restricted, 'fist_left_hook'));
    catalog.labyrinth.discoveryPool.push('lab_damper');
    installCatalog(catalog);
    const session = new GameSession(17);
    ok(buy(session, 'lab_damper'));
    const packed = session.game.exportState();
    assert.equal(packed.supplies, 8);
    const purchase = packed.cards.find(card => card.kind === 'lab_damper');
    assert.ok(purchase?.selected);
    assert.equal(buy(session, 'lab_damper').ok, false);
    assert.equal(buy(session, 'not-on-the-stall').ok, false);
    assert.deepEqual(session.game.exportState(), packed);
    assert.deepEqual(SurvivalGame.fromState(packed).exportState(), packed);
    session.game.supplies = 1;
    assert.equal(buy(session, 'fist_left_hook').ok, false);
    battle(session);
    assert.ok([...session.view.battle.draw, ...session.view.battle.hand].some(card => card.origin === purchase.id));
    assert.equal(buy(session, 'fist_left_hook').ok, false);
});
