const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path'),
    fs = require('node:fs');
const root = path.resolve(__dirname, '..'),
    load = require('../tools/load-ts.cjs').createLoader();
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
catalog.installCatalog(
    JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/data/cards.json'), 'utf8'))
);
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { ENTRY_TIERS } = load(path.join(root, 'assets/game/core/content/EntryTiers.ts'));
const { SaveRepository } = load(path.join(root, 'assets/game/infrastructure/SaveRepository.ts'));
const { validateGameState } = load(path.join(root, 'assets/game/core/state/GameState.ts'));
const { FIELD_SCENARIO, STAMINA_SCENARIO, TUTORIAL_SCENARIO } =
    load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
const ok = (result) => assert.equal(result.ok, true, result.message);
const storage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
};
function encounter(tier = 'standard', repo) {
    const session = new GameSession(17, repo, FIELD_SCENARIO);
    ok(session.execute({ type: 'start', tier }));
    ok(session.execute({ type: 'enter-node' }));
    ok(session.execute({ type: 'choose-route', route: 'A' }));
    ok(session.execute({ type: 'enter-node' }));
    ok(session.execute({ type: 'discover', kind: null }));
    return session;
}
function paidUtility(session) {
    for (let turn = 0; turn < 3; turn++) {
        const card = session.game.battle.hand.find(
            (c) =>
                session.game.content.cards[c.kind].cost > 0 &&
                session.game.content.cards[c.kind].effect.type !== 'damage' &&
                !session.game.cardBlocked(c)
        );
        if (card) return card;
        ok(session.execute({ type: 'end-turn' }));
    }
    throw Error('No utility card drawn');
}

