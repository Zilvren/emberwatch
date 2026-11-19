const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = require('../tools/load-ts.cjs').createLoader();
const path = require('node:path');
const synthesisCatalog = require('./fixtures/card-synthesis.cjs');

const source = (file) => load(path.resolve(__dirname, '../assets/game', `${file}.ts`));
const { installCatalog, validateCatalog } = source('core/content/CardCatalog');
const { missingSynthesisMaterials, recipeRelations } = source('core/content/RecipeCatalog');
const { RUN_DECK_SCENARIO, STAMINA_SCENARIO } = source('core/content/GameScenario');
const { GameSession } = source('application/GameSession');
const { SaveRepository } = source('infrastructure/SaveRepository');
const { visibleInventory } = source('presentation/cards/InventoryViewModel');
const { cardViewModel } = source('presentation/cards/CardViewModel');
installCatalog(synthesisCatalog());

const success = (result) => assert.equal(result.ok, true, result.message);
const craft = (session, recipeId) => session.execute({ type: 'synthesize', recipeId });
const counts = (cards, kind) => cards.filter((card) => card.kind === kind).length;
function command(session, type, data = {}) {
    const result = session.execute({ type, ...data });
    success(result);
    return result;
}
function start(session) {
    command(session, 'start', { tier: 'low' });
}
function takeFixedReward(session) {
    command(session, 'enter-node');
    command(session, 'claim-card', { index: 0 });
    command(session, 'finish-rewards');
}

test('recipes reject ineligible cards, dangling references, duplicates, invalid counts and cycles', () => {
    const edit = (change) => {
        const raw = synthesisCatalog();
        change(raw);
        return () => validateCatalog(raw);
    };
    assert.throws(edit((raw) => { delete raw.cards.find(({ id }) => id === 'knife').canSynthesize; }), /未勾选/);
    assert.throws(edit((raw) => { raw.recipes[0].materials[0].card = 'missing'; }), /不存在/);
    assert.throws(edit((raw) => { raw.recipes[0].products[0].card = 'cloth_supplies'; }), /须为战斗卡/);
    assert.throws(edit((raw) => { raw.recipes[0].products.pop(); }), /至少需要/);
    assert.throws(edit((raw) => { raw.recipes[0].materials[0].count = 1.5; }), /整数/);
    assert.throws(edit((raw) => { raw.recipes[0].materials.push(raw.recipes[0].materials[0]); }), /合并数量/);
    assert.throws(edit((raw) => { raw.recipes[1].id = raw.recipes[0].id; }), /ID 重复/);
    assert.throws(edit((raw) => {
        raw.recipes.push({ ...raw.recipes[0], id: 'duplicate_spear', materials: [...raw.recipes[0].materials].reverse() });
    }), /另一条配方相同/);
    assert.throws(edit((raw) => { raw.recipes[1].products[0].card = 'knife'; }), /配方形成循环/);
    assert.throws(edit((raw) => { raw.recipes[0].products[0].card = 'knife'; }), /配方形成循环/);
});

test('contextual card-face hint appears for a partial recipe and the graph shows both directions', () => {
    const session = new GameSession(17);
    const { cards, recipes } = session.game.content.catalog;
    const wood = cards.find(({ id }) => id === 'wood_stick');
    assert.equal(missingSynthesisMaterials(recipes, []).size, 0);
    assert.equal(missingSynthesisMaterials(recipes, session.view.usableCards).has(wood.id), true);
    assert.deepEqual(cardViewModel(wood).keywords, ['可作为合成材料']);
    assert.deepEqual(cardViewModel(wood, session.view.content.cards, '体力', { neededForSynthesis: true }).keywords,
        ['可作为合成材料', '已有搭配 · 缺此材料']);
    const graph = recipeRelations(recipes, 'simple_spear');
    assert.deepEqual(graph.sources.map(({ id }) => id), ['make_spear']);
    assert.deepEqual(graph.derivatives.map(({ id }) => id), ['reinforce_spear']);
    const heavyStart = synthesisCatalog();
    heavyStart.cards.find(({ id }) => id === 'wood_stick').initialCount = 1;
    assert.doesNotThrow(() => validateCatalog(heavyStart));
});

