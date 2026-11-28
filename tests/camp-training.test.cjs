const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const from = file => load(path.resolve(__dirname, '../assets/game', file + '.ts'));
const { installCatalog } = from('core/content/CardCatalog');
const source = require('../assets/resources/data/cards.json');
installCatalog(source);
const { GameSession } = from('application/GameSession');
const { SurvivalGame } = from('core/SurvivalGame');
const { TUTORIAL_SCENARIO } = from('core/content/GameScenario');
const { routeMapModel } = from('presentation/map/RouteMapModel');
const ok = result => assert.ok(result.ok, result.message);
const learn = (session, id) => session.execute({ type: 'learn-camp-skill', id });
const buy = (session, id) => session.execute({ type: 'buy-camp-relic', id });

test('camp display pages cover every kind once and keep their boundary pages in range', () => {
    const { CAMP_SHELF_PAGE_SIZE, campShelfPage } = from('presentation/ui/CampViewModel');
    const kinds = Array.from({ length: CAMP_SHELF_PAGE_SIZE * 2 + 1 }, (_, index) => 'kind-' + index);
    const pages = [0, 1, 2].map(index => campShelfPage(kinds, index));
    assert.deepEqual(pages.flatMap(page => page.items), kinds);
    assert.deepEqual(pages.map(page => page.pages), [3, 3, 3]);
    assert.deepEqual(campShelfPage(kinds, -1), pages[0]);
    assert.deepEqual(campShelfPage(kinds, 3), pages[2]);
    assert.deepEqual(campShelfPage([], 7), { current: 0, pages: 1, items: [] });
});

test('camp actions learn only the inspected skill and sell only the inspected warehouse stack', () => {
    const { UiActionRouter } = from('presentation/ui/UiActionRouter');
    const { initialUiState } = from('presentation/ui/UiState');
    const { MAX_SUPPLY_POINTS } = from('core/RulesTypes');
    const session = new GameSession(17), ui = initialUiState();
    const results = [];
    const router = new UiActionRouter(session, ui, {
        refresh() {}, sound() {}, act(command) { results.push(session.execute(command)); }
    });
    const click = (id, payload = '') => router.handle({ id, payload });
    click('camp-skills');
    assert.equal(ui.campSkill, null);
    click('camp-learn', 'footing');
    click('camp-select-footing', 'footing');
    click('camp-learn', 'guard');
    click('camp-select-footing', 'footing');
    assert.equal(ui.campSkill, null);
    assert.equal(results.length, 0);
    click('camp-select-footing', 'footing');
    click('camp-learn', 'footing');
    assert.deepEqual(session.view.campSkills, ['footing']);
    click('camp-back');
    click('camp-skills');
    assert.equal(ui.campSkill, null);
    click('camp-back');

    const [first, second] = Object.values(session.game.content.cards).filter(card => card.role === 'supply');
    session.game.storedSupplies = { [first.id]:1, [second.id]:2 };
    click('camp-keeper');
    click('camp-trade');
    click('camp-stock-sell', first.id);
    assert.equal(ui.overlay, null);
    click('camp-back');
    click('camp-warehouse');
    click('camp-stock-sell', first.id);
    click('camp-stock-inspect', first.id);
    click('camp-stock-sell', second.id);
    assert.equal(results.length, 1);
    session.game.supplies = MAX_SUPPLY_POINTS;
    click('camp-stock-sell', first.id);
    assert.equal(results.at(-1).ok, false);
    assert.equal(session.game.storedSupplies[first.id], 1);
    session.game.supplies -= first.supplyValue;
    click('camp-stock-sell', first.id);
    assert.match(results.at(-1).message, /已售出/);
    assert.equal(session.game.supplies, MAX_SUPPLY_POINTS);
    click('camp-stock-sell', first.id);
    click('camp-stock-sell', second.id);
    assert.equal(results.length, 3);
    assert.deepEqual(session.view.storedSupplies, { [second.id]:2 });
    assert.deepEqual(SurvivalGame.fromState(session.game.exportState()).storedSupplies, { [second.id]:2 });
});

function battle(session) {
    ok(session.execute({ type: 'start', tier: 'emergency' }));
    ok(session.execute({ type: 'enter-node', id: 'threshold' }));
    ok(session.execute({ type: 'enter-node', id: 'lampPassage' }));
}

