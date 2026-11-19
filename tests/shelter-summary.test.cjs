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
const { shelterSummary } = load(
    path.join(root, 'assets/game/presentation/ui/ShelterSummaryModel.ts')
);
function returned({ supplies, armor = 6, storedSupplies = {} }) {
    const session = new GameSession(17),
        game = session.game;
    assert.equal(session.execute({ type: 'start', tier: 'emergency' }).ok, true);
    Object.assign(game, {
        fixedDone: true,
        route: 'A',
        pathIndex: game.scenario.routes.A.length,
        supplies,
        armor,
        storedSupplies,
    });
    session.advanceTime(1);
    assert.equal(game.phase, 'shelter');
    return session;
}
test('new shelter summary removes repair and daily payment and starts a fresh run', () => {
    const session = returned({ supplies: 8, armor: 3 }),
        before = shelterSummary(session.view);
    assert.equal(before.repairVisible, false);
    assert.equal(before.remaining, 8);
    assert.match(before.values['shelter/repair-hint'], /暂无/);
    assert.match(before.values['shelter/daily-hint'], /不修复护甲，也不扣每日消耗/);
    assert.equal(session.execute({ type: 'repair' }).ok, false);
    assert.equal(session.game.armor, 3);
    assert.equal(session.execute({ type: 'finish-day' }).ok, true);
    assert.equal(session.game.phase, 'journal');
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
    assert.equal(session.execute({ type: 'finish-day' }).ok, true);
    assert.equal(session.game.supplies, 10);
});
