const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const root = path.resolve(__dirname, '..');
const source = (file) => load(path.join(root, 'assets/game', file));
source('core/content/CardCatalog.ts').installCatalog(require('../assets/resources/data/cards.json'));
const { SurvivalGame } = source('core/SurvivalGame.ts');
const { GameSession } = source('application/GameSession.ts');
const { FIELD_SCENARIO, STAMINA_SCENARIO, TUTORIAL_SCENARIO } = source('core/content/GameScenario.ts');
const { validateGameState } = source('core/state/GameState.ts');
const { validateJournalCatalog, mapClearMilestone } = source('core/content/JournalCatalog.ts');
const { SaveRepository } = source('infrastructure/SaveRepository.ts');
const catalog = require('../assets/resources/data/journals.json');
const copy = (value) => JSON.parse(JSON.stringify(value));
const ok = (result) => assert.equal(result.ok, true, result.message);
function storage() {
    const data = new Map();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function begin(game) { ok(game.start('emergency')); }
function defeat(game) {
    game.fixedDone = true;
    game.route = 'A';
    ok(game.enterNode());
    assert.equal(game.phase, 'battle');
    game.health = 1;
    game.battle.intent = 'attack';
    game.battle.block = 0;
    ok(game.endTurn());
    assert.equal(game.phase, 'failure');
}
function clear(game) {
    // Completed-map fixture; return, progress, journal and persistence use their real rules.
    game.fixedDone = true;
    game.route = 'A';
    game.pathIndex = game.scenario.routes.A.length;
    game.visited = ['fixed', ...game.scenario.routes.A];
    game.advanceTime(1);
}
function firstClearOnAttempt(attempt) {
    const game = new SurvivalGame(17, STAMINA_SCENARIO);
    for (let index = 1; index < attempt; index++) {
        begin(game);
        defeat(game);
        ok(game.retry());
    }
    begin(game);
    clear(game);
    return game;
}

test('second-attempt and tenth-attempt clears unlock identical stories with different actual dates', () => {
    const fast = firstClearOnAttempt(2), slow = firstClearOnAttempt(10);
    assert.equal(fast.day, 3);
    assert.equal(slow.day, 11);
    assert.equal(fast.currentJournal.id, 'street-cleared');
    assert.equal(slow.currentJournal.id, fast.currentJournal.id);
    assert.equal(slow.currentJournal.body, fast.currentJournal.body);
    assert.equal(fast.currentJournal.day, 3);
    assert.equal(slow.currentJournal.day, 11);
    assert.equal(slow.journalEntries.length, 2);
});

test('ordinary failures advance a day, restore the existing loadout and never add daily journals', () => {
    const game = new SurvivalGame(17, STAMINA_SCENARIO), original = game.exportState();
    for (let attempt = 1; attempt <= 3; attempt++) {
        begin(game);
        game.supplies = 3;
        game.cards = game.cards.filter(card => card.kind !== 'cash');
        defeat(game);
        assert.equal(game.day, attempt + 1);
        assert.equal(game.supplies, original.supplies);
        assert.equal(game.health, 0);
        assert.deepEqual(game.cards.map(card => card.kind), original.cards.map(card => card.kind));
        assert.equal(game.currentJournal, null);
        assert.equal(game.journalEntries.length, 1);
        const checkpoint = game.exportState();
        assert.equal(game.endTurn().ok, false);
        game.advanceTime(10);
        assert.deepEqual(game.exportState(), checkpoint);
        ok(game.retry());
        assert.equal(game.health, original.health);
        assert.equal(game.day, attempt + 1);
    }
});

test('teaching failures stay on day one and teaching completion can continue to formal exploration', () => {
    const game = new SurvivalGame(17, TUTORIAL_SCENARIO);
    for (let attempt = 0; attempt < 3; attempt++) {
        begin(game);
        defeat(game);
        assert.equal(game.day, 1);
        assert.equal(game.journalEntries.length, 1);
        ok(game.retry());
    }
    begin(game);
    clear(game);
    assert.equal(game.day, 2);
    assert.equal(game.currentJournal.id, 'tutorial-cleared');
    ok(game.continueJournal());
    assert.equal(game.scenario.id, STAMINA_SCENARIO.id);
    begin(game);
    defeat(game);
    assert.equal(game.day, 3);
    assert.equal(game.journalEntries.find(entry => entry.id === 'tutorial-cleared').day, 2);
});

test('repeat clears return to shelter, reset the map and never repeat the first-clear journal or charge daily supplies', () => {
    const game = firstClearOnAttempt(1);
    ok(game.continueJournal());
    const originalDate = game.journalEntries.find(entry => entry.id === 'street-cleared').day;
    begin(game);
    assert.equal(game.currentNode, 'fixed');
    assert.equal(game.route, null);
    assert.equal(game.visited.length, 0);
    assert.equal(game.settlement, null);
    game.supplies = 7;
    clear(game);
    assert.equal(game.day, 3);
    assert.equal(game.phase, 'shelter');
    assert.equal(game.supplies, 7);
    assert.equal(game.currentJournal, null);
    assert.equal(game.milestones[mapClearMilestone(STAMINA_SCENARIO.id)], 2);
    assert.equal(game.journalEntries.find(entry => entry.id === 'street-cleared').day, originalDate);
    const checkpoint = game.exportState();
    game.advanceTime(30);
    assert.deepEqual(game.exportState(), checkpoint);
    begin(game);
    defeat(game);
    assert.equal(game.day, 4);
    assert.equal(game.journalEntries.find(entry => entry.id === 'street-cleared').day, originalDate);
    assert.equal(game.milestones[mapClearMilestone(STAMINA_SCENARIO.id)], 2);
});

test('configured conditions and prerequisites queue multiple key journals in dependency order', () => {
    const custom = copy(catalog);
    custom.entries.unshift({
        id: 'follow-up', title: '后续关键记录', body: '后续固定文案。',
        conditions: [{ milestone: mapClearMilestone(STAMINA_SCENARIO.id), count: 1 }],
        prerequisites: ['street-cleared'],
    });
    custom.entries.push({
        id: 'second-clear', title: '再次走通街区', body: '第二个关键进度的固定文案。',
        conditions: [{ milestone: mapClearMilestone(STAMINA_SCENARIO.id), count: 2 }],
        prerequisites: ['follow-up'],
    });
    const game = new SurvivalGame(17, STAMINA_SCENARIO, undefined, custom);
    begin(game);
    clear(game);
    assert.equal(game.currentJournal.id, 'street-cleared');
    ok(game.continueJournal());
    assert.equal(game.phase, 'journal');
    assert.equal(game.currentJournal.id, 'follow-up');
    assert.equal(game.currentJournal.day, 2);
    ok(game.continueJournal());
    assert.equal(game.phase, 'shelter');
    begin(game);
    clear(game);
    assert.equal(game.currentJournal.id, 'second-clear');
    assert.equal(game.currentJournal.day, 3);
});

test('additional opening journals cannot be skipped by starting an expedition', () => {
    const custom = copy(catalog);
    custom.entries.push({ id: 'opening-follow-up', title: '开局关键事件', body: '额外的开局记录。',
        conditions: [{ milestone: 'campaign-started', count: 1 }], prerequisites: ['departure'] });
    const game = new SurvivalGame(17, STAMINA_SCENARIO, undefined, custom), before = game.exportState();
    assert.equal(game.pendingJournalCount, 2);
    assert.equal(game.start('emergency').ok, false);
    assert.deepEqual(game.exportState(), before);
    ok(game.continueJournal());
    assert.equal(game.currentJournal.id, 'opening-follow-up');
    assert.equal(game.start('emergency').ok, false);
    ok(game.continueJournal());
    assert.equal(game.pendingJournalCount, 0);
    begin(game);
    assert.equal(game.day, 1);
});

test('pending and read journals persist across sessions without duplicate day advancement or triggers', () => {
    const store = storage(), session = new GameSession(17, new SaveRepository(store), FIELD_SCENARIO);
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    Object.assign(session.game, { fixedDone: true, route: 'A', pathIndex: 4 });
    session.advanceTime(1);
    const resumed = new GameSession(99, new SaveRepository(store));
    assert.equal(resumed.restored, true);
    assert.equal(resumed.view.currentJournal.id, 'street-cleared');
    assert.equal(resumed.view.currentJournal.day, 2);
    resumed.advanceTime(20);
    assert.equal(resumed.view.day, 2);
    ok(resumed.execute({ type: 'continue-journal' }));
    const read = new GameSession(99, new SaveRepository(store));
    assert.equal(read.view.phase, 'shelter');
    assert.equal(read.view.currentJournal, null);
    assert.equal(read.view.day, 2);
    ok(read.execute({ type: 'start', tier: 'emergency' }));
    Object.assign(read.game, { fixedDone: true, route: 'A', pathIndex: 4 });
    read.advanceTime(1);
    assert.equal(read.view.day, 3);
    assert.equal(read.view.phase, 'shelter');
    assert.equal(read.view.journalEntries.length, 2);
    ok(read.execute({ type: 'new-game' }));
    assert.equal(read.view.day, 1);
    assert.deepEqual(read.view.milestones, { 'campaign-started': 1 });
    assert.equal(read.view.currentJournal.id, 'departure');
});

test('old terminal and unpaid return states migrate into the continuing loop without replaying old costs', () => {
    const original = new SurvivalGame(17, TUTORIAL_SCENARIO);
    begin(original);
    clear(original);
    const old = original.exportState();
    delete old.schemaVersion;
    delete old.milestones;
    delete old.journalEntries;
    old.phase = 'day2';
    old.supplies = 4;
    old.settlement.dailySpent = 1;
    old.settlement.dailyShortfall = 0;
    const resumed = SurvivalGame.fromState(old);
    assert.equal(resumed.day, 2);
    assert.equal(resumed.supplies, 4);
    assert.equal(resumed.phase, 'shelter');
    assert.equal(resumed.scenario.kind, 'expedition');
    assert.equal(resumed.currentJournal, null);
    assert.equal('dailySpent' in resumed.exportState().settlement, false);
    old.phase = 'shelter';
    old.day = 1;
    old.settlement.dailySpent = 0;
    const returned = SurvivalGame.fromState(old);
    assert.equal(returned.day, 2);
    assert.equal(returned.supplies, 4);
    assert.equal(returned.currentJournal.id, 'tutorial-cleared');
    assert.deepEqual(SurvivalGame.fromState(returned.exportState()).exportState(), returned.exportState());
});

test('a signed v1 saved game migrates and backs up the original on the first v3 write', () => {
    const store = storage(), repo = new SaveRepository(store), game = firstClearOnAttempt(1);
    repo.save(game.exportState());
    const { checksum, ...old } = JSON.parse(store.getItem(repo.key));
    old.version = 1;
    old.state.phase = 'day2';
    old.state.supplies = 4;
    delete old.state.schemaVersion;
    delete old.state.milestones;
    delete old.state.journalEntries;
    old.state.settlement.dailySpent = 1;
    old.state.settlement.dailyShortfall = 0;
    let signature = 2166136261;
    const text = JSON.stringify(old);
    for (let index = 0; index < text.length; index++) signature = Math.imul(signature ^ text.charCodeAt(index), 16777619);
    const encoded = JSON.stringify({ ...old, checksum: (signature >>> 0).toString(16) });
    store.setItem(repo.key, encoded);
    const resumed = new GameSession(99, new SaveRepository(store));
    assert.equal(resumed.restored, true);
    assert.equal(resumed.view.phase, 'shelter');
    assert.equal(resumed.view.day, 2);
    assert.equal(resumed.view.supplies, 4);
    assert.equal(resumed.view.currentJournal, null);
    ok(resumed.execute({ type: 'start', tier: 'emergency' }));
    assert.equal(resumed.view.day, 2);
    assert.equal(resumed.view.supplies, 4);
    assert.equal(JSON.parse(store.getItem(repo.key)).version, 3);
    assert.equal(store.getItem(repo.key + '.backup'), encoded);
});

test('journal configuration rejects missing prerequisites, cycles, repeated ids and invalid event counts', () => {
    for (const change of [
        data => { data.entries[1].prerequisites = ['missing']; },
        data => { data.entries[0].prerequisites = ['tutorial-cleared']; },
        data => { data.entries.push(copy(data.entries[0])); },
        data => { data.entries[1].conditions[0].count = 0; },
        data => { data.entries[0].id = 'different-opening'; },
    ]) {
        const invalid = copy(catalog);
        change(invalid);
        assert.throws(() => validateJournalCatalog(invalid), /关键日志/);
    }
});

test('save validation rejects duplicated journals, future dates and missing progress in current saves', () => {
    const game = firstClearOnAttempt(2), state = game.exportState();
    assert.deepEqual(validateGameState(state), state);
    for (const change of [
        data => { data.journalEntries.push(copy(data.journalEntries[0])); },
        data => { data.journalEntries[1].day = data.day + 1; },
        data => { delete data.milestones; },
        data => { data.journalEntries[1].id = 'missing'; },
    ]) {
        const invalid = copy(state);
        change(invalid);
        assert.throws(() => validateGameState(invalid), /存档字段无效/);
    }
});