test('new sessions use stamina and charge the selected tier once before exploration', () => {
    for (const id of ['emergency', 'low', 'standard', 'high']) {
        const session = new GameSession(17);
        session.game.supplies = 20;
        const tier = ENTRY_TIERS[id];
        ok(session.execute({ type: 'start', tier: id }));
        assert.equal(session.game.entryTier, id);
        assert.equal(session.game.supplies, 20 - tier.cost);
        const before = session.game.exportState();
        assert.equal(session.execute({ type: 'start', tier: id }).ok, false);
        assert.deepEqual(session.game.exportState(), before);
        ok(session.execute({ type: 'enter-node' }));
        ok(session.execute({ type: 'choose-route', route: 'A' }));
        ok(session.execute({ type: 'enter-node' }));
        assert.equal(session.game.battle.stamina, tier.stamina);
        assert.equal(session.game.battle.maxStamina, tier.stamina);
    }
});
test('unaffordable and unknown tiers cannot partially charge or start', () => {
    const session = new GameSession(17),
        before = session.game.exportState();
    assert.equal(session.execute({ type: 'start', tier: 'high' }).ok, false);
    assert.deepEqual(session.game.exportState(), before);
    assert.equal(session.execute({ type: 'start', tier: '__proto__' }).ok, false);
    assert.deepEqual(session.game.exportState(), before);
});
test('zero supplies can use the emergency tier and do not cause in-map supply failure', () => {
    const session = new GameSession(17, undefined, FIELD_SCENARIO);
    session.game.supplies = 0;
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    ok(session.execute({ type: 'enter-node' }));
    assert.equal(session.game.phase, 'map');
    assert.equal(session.game.supplies, 4);
    ok(session.execute({ type: 'choose-route', route: 'A' }));
    ok(session.execute({ type: 'enter-node' }));
    assert.equal(session.game.battle.maxStamina, 1);
});
test('paid cards consume stamina without spending supplies or freeing carry space', () => {
    const session = encounter(),
        card = paidUtility(session),
        game = session.game,
        battle = game.battle;
    const points = game.supplies,
        weight = game.baseWeight,
        stamina = battle.stamina,
        cost = game.content.cards[card.kind].cost;
    ok(session.execute({ type: 'play-card', id: card.id }));
    assert.equal(battle.stamina, stamina - cost);
    assert.equal(game.supplies, points);
    assert.equal(game.baseWeight, weight);
});
test('insufficient stamina blocks the whole action while zero-cost cards remain usable', () => {
    const session = encounter(),
        game = session.game;
    game.battle.stamina = 0;
    const costly = game.battle.hand.find((c) => game.content.cards[c.kind].cost > 0),
        before = game.exportState();
    assert.equal(session.execute({ type: 'play-card', id: costly.id }).ok, false);
    assert.deepEqual(game.exportState(), before);
    const free = game.battle.hand.find((c) => game.content.cards[c.kind].cost === 0);
    ok(session.execute({ type: 'play-card', id: free.id }));
    assert.equal(game.battle.stamina, 0);
});
test('unused stamina never carries into the next turn', () => {
    const session = encounter('low');
    session.game.battle.stamina = 1;
    const supplies = session.game.supplies;
    ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.game.battle.stamina, 2);
    assert.equal(session.game.battle.maxStamina, 2);
    assert.equal(session.game.supplies, supplies);
});
test('supply points have no exploration weight and rewards are not discarded for bag capacity', () => {
    const session = new GameSession(17, undefined, FIELD_SCENARIO),
        weight = session.game.baseWeight;
    session.game.supplies = 200;
    assert.equal(session.game.baseWeight, weight);
    ok(session.execute({ type: 'start', tier: 'standard' }));
    const before = session.game.supplies;
    ok(session.execute({ type: 'enter-node' }));
    assert.equal(session.game.supplies, before + 4);
    assert.equal(session.game.baseWeight, weight);
    assert.equal(session.execute({ type: 'discard-supplies', amount: 1 }).ok, false);
    assert.equal(session.execute({ type: 'claim-supplies' }).ok, false);
});
test('reload preserves spent stamina and chosen tier instead of granting a fresh turn', () => {
    const store = storage(),
        repo = new SaveRepository(store),
        session = encounter('standard', repo),
        card = paidUtility(session);
    ok(session.execute({ type: 'play-card', id: card.id }));
    const saved = session.game.exportState(),
        continued = new GameSession(99, new SaveRepository(store));
    assert.equal(continued.restored, true);
    assert.deepEqual(continued.game.exportState(), saved);
    assert.equal(continued.game.entryTier, 'standard');
});
test('invalid stamina budgets and missing active-run tiers are rejected', () => {
    const session = encounter(),
        bad = session.game.exportState();
    bad.battle.stamina = 4;
    assert.throws(() => validateGameState(bad), /stamina/);
    bad.battle.stamina = 1;
    bad.battle.maxStamina = 4;
    assert.throws(() => validateGameState(bad), /maxStamina/);
    bad.battle.maxStamina = 3;
    bad.entryTier = null;
    assert.throws(() => validateGameState(bad), /entry tier/);
});
test('legacy saves retain their rules until an explicitly confirmed new game', () => {
    const store = storage(),
        legacy = new GameSession(17, new SaveRepository(store), TUTORIAL_SCENARIO);
    ok(legacy.execute({ type: 'start' }));
    const continued = new GameSession(99, new SaveRepository(store));
    assert.equal(continued.game.scenario.ruleset, 'tutorial-v1');
    assert.match(continued.startupMessage, /旧规则/);
    ok(continued.execute({ type: 'new-game' }));
    assert.equal(continued.game.scenario.ruleset, 'stamina-v1');
    assert.equal(continued.game.entryTier, null);
});

test('stamina return advances time once and repair can spend the last supply without a daily fee', () => {
    const session = new GameSession(17, undefined, STAMINA_SCENARIO),
        game = session.game;
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    // A completed expedition fixture; returning still goes through the application clock.
    game.fixedDone = true;
    game.route = 'A';
    game.pathIndex = game.scenario.routes.A.length;
    game.supplies = 1;
    game.health = 3;
    session.advanceTime(1);
    assert.equal(game.phase, 'journal');
    assert.equal(game.day, 2);
    ok(session.execute({ type: 'continue-journal' }));
    ok(session.execute({ type: 'repair' }));
    assert.equal(game.health, 10);
    assert.equal(game.supplies, 0);
    assert.equal('dailySpent' in game.settlement, false);
    const settled = game.exportState();
    assert.equal(session.execute({ type: 'finish-day' }).ok, false);
    assert.deepEqual(game.exportState(), settled);
});
