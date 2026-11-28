const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const from = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const catalog = from('core/content/CardCatalog');
const raw = require('../assets/resources/data/cards.json');
catalog.installCatalog(raw);
const { GameSession } = from('application/GameSession');
const { SurvivalGame } = from('core/SurvivalGame');
const { FIELD_SCENARIO, STAMINA_SCENARIO } = from('core/content/GameScenario');
const { SaveRepository } = from('infrastructure/SaveRepository');
const ok = (result) => assert.equal(result.ok, true, result.message);
function encounter(route = 'A') {
    const s = new GameSession(17, undefined, FIELD_SCENARIO);
    ok(s.execute({ type: 'start', tier: 'standard' }));
    ok(s.execute({ type: 'enter-node' }));
    ok(s.execute({ type: 'choose-route', route }));
    if (route === 'B') {
        ok(s.execute({ type: 'enter-node' }));
        ok(s.execute({ type: 'enter-node' }));
        ok(s.execute({ type: 'finish-rest' }));
    }
    ok(s.execute({ type: 'enter-node' }));
    return s;
}
test('the field deal has 20 base cards, leaves a hand slot, and pauses until the saved offer resolves once', () => {
    const s = encounter(),
        g = s.game,
        b = g.battle,
        snapshot = g.exportState();
    assert.equal(g.cards.length, 20);
    assert.equal(g.usableCards.length, 20);
    assert.equal(b.hand.length, 5);
    assert.equal(b.draw.length, 15);
    assert.equal(g.baseWeight, 0);
    assert.deepEqual(SurvivalGame.fromState(snapshot).exportState(), snapshot);
    assert.equal(s.execute({ type: 'end-turn' }).ok, false);
    assert.equal(s.execute({ type: 'play-card', id: b.hand[0].id }).ok, false);
    assert.equal(s.execute({ type: 'discover', kind: 'cash' }).ok, false);
    assert.deepEqual(g.exportState(), snapshot);
    const kind = b.discovery[0];
    ok(s.execute({ type: 'discover', kind }));
    assert.equal(b.hand.length, 6);
    assert.equal(b.hand[5].kind, kind);
    assert.ok(g.cards.some((c) => c.id === b.hand[5].origin && c.found));
    const claimed = g.exportState();
    assert.equal(s.execute({ type: 'discover', kind }).ok, false);
    assert.deepEqual(g.exportState(), claimed);
    assert.equal(b.stamina, 3);
    for (const type of ['toggle-card', 'discard-card'])
        assert.equal(s.execute({ type, id: g.cards[0].id }).ok, false);
});
test('at full hand a discovery goes to the top, and skipping leaves the stack and stamina untouched', () => {
    const s = encounter(),
        b = s.game.battle;
    b.hand.push(b.draw.shift());
    const kind = b.discovery[0];
    ok(s.execute({ type: 'discover', kind }));
    assert.equal(b.hand.length, 6);
    assert.equal(b.draw[0].kind, kind);
    const top = b.draw[0].id;
    ok(s.execute({ type: 'end-turn' }));
    assert.equal(b.hand[0].id, top);
    const alt = encounter(),
        before = alt.game.exportState();
    ok(alt.execute({ type: 'discover', kind: null }));
    assert.deepEqual(alt.game.battle.hand, before.battle.hand);
    assert.equal(alt.game.battle.stamina, before.battle.stamina);
    assert.deepEqual(alt.game.cards, before.cards);
});
test('an exposed rotor offers a persistent mid-turn choice once; a kill finishes and credits supplies once', () => {
    const s = encounter('B'),
        g = s.game,
        b = g.battle;
    ok(g.discover(null));
    function stageHit() {
        const c = b.draw.concat(b.hand, b.discard).find((c) => c.kind === 'attack');
        b.draw = b.draw.filter((x) => x.id !== c.id);
        b.discard = b.discard.filter((x) => x.id !== c.id);
        b.hand = b.hand.filter((x) => x.id !== c.id);
        b.hand.unshift(c);
        return c.id;
    }
    b.hp = 14;
    ok(g.play(stageHit()));
    assert.equal(b.hp, 12);
    assert.equal(b.coreExposed, true);
    assert.equal(b.discovery.length, 3);
    assert.deepEqual(SurvivalGame.fromState(g.exportState()).battle.discovery, b.discovery);
    ok(g.discover(null));
    ok(g.play(stageHit()));
    assert.equal(b.discovery, undefined);
    b.hp = 1;
    const bank = g.supplies;
    ok(g.play(stageHit()));
    assert.equal(g.phase, 'map');
    assert.equal(g.supplies, bank + 3);
    assert.equal(g.claimSupplies().ok, false);
    assert.equal(g.endTurn().ok, false);
});
test('combo, cover and generated cards follow the shown conditions on the same turn', () => {
    const g = encounter().game,
        b = g.battle;
    ok(g.discover(null));
    const give = (id, kind, temporary = false) => b.hand.push({ id, kind, temporary });
    b.hp = b.maxHp = 80;
    b.hand = [];
    b.draw = [];
    b.discard = [];
    assert.equal(g.attackDamage('follow_up'), 2);
    give('a', 'attack');
    ok(g.play('a'));
    assert.equal(g.attackDamage('follow_up'), 6);
    give('f', 'follow_up');
    ok(g.play('f'));
    assert.equal(b.hp, 72);
    assert.equal(g.attackDamage('shield_push'), 3);
    give('e', 'evade');
    ok(g.play('e'));
    assert.equal(g.attackDamage('shield_push'), 6);
    give('p', 'shield_push');
    ok(g.play('p'));
    assert.equal(b.block, 5);
    assert.equal(b.hp, 66);
    give('temporary', 'slash', true);
    ok(g.endTurn());
    assert.equal(g.attackDamage('follow_up'), 2);
    assert.equal(g.attackDamage('shield_push'), 3);
    assert.ok(!b.draw.concat(b.hand, b.discard).some((c) => c.id === 'temporary'));
    give('played-temp', 'slash', true);
    ok(g.play('played-temp'));
    assert.ok(!b.discard.some((c) => c.id === 'played-temp'));
});
test('an actual pre-field catalog checksum can resume an old in-progress expedition', () => {
    const data = new Map(),
        storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const repo = new SaveRepository(storage),
        s = new GameSession(42, repo, STAMINA_SCENARIO);
    ok(s.execute({ type: 'start', tier: 'low' }));
    ok(s.execute({ type: 'enter-node' }));
    const state = s.game.exportState(),
        old = JSON.parse(JSON.stringify(raw));
    delete old.expedition;
    delete old.labyrinth;
    old.cards = old.cards
        .filter((c) => !c.chapter && !c.synthesisOnly && !c.fist && !['follow_up', 'shield_push', 'scrap_shiv', 'rummage'].includes(c.id))
        .map(({ summary, rarity, ...card }) => card);
    const oldIds = new Set(old.cards.map(({ id }) => id));
    old.recipes = old.recipes.filter(({ materials, products }) =>
        [...materials, ...products].every(({ card }) => oldIds.has(card))
    );
    function hash(text) {
        let n = 2166136261;
        for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
        return (n >>> 0).toString(16);
    }
    const { checksum, ...body } = JSON.parse(data.get(repo.key));
    body.catalogHash = hash(JSON.stringify(catalog.validateCatalog(old)));
    data.set(repo.key, JSON.stringify({ ...body, checksum: hash(JSON.stringify(body)) }));
    const restored = new GameSession(99, new SaveRepository(storage));
    assert.equal(restored.restored, true);
    assert.deepEqual(restored.game.exportState(), state);
    assert.equal(restored.game.content.cards.knife.name, '菜刀');
    ok(restored.execute({ type: 'new-game' }));
    assert.equal(restored.game.scenario.id, 'ashen-labyrinth');
    assert.equal(restored.game.cards.length, 0);
    ok(restored.execute({ type: 'start', tier: 'emergency' }));
    assert.equal(restored.game.cards.length, 10);
});
