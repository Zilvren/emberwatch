const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const source = (file) => load(path.resolve(__dirname, '../assets/game', file));
source('core/content/CardCatalog.ts').installCatalog(
    JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../assets/resources/data/cards.json'), 'utf8')
    )
);
const { STAMINA_SCENARIO, registerScenario } = source('core/content/GameScenario.ts');
const { GameSession } = source('application/GameSession.ts');
const { SaveRepository } = source('infrastructure/SaveRepository.ts');
const ok = (result) => assert.equal(result.ok, true, result.message);

test('current saves retain configured route IDs through commands and saved battle resume', () => {
    const scenario = registerScenario({
        ...JSON.parse(JSON.stringify(STAMINA_SCENARIO)),
        id: 'merge-journal-route',
        routes: { C: [...STAMINA_SCENARIO.routes.A] },
        routeDescriptions: { C: '配置路线' },
    });
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const session = new GameSession(17, new SaveRepository(storage), scenario);
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    ok(session.execute({ type: 'enter-node' }));
    ok(session.execute({ type: 'claim-supplies' }));
    ok(session.execute({ type: 'finish-rewards' }));
    ok(session.execute({ type: 'choose-route', route: 'C' }));
    ok(session.execute({ type: 'enter-node' }));
    assert.equal(session.view.phase, 'battle');
    const before = session.game.exportState();
    const restored = new GameSession(99, new SaveRepository(storage), scenario);
    assert.equal(restored.restored, true);
    assert.equal(restored.view.route, 'C');
    assert.equal(restored.game.exportState().schemaVersion, 4);
    assert.deepEqual(restored.game.exportState(), before);
});

test('follow-up journal is a native view key while day2 is no longer a current gameplay phase', () => {
    const { isPhase, GAME_PHASES } = source('core/state/GamePhase.ts');
    const { SCREEN_KEYS } = source('presentation/ui/ViewBindings.ts');
    assert.equal(isPhase('day2'), false);
    assert.equal(isPhase('journal'), true);
    assert.ok(SCREEN_KEYS.includes('day2'));
    assert.ok(GAME_PHASES.every((phase) => SCREEN_KEYS.includes(phase)));
    assert.equal(new Set(SCREEN_KEYS).size, SCREEN_KEYS.length);
});