test('old gate saves start a fresh healthy expedition and keep only purchases for this trip', (t) => {
    const catalog = structuredClone(source);
    catalog.labyrinth.discoveryPool = ['lab_damper'];
    installCatalog(catalog);
    t.after(() => installCatalog(source));
    const run = new GameSession(17);
    ok(run.execute({ type: 'start', tier: 'emergency' }));
    const legacy = new GameSession(17);
    const checkpoint = legacy.game.exportState();
    const reserved = { id: 'card-1', kind: 'lab_damper', found: true, zone: 'base', selected: true };
    checkpoint.cards.push(reserved);
    checkpoint.cards.push(...run.view.cards.map((card, i) => ({...card, id: 'card-' + (50 + i)})));
    checkpoint.nextId = 100;
    checkpoint.health = 2;
    checkpoint.supplies = 0;
    const restored = SurvivalGame.fromState(checkpoint);
    assert.equal(restored.start('high').ok, false);
    assert.equal(restored.health, 2);
    assert.equal(restored.healAtShelter().ok, false);
    ok(restored.start('emergency'));
    assert.equal(restored.health, 10);
    assert.equal(restored.cards.length, run.view.cards.length + 1);
    assert.deepEqual(restored.cards.filter(c => c.found), [reserved]);
});

test('camp skills spend supplies once, enforce prerequisites, and survive reload, defeat and retry', () => {
    const session = new GameSession(17);
    const initial = session.game.exportState();
    assert.equal(SurvivalGame.fromState(initial).campSkills, undefined);
    assert.equal(learn(session, 'guard').ok, false);
    assert.deepEqual(session.game.exportState(), initial);
    ok(learn(session, 'footing'));
    ok(learn(session, 'guard'));
    const checkpoint = session.game.exportState();
    assert.equal(checkpoint.supplies, 2);
    assert.equal(learn(session, 'guard').ok, false);
    assert.equal(learn(session, 'initiative').ok, false);
    assert.deepEqual(session.game.exportState(), checkpoint);
    const restored = SurvivalGame.fromState(checkpoint);
    assert.deepEqual(restored.campSkills, ['footing', 'guard']);
    assert.throws(() => SurvivalGame.fromState({ ...checkpoint, campSkills: ['guard'] }));
    assert.throws(() => SurvivalGame.fromState({ ...checkpoint, campSkills: ['footing', 'footing'] }));
    battle(session);
    assert.equal(session.view.battle.block, 3);
    assert.equal(session.view.battle.hand.length, 5);
    assert.equal(learn(session, 'initiative').ok, false);
    while (session.view.phase === 'battle') ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.phase, 'failure');
    ok(session.execute({ type: 'retry' }));
    assert.deepEqual(session.view.campSkills, checkpoint.campSkills);
    assert.deepEqual(SurvivalGame.fromState(session.game.exportState()).campSkills, checkpoint.campSkills);
    ok(session.execute({ type: 'new-game' }));
    assert.equal(session.view.campSkills, undefined);
});

test('initiative adds one opening card and other campaigns cannot learn or trade at the gate', () => {
    const session = new GameSession(17);
    ok(learn(session, 'footing'));
    ok(learn(session, 'initiative'));
    battle(session);
    assert.equal(session.view.battle.hand.length, 6);
    assert.equal(session.view.battle.block, 1);
    ok(session.execute({ type: 'end-turn' }));
    assert.equal(session.view.battle.hand.length, 5);
    const legacy = new GameSession(17, undefined, TUTORIAL_SCENARIO);
    assert.equal(learn(legacy, 'footing').ok, false);
    assert.equal(buy(legacy, 'survey_map').ok, false);
});

