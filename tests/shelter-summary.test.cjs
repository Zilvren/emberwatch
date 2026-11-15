const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
catalog.installCatalog(require('../assets/resources/data/cards.json'));
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { shelterSummary } = load(
    path.join(root, 'assets/game/presentation/ui/ShelterSummaryModel.ts')
);
function returned({ supplies, armor, critical = false }) {
    const session = new GameSession(17),
        game = session.game;
    assert.equal(session.execute({ type: 'start', tier: 'emergency' }).ok, true);
    Object.assign(game, {
        fixedDone: true,
        route: 'A',
        pathIndex: game.scenario.routes.A.length,
        supplies,
        armor,
        critical,
    });
    session.advanceTime(1);
    assert.equal(game.phase, 'shelter');
    return session;
}
test('shelter projection shows an unpaid daily forecast without mutating the settlement', () => {
    const session = returned({ supplies: 8, armor: 10 }),
        before = session.game.exportState();
    const summary = shelterSummary(session.view);
    assert.equal(summary.repairVisible, false);
    assert.equal(summary.remaining, 7);
    assert.equal(summary.dailyShortfall, false);
    assert.deepEqual(session.game.exportState(), before);
    assert.equal(session.execute({ type: 'finish-day' }).ok, true);
    assert.equal(session.game.supplies, summary.remaining);
});
test('shelter display keeps a risky repair actionable and updates the unpaid forecast afterward', () => {
    const session = returned({ supplies: 1, armor: 6 });
    const before = shelterSummary(session.view);
    assert.equal(before.repairVisible, true);
    assert.equal(before.repairEnabled, true);
    assert.equal(before.repairRisk, true);
    assert.equal(before.dailyShortfall, false);
    assert.equal(session.execute({ type: 'repair' }).warning, true);
    assert.equal(session.execute({ type: 'repair', confirmed: true }).ok, true);
    const after = shelterSummary(session.view);
    assert.equal(after.repairVisible, false);
    assert.equal(after.dailyShortfall, true);
    assert.equal(session.game.settlement.dailySpent, 0);
    assert.match(after.values['shelter/repair-hint'], /已花费 1/);
    assert.equal(session.execute({ type: 'finish-day' }).ok, true);
    assert.equal(session.game.settlement.dailyShortfall, 1);
});
test('repair itself remains unavailable when the returned supplies cannot cover its actual cost', () => {
    const session = returned({ supplies: 1, armor: 0, critical: true });
    const summary = shelterSummary(session.view),
        before = session.game.exportState();
    assert.equal(summary.repairVisible, true);
    assert.equal(summary.repairEnabled, false);
    assert.equal(summary.repairRisk, false);
    assert.match(summary.values['shelter/repair-hint'], /缺少 1/);
    assert.equal(session.execute({ type: 'repair', confirmed: true }).ok, false);
    assert.deepEqual(session.game.exportState(), before);
});
