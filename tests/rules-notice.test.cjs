const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader(),
    root = path.resolve(__dirname, '..');
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
catalog.installCatalog(require('../assets/resources/data/cards.json'));
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { TUTORIAL_SCENARIO } = load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
const { SaveRepository } = load(path.join(root, 'assets/game/infrastructure/SaveRepository.ts'));
const { rulesNotice } = load(path.join(root, 'assets/game/presentation/ui/RulesNoticeModel.ts'));
test('legacy disclosure preserves restored progress and describes only a confirmed new-game upgrade', () => {
    const data = new Map(),
        storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const legacy = new GameSession(17, new SaveRepository(storage), TUTORIAL_SCENARIO);
    assert.equal(legacy.execute({ type: 'start' }).ok, true);
    const before = legacy.game.exportState(),
        restored = new GameSession(99, new SaveRepository(storage));
    const notice = rulesNotice(restored.view.scenario.ruleset, restored.newGameRuleset);
    assert.match(notice.caption, /旧规则/);
    assert.match(notice.help, /确认|重开/);
    assert.match(notice.restart, /体力/);
    assert.deepEqual(restored.game.exportState(), before);
    assert.equal(restored.execute({ type: 'new-game' }).ok, true);
    assert.equal(rulesNotice(restored.view.scenario.ruleset, restored.newGameRuleset).caption, '');
});
test('an explicit legacy regression session never promises a rule upgrade on restart', () => {
    const session = new GameSession(17, undefined, TUTORIAL_SCENARIO);
    const notice = rulesNotice(session.view.scenario.ruleset, session.newGameRuleset);
    assert.match(notice.caption, /旧规则/);
    assert.equal(notice.restart, '');
    assert.doesNotMatch(notice.help, /启用体力系统/);
});
test('new stamina sessions have no legacy-mode notice', () => {
    const session = new GameSession(17);
    const before = session.game.exportState();
    assert.equal(rulesNotice(session.view.scenario.ruleset, session.newGameRuleset).caption, '');
    assert.deepEqual(session.game.exportState(), before);
});
