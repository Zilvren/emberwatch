const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
const source = require('../assets/resources/data/cards.json');
source.cards.push({
    id: 'shelter_supply',
    name: '避难所测试物资',
    tag: '物资',
    cost: 0,
    weight: 1,
    text: '',
    color: '#9aaf8c',
    art: 'cash',
    role: 'supply',
    initialCount: 0,
    reward: true,
    supplyValue: 4,
    effect: { type: 'none', amount: 0 },
});
catalog.installCatalog(source);
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { STAMINA_SCENARIO } = load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
const { shelterSummary } = load(
    path.join(root, 'assets/game/presentation/ui/ShelterSummaryModel.ts')
);
function returned({ supplies, armor = 6, critical = false, storedSupplies, scenario }) {
    const session = new GameSession(17, undefined, scenario),
        game = session.game;
    assert.equal(session.execute({ type: 'start', tier: 'emergency' }).ok, true);
    Object.assign(game, {
        fixedDone: true,
        route: 'A',
        pathIndex: game.scenario.routes.A.length,
        supplies,
        armor,
        critical,
        storedSupplies,
    });
    session.advanceTime(1);
    assert.equal(game.phase, 'journal');
    assert.equal(session.execute({ type: 'continue-journal' }).ok, true);
    assert.equal(game.phase, 'shelter');
    return session;
}
test('new shelter summary removes repair and daily payment and starts a fresh run', () => {
    const session = returned({ supplies: 8, armor: 3 }),
        before = shelterSummary(session.view);
    assert.equal(before.repairVisible, false);
    assert.equal(session.game.day, 2);
    assert.equal(before.doneCaption, '开始下一局');
    assert.match(before.values['shelter/repair-hint'], /暂无/);
    assert.match(before.values['shelter/progress-summary'], /已通关 1 次/);
    assert.equal(session.execute({ type: 'repair' }).ok, false);
    assert.equal(session.game.armor, 3);
    assert.equal(session.execute({ type: 'start', tier: 'emergency' }).ok, true);
    assert.equal(session.game.phase, 'map');
    assert.equal(session.game.day, 2);
    assert.equal(session.game.supplies, 8);
    assert.equal(session.game.armor, 10);
    assert.equal(
        session.game.cards.length,
        session.game.content.initialDeck.filter(
            (kind) =>
                session.game.content.cards[kind].role === 'basic' ||
                session.game.content.cards[kind].role === 'normal'
        ).length
    );
});
test('stored supply cards can be exchanged at any time in the shelter', () => {
    const session = returned({ supplies: 2, storedSupplies: { shelter_supply: 2 } });
    const before = shelterSummary(session.view);
    assert.equal(before.repairVisible, true);
    assert.equal(before.repairCaption, '兑换全部物资卡 · +8 物资');
    assert.equal(session.execute({ type: 'redeem-supplies' }).ok, true);
    assert.equal(session.game.supplies, 10);
    assert.deepEqual(session.game.storedSupplies, {});
    const after = shelterSummary(session.view);
    assert.equal(after.repairVisible, false);
    assert.match(after.values['shelter/repair-hint'], /暂无/);
    assert.equal(session.execute({ type: 'start', tier: 'emergency' }).ok, true);
    assert.equal(session.game.supplies, 10);
});
test('shelter projection shows exploration progress and leaves supplies untouched', () => {
    const session = returned({ supplies: 8, armor: 10, scenario: STAMINA_SCENARIO }),
        before = session.game.exportState();
    const summary = shelterSummary(session.view);
    assert.equal(summary.repairVisible, false);
    assert.equal(summary.doneCaption, '整备出发');
    assert.match(summary.values['shelter/progress-summary'], /已通关 1 次/);
    assert.equal(Object.keys(summary.values).some(key => key.includes('daily')), false);
    assert.deepEqual(session.game.exportState(), before);
    session.advanceTime(100);
    assert.equal(session.game.supplies, 8);
    assert.equal(session.game.day, 2);
});
test('repair remains actionable with exactly its cost and has no daily-shortfall warning', () => {
    const session = returned({ supplies: 1, armor: 6, scenario: STAMINA_SCENARIO });
    const before = shelterSummary(session.view);
    assert.equal(before.repairVisible, true);
    assert.equal(before.repairEnabled, true);
    assert.equal(session.execute({ type: 'repair' }).ok, true);
    const after = shelterSummary(session.view);
    assert.equal(after.repairVisible, false);
    assert.equal(session.game.supplies, 0);
    assert.match(after.values['shelter/repair-hint'], /已花费 1/);
    assert.equal(session.game.day, 2);
});
test('repair itself remains unavailable when the returned supplies cannot cover its actual cost', () => {
    const session = returned({ supplies: 1, armor: 0, critical: true, scenario: STAMINA_SCENARIO });
    const summary = shelterSummary(session.view),
        before = session.game.exportState();
    assert.equal(summary.repairVisible, true);
    assert.equal(summary.repairEnabled, false);
    assert.match(summary.values['shelter/repair-hint'], /缺少 1/);
    assert.equal(session.execute({ type: 'repair' }).ok, false);
    assert.deepEqual(session.game.exportState(), before);
});
