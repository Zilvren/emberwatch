const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const source = (file) => load(path.resolve(__dirname, '../assets/game/' + file));
source('core/content/CardCatalog.ts').installCatalog(require('../assets/resources/data/cards.json'));
const { SurvivalGame } = source('core/SurvivalGame.ts');
const { TUTORIAL_SCENARIO, STAMINA_SCENARIO } = source('core/content/GameScenario.ts');
const { routeMapModel } = source('presentation/map/RouteMapModel.ts');

function gameAt(route, step, scenario = TUTORIAL_SCENARIO) {
    const game = new SurvivalGame(17, scenario);
    game.start();
    if (route) Object.assign(game, { fixedDone: true, route, pathIndex: step });
    return game;
}

function assertWindow(game, expectedLayer) {
    const before = game.exportState();
    const map = routeMapModel(game);
    assert.equal(map.currentLayer, expectedLayer);
    assert.ok(map.points.length);
    assert.ok(map.points.every((point) => point.layer === expectedLayer || point.layer === expectedLayer + 1));
    const ids = new Set(map.points.map((point) => point.id));
    assert.equal(ids.size, map.points.length);
    assert.ok(map.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)));
    assert.deepEqual(game.exportState(), before, 'Projecting the map must not change rules or RNG');
    return map;
}

for (const scenario of [TUTORIAL_SCENARIO, STAMINA_SCENARIO]) {
    test(scenario.id + ': two equivalent opening points retain both later route choices', () => {
        const game = gameAt(null, 0, scenario);
        const map = assertWindow(game, 0);
        const openings = map.points.filter((point) => point.layer === 0);
        assert.equal(openings.length, 2);
        assert.ok(openings.every((point) => point.kind === 'fixed' && point.state === 'available' && point.action === 'enter-fixed'));
        assert.notEqual(openings[0].x, openings[1].x);
        const next = map.points.filter((point) => point.layer === 1);
        assert.deepEqual(next.map((point) => point.kind), ['enemy1', 'scavenge']);
        assert.ok(next.every((point) => point.state === 'locked'));
        for (const opening of openings)
            assert.deepEqual(map.edges.filter((edge) => edge.from === opening.id).map((edge) => edge.to).sort(), next.map((point) => point.id).sort());
        game.enterNode();
        assert.equal(game.rewards.source, 'fixed');
        game.claimSupplies();
        game.claimCard(0);
        game.finishRewards();
        assert.equal(game.currentNode, 'choice');
        const choice = assertWindow(game, 1);
        assert.deepEqual(choice.points.filter((point) => point.state === 'available').map((point) => point.action), ['route-A', 'route-B']);
        assert.ok(!choice.points.some((point) => point.kind === 'fixed'));
    });
}

for (const route of ['A', 'B']) {
    test(route + ': the visible window advances through the original branch, merge and home', () => {
        const game = gameAt(route, 0);
        for (let index = 0; index < game.scenario.routes[route].length; index++) {
            game.pathIndex = index;
            game.visited = game.scenario.routes[route].slice(0, index);
            const map = assertWindow(game, index + 1);
            const available = map.points.filter((point) => point.state === 'available');
            assert.equal(available.length, 1);
            assert.equal(available[0].kind, game.scenario.routes[route][index]);
            assert.equal(available[0].layer, index + 1);
            if (index < 2) assert.ok(!map.points.some((point) => point.kind === 'home'));
        }
        game.pathIndex = game.scenario.routes[route].length;
        const home = assertWindow(game, 5);
        assert.deepEqual(home.points.map((point) => point.kind), ['home']);
        assert.equal(home.edges.length, 0);
    });
}

test('room overlays use the same limited information during battle, rewards and rest', () => {
    for (const phase of ['battle', 'rewards', 'rest']) {
        const game = gameAt('A', phase === 'rest' ? 2 : 0);
        game.phase = phase;
        const map = assertWindow(game, phase === 'rest' ? 3 : 1);
        assert.ok(map.points.every((point) => point.kind !== 'fixed' && point.kind !== 'home'));
    }
});

test('repeated encounter kinds do not mark future encounters completed or available', () => {
    const scenario = { ...TUTORIAL_SCENARIO, routes: {
        A: ['enemy1', 'enemy1', 'rest', 'enemy2'],
        B: ['scavenge', 'enemy1', 'rest', 'enemy2'],
    } };
    const game = gameAt('A', 1, scenario);
    game.visited = ['enemy1'];
    const map = assertWindow(game, 2);
    assert.equal(map.points.find((point) => point.kind === 'enemy1').state, 'available');
    assert.equal(map.points.find((point) => point.kind === 'rest').state, 'locked');
});

test('common suffix layers stay aligned for authored branches of different lengths', () => {
    const scenario = { ...TUTORIAL_SCENARIO, routes: {
        A: ['enemy1', 'scavenge', 'rest', 'enemy2'],
        B: ['scavenge', 'rest', 'enemy2'],
    } };
    const game = gameAt('B', 1, scenario);
    const map = assertWindow(game, 3);
    assert.deepEqual(map.points.map((point) => point.kind), ['rest', 'enemy2']);
    assert.equal(map.points[0].state, 'available');
});

test('a save reload preserves the same visible layer and the later route without new fields', () => {
    const game = gameAt('B', 1);
    game.visited = ['fixed', 'scavenge'];
    assert.deepEqual(routeMapModel(SurvivalGame.fromState(game.exportState())), routeMapModel(game));
    assert.deepEqual(game.scenario.routes, TUTORIAL_SCENARIO.routes);
});
