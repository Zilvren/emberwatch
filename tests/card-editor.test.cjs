const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createLoader } = require('../tools/load-ts.cjs');
const { createEditorServer } = require('../tools/card-editor-server.cjs');
const root = path.resolve(__dirname, '..');
const base = () => JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/data/cards.json'), 'utf8'));
const schema = createLoader()(path.join(root, 'assets/CardCatalog.ts'));
function gameWith(catalog) {
    const load = createLoader();
    load(path.join(root, 'assets/CardCatalog.ts')).installCatalog(catalog);
    return load(path.join(root, 'assets/SurvivalRules.ts'));
}
const newCard = (id = 'editor_test') => ({ id, name: '编辑器测试卡', tag: '技能 · 攻击', cost: 2, weight: 1, text: '配置驱动', color: '#c29060', art: 'heavy', role: 'normal', initialCount: 1, reward: true, effect: { type: 'damage', amount: 8 } });
function battle(Game) { const game = new Game(17); game.start(); game.fixedDone = true; game.route = 'A'; game.enterNode(); return game; }

test('new IDs enter the initial deck and fixed rewards and use configured cost and damage', () => {
    const catalog = base(), custom = newCard(); catalog.cards.push(custom); catalog.fixedReward = custom.id;
    const { SurvivalGame } = gameWith(catalog), game = new SurvivalGame(17);
    assert.ok(game.cards.some(card => card.kind === custom.id));
    assert.equal(game.baseWeight, 28);
    game.start(); game.enterNode(); assert.deepEqual(game.rewards.cards, [custom.id]);
    const combat = battle(SurvivalGame); combat.battle.hp = 20;
    combat.battle.hand = [{ id: 'new', kind: custom.id, temporary: false }];
    assert.equal(combat.play('new').ok, true); assert.equal(combat.battle.hp, 12); assert.equal(combat.supplies, 8);
});
test('editing an existing card changes its actual damage, not only its displayed description', () => {
    const catalog = base(); catalog.cards.find(card => card.id === 'attack').effect.amount = 4;
    const { SurvivalGame, CARD } = gameWith(catalog), game = battle(SurvivalGame);
    game.battle.hand = [{ id: 'edited', kind: 'attack', temporary: false }];
    game.play('edited'); assert.equal(game.battle.hp, 2);
    assert.equal(schema.effectSummary(CARD.attack), '造成 4 点伤害');
});
test('custom block and healing retain block duration, healing cap and critical restrictions', () => {
    const catalog = base(); const guard = newCard('custom_guard'), heal = newCard('custom_heal');
    guard.initialCount = heal.initialCount = 0; guard.effect = { type: 'block', amount: 7 }; heal.effect = { type: 'heal', amount: 4 };
    catalog.cards.push(guard, heal);
    const { SurvivalGame } = gameWith(catalog), game = battle(SurvivalGame);
    game.battle.hand = [{ id: 'guard', kind: guard.id }, { id: 'heal', kind: heal.id }]; game.armor = 8;
    assert.equal(game.play('guard').ok, true); assert.equal(game.battle.block, 7);
    assert.equal(game.play('heal').ok, true); assert.equal(game.armor, 10);
    game.endTurn(); assert.equal(game.battle.block, 0);
    game.armor = 0; assert.match(game.cardBlocked({ kind: heal.id }), /感染临界/);
});
test('weapons generate their configured temporary card next turn and preserve the unique slot', () => {
    const catalog = base(); const temporary = newCard('custom_slash');
    Object.assign(temporary, { role: 'temporary', initialCount: 0, reward: false, weight: 0 }); temporary.effect.amount = 9;
    catalog.cards.push(temporary); catalog.cards.find(card => card.id === 'knife').effect.generatedCard = temporary.id;
    const { SurvivalGame } = gameWith(catalog), game = battle(SurvivalGame);
    game.battle.hand = [{ id: 'weapon', kind: 'knife' }]; game.play('weapon');
    assert.equal(game.battle.hand.length, 0); game.endTurn();
    assert.ok(game.battle.hand.some(card => card.kind === temporary.id && card.temporary));
    assert.match(game.cardBlocked({ kind: 'knife' }), /武器槽/);
});
test('deleting an ordinary definition removes it from initial decks and reward pools', () => {
    const catalog = base(); catalog.cards = catalog.cards.filter(card => card.id !== 'evade');
    const { SurvivalGame, CARD, REWARD_POOL } = gameWith(catalog), game = new SurvivalGame(1);
    assert.equal(CARD.evade, undefined); assert.ok(!REWARD_POOL.includes('evade')); assert.ok(!game.cards.some(card => card.kind === 'evade'));
});
test('invalid definitions, dangling references and deleting system cards are rejected', () => {
    const changes = [
        c => c.cards.push({ ...c.cards[0] }),
        c => { c.cards[0].cost = -1; },
        c => { c.cards[0].name = 42; },
        c => { c.cards = c.cards.filter(card => card.id !== 'attack'); },
        c => { c.cards.find(card => card.id === 'knife').effect.generatedCard = 'missing'; },
        c => { c.fixedReward = 'missing'; },
        c => c.cards.forEach(card => { card.reward = false; }),
        c => { c.cards.find(card => card.id === 'knife').initialCount = 8; },
        c => { c.cards[0].id = 'constructor'; },
    ];
    for (const change of changes) { const catalog = base(); change(catalog); assert.throws(() => schema.validateCatalog(catalog), schema.CatalogError); }
});
test('invalid install does not replace the last valid catalog', () => {
    const load = createLoader(), catalog = load(path.join(root, 'assets/CardCatalog.ts'));
    catalog.installCatalog(base()); const invalid = base(); invalid.cards[0].cost = -1;
    assert.throws(() => catalog.installCatalog(invalid)); assert.equal(catalog.CARD.attack.cost, 0); assert.equal(catalog.REWARD_POOL.length, 4);
});
test('HTTP saves persist, retain a backup, reject conflicts and leave disk intact on invalid saves', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'the-end-editor-'));
    const catalogFile = path.join(directory, 'cards.json'), backupDirectory = path.join(directory, 'backups');
    const original = JSON.stringify(base(), null, 2) + '\n'; fs.writeFileSync(catalogFile, original);
    const server = createEditorServer({ catalogFile, backupDirectory }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        const target = path.resolve(directory);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
        assert.ok(path.basename(target).startsWith('the-end-editor-'));
        fs.rmSync(target, { recursive: true });
    });
    const url = `http://127.0.0.1:${server.address().port}/api/cards`;
    const first = await (await fetch(url)).json(); first.catalog.cards.push(newCard());
    const put = (input, headers = {}) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) });
    const savedResponse = await put(first); assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json(); assert.notEqual(saved.revision, first.revision);
    assert.ok(JSON.parse(fs.readFileSync(catalogFile, 'utf8')).cards.some(card => card.id === 'editor_test'));
    assert.equal(fs.readFileSync(path.join(backupDirectory, saved.backup), 'utf8'), original);
    assert.equal((await put(first)).status, 409);
    const before = fs.readFileSync(catalogFile, 'utf8');
    const invalid = JSON.parse(JSON.stringify(saved)); invalid.catalog.cards[0].cost = -9;
    assert.equal((await put(invalid)).status, 422); assert.equal(fs.readFileSync(catalogFile, 'utf8'), before);
    assert.equal((await put(saved, { Origin: 'https://example.invalid' })).status, 403);
    const fresh = await (await fetch(url)).json(); const { SurvivalGame } = gameWith(fresh.catalog);
    assert.ok(new SurvivalGame(1).cards.some(card => card.kind === 'editor_test'));
});
