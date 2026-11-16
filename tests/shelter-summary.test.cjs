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
    assert.equal(game.phase, 'journal');
    assert.equal(session.execute({ type: 'continue-journal' }).ok, true);
    assert.equal(game.phase, 'shelter');
    return session;
}
test('shelter projection shows exploration progress and leaves supplies untouched', () => {
    const session = returned({ supplies: 8, armor: 10 }),
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
    const session = returned({ supplies: 1, armor: 6 });
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
    const session = returned({ supplies: 1, armor: 0, critical: true });
    const summary = shelterSummary(session.view),
        before = session.game.exportState();
    assert.equal(summary.repairVisible, true);
    assert.equal(summary.repairEnabled, false);
    assert.match(summary.values['shelter/repair-hint'], /缺少 1/);
    assert.equal(session.execute({ type: 'repair' }).ok, false);
    assert.deepEqual(session.game.exportState(), before);
});