test('the shop charges once for a permanent relic and validates ownership across saves, defeat and a new campaign', () => {
    const session = new GameSession(17);
    assert.equal(buy(session, 'lab_damper').ok, false);
    assert.equal(session.execute({ type: 'buy-keeper-card', kind: 'lab_damper' }).ok, false);
    ok(buy(session, 'survey_map'));
    const packed = session.game.exportState();
    assert.equal(packed.supplies, 4);
    assert.deepEqual(packed.cards, []);
    assert.deepEqual(packed.permanentRelics, ['survey_map']);
    assert.equal(buy(session, 'survey_map').ok, false);
    assert.equal(buy(session, 'keeper_watch').ok, false);
    assert.deepEqual(session.game.exportState(), packed);
    assert.deepEqual(SurvivalGame.fromState(packed).exportState(), packed);
    for (const invalid of [['absent'], ['survey_map','survey_map'], 'survey_map'])
        assert.throws(() => SurvivalGame.fromState({...packed, permanentRelics:invalid}));
    battle(session);
    session.game.supplies = 20;
    assert.equal(buy(session, 'keeper_watch').ok, false);
    while (session.view.phase === 'battle') ok(session.execute({type:'end-turn'}));
    assert.equal(session.view.phase, 'failure');
    ok(session.execute({type:'retry'}));
    assert.deepEqual(SurvivalGame.fromState(session.game.exportState()).permanentRelics, ['survey_map']);
    ok(session.execute({type:'new-game'}));
    assert.equal(session.view.permanentRelics, undefined);
});

test('survey chart reveals only the next connected caches and the magnet pays once per scavenged site', () => {
    const equipped = new GameSession(17), plain = new GameSession(17);
    equipped.game.supplies = 16;
    ok(buy(equipped, 'survey_map'));
    ok(buy(equipped, 'salvage_magnet'));
    const point = (s,id) => routeMapModel(s.view).points.find(p=>p.id===id);
    for (const s of [equipped,plain]) ok(s.execute({type:'start',tier:'emergency'}));
    assert.equal(point(plain,'threshold').title, '未知地点');
    assert.equal(point(equipped,'threshold').title, equipped.view.scenario.nodes.threshold.title);
    assert.equal(point(equipped,'threshold').decisionHint, '物资点');
    assert.equal(point(equipped,'serviceDuct').title, '未知地点');
    ok(equipped.execute({type:'enter-node',id:'threshold'}));
    assert.equal(equipped.view.supplies, 3);
    assert.equal(equipped.execute({type:'enter-node',id:'threshold'}).ok, false);
    assert.equal(equipped.view.supplies, 3);
    assert.equal(point(equipped,'serviceDuct').decisionHint, '物资卡');
    assert.equal(point(equipped,'serviceDuct').title, equipped.view.scenario.nodes.serviceDuct.title);
});

test('a completed map returns with its relic and begins the next trip with only starter cards', () => {
    const session = new GameSession(17);
    ok(buy(session, 'survey_map'));
    ok(session.execute({type:'start',tier:'emergency'}));
    const atExit = session.game.exportState(), rooms = new Map(atExit.expeditionMap.points.map(p => [p.id,p]));
    for (let id = session.view.scenario.fixedNodeId; id; id = rooms.get(id).next[0]) atExit.visited.push(id);
    atExit.fixedDone = true;
    const returned = SurvivalGame.fromState(atExit);
    assert.equal(returned.currentNode, 'return');
    returned.advanceTime(1);
    assert.deepEqual(returned.cards, []);
    assert.equal(returned.day, 2);
    const camp = SurvivalGame.fromState(returned.exportState());
    while (camp.phase === 'journal') ok(camp.continueJournal());
    assert.deepEqual(camp.permanentRelics, ['survey_map']);
    ok(camp.start('emergency'));
    assert.deepEqual(camp.cards.map(c => c.kind), atExit.cards.map(c => c.kind));
    assert.deepEqual(camp.permanentRelics, ['survey_map']);
});

test('the watch discounts the first skill for one turn, retaining its spent state on reload', () => {
    const session = new GameSession(17);
    session.game.supplies = 16;
    ok(buy(session, 'keeper_watch'));
    battle(session);
    const g = session.game;
    assert.equal(g.cardCost('lab_step'), 0);
    assert.equal(g.cardCost('lab_anchor'), 2);
    const skill = g.battle.hand.find(c => g.content.cards[c.kind].effect.type === 'block');
    const before = g.battle.stamina;
    ok(session.execute({type:'play-card', id:skill.id}));
    assert.equal(g.battle.stamina, before);
    assert.equal(SurvivalGame.fromState(g.exportState()).cardCost('lab_step'), 1);
    ok(session.execute({type:'end-turn'}));
    assert.equal(g.cardCost('lab_step'), 1);
});