test('map permission gates crafting; chained multi-output crafting and single-step undo persist atomically', () => {
    const storage = new Map();
    const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const repository = () => new SaveRepository(adapter);
    const session = new GameSession(17, repository(), RUN_DECK_SCENARIO, true);
    start(session);
    takeFixedReward(session);
    const locked = new GameSession(17, repository());
    command(locked, 'open-recipes');
    assert.match(craft(locked, 'make_spear').message, /局外遗物/);
    const original = session.game.exportState();
    assert.equal(craft(session, 'make_spear').ok, false);
    command(session, 'open-recipes');
    success(craft(session, 'make_spear'));
    assert.equal(counts(session.view.usableCards, 'wood_stick'), 0);
    assert.equal(counts(session.view.usableCards, 'simple_spear'), 1);
    const once = session.game.exportState();
    success(craft(session, 'reinforce_spear'));
    assert.equal(counts(session.view.usableCards, 'spare_parts'), 2);
    assert.equal(session.view.supplies, original.supplies);
    assert.equal(session.view.baseWeight, 0);
    assert.equal(craft(session, 'reinforce_spear').ok, false);
    assert.equal(new GameSession(42, repository()).view.usableCards.some(({ kind }) => kind === 'long_spear'), true);
    command(session, 'undo-synthesis');
    assert.deepEqual(session.view.cards, once.cards);
    assert.equal(session.execute({ type: 'undo-synthesis' }).ok, false);
    success(craft(session, 'trade_attacks'));
    assert.equal(counts(session.view.usableCards, 'attack'), 0);
    command(session, 'close-recipes');
    command(session, 'open-recipes');
    assert.equal(session.canUndoSynthesis, false);
    assert.equal(session.execute({ type: 'undo-synthesis' }).ok, false);
    const reloaded = new GameSession(51, repository(), RUN_DECK_SCENARIO, true);
    command(reloaded, 'open-recipes');
    assert.equal(reloaded.canUndoSynthesis, false);
    assert.deepEqual(reloaded.view.usableCards, session.view.usableCards);
});

test('gameplay locks under the battle overlay and settled supply cards survive a fresh run', () => {
    const session = new GameSession(17);
    start(session);
    takeFixedReward(session);
    command(session, 'choose-route', { route: 'B' });
    command(session, 'enter-node');
    assert.deepEqual(session.view.rewards.cards, ['cloth_supplies']);
    command(session, 'claim-card', { index: 0 });
    assert.deepEqual(visibleInventory(session.view, 'all', 'original').map(({ kind }) => kind), ['cloth_supplies']);
    command(session, 'finish-rewards');
    command(session, 'enter-node');
    const original = session.game.exportState();
    command(session, 'open-recipes');
    assert.match(craft(session, 'make_spear').message, /仅可查看/);
    assert.equal(session.execute({ type: 'end-turn' }).ok, false);
    assert.deepEqual(session.game.exportState(), original);
    command(session, 'close-recipes');
    assert.equal(counts(session.view.usableCards, 'wood_stick'), 1);
    assert.equal(counts(session.view.usableCards, 'cloth_supplies'), 0);
    const game = session.game;
    game.battle = null;
    game.phase = 'map';
    game.pathIndex = 2;
    command(session, 'enter-node');
    assert.equal(game.phase, 'rest');
    command(session, 'open-recipes');
    success(craft(session, 'make_spear'));
    success(craft(session, 'reinforce_spear'));
    command(session, 'close-recipes');
    command(session, 'finish-rest');
    game.pathIndex = game.scenario.routes.B.length;
    session.advanceTime(1);
    assert.equal(game.phase, 'shelter');
    assert.deepEqual(game.cards, []);
    assert.deepEqual(game.storedSupplies, { cloth_supplies: 1 });
    assert.equal(game.settlement.returnedCards, 1);
    const suppliesBeforeExchange = game.supplies;
    assert.match(command(session, 'redeem-supplies').message, /获得 3 点物资/);
    assert.equal(game.supplies, suppliesBeforeExchange + 3);
    assert.deepEqual(game.storedSupplies, {});
    assert.equal(session.execute({ type: 'redeem-supplies' }).ok, false);
    command(session, 'new-game');
    assert.equal(counts(session.view.usableCards, 'attack'), 2);
    assert.equal(counts(session.view.usableCards, 'wood_stick'), 0);
    assert.equal(counts(session.view.usableCards, 'long_spear'), 0);
    assert.deepEqual(game.storedSupplies, {});
});

test('pre-synthesis saves keep their original rules until the player starts a new exploration', () => {
    function hash(text) {
        let value = 2166136261;
        for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
        return (value >>> 0).toString(16);
    }
    const base = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../assets/resources/data/cards.json'), 'utf8'));
    const oldSchema = validateCatalog(base);
    delete oldSchema.recipes;
    oldSchema.cards.find(({ id }) => id === 'attack').text = '固有能力，永不丢失';
    installCatalog(base);
    try {
        const legacySession = new GameSession(17, undefined, STAMINA_SCENARIO);
        start(legacySession);
        const body = {
            format: 'the-end-save', version: 1,
            catalogHash: hash(JSON.stringify(oldSchema)), state: legacySession.game.exportState(),
        };
        let stored = JSON.stringify({ ...body, checksum: hash(JSON.stringify(body)) });
        const saves = new SaveRepository({ getItem: () => stored, setItem: (_key, value) => { stored = value; } });
        const session = new GameSession(42, saves);
        assert.equal(session.restored, true);
        assert.deepEqual(session.game.exportState(), body.state);
        command(session, 'open-recipes');
        assert.match(session.synthesisBlocked, /新探索/);
        command(session, 'close-recipes');
        command(session, 'new-game');
        assert.equal(session.view.scenario.version, 2);
        assert.equal(session.view.cards.some(({ kind }) => kind === 'cash'), false);
    } finally {
        installCatalog(synthesisCatalog());
    }
});
