const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader(),
    root = path.resolve(__dirname, '..');
const catalog = load(path.join(root, 'assets/game/core/content/CardCatalog.ts'));
const original = JSON.parse(
    fs.readFileSync(path.join(root, 'assets/resources/data/cards.json'), 'utf8')
);
catalog.installCatalog(original);
const { SurvivalGame } = load(path.join(root, 'assets/game/core/SurvivalGame.ts'));
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { TUTORIAL_SCENARIO } = load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
class LegacySession extends GameSession {
    constructor(seed, saves) {
        super(seed, saves, TUTORIAL_SCENARIO);
    }
}
const { SaveRepository } = load(path.join(root, 'assets/game/infrastructure/SaveRepository.ts'));
const memory = () => ({
    data: new Map(),
    getItem(key) {
        return this.data.get(key) ?? null;
    },
    setItem(key, value) {
        this.data.set(key, value);
    },
});
const ok = (result) => assert.equal(result.ok, true, result.message);
const restore = (g) => SurvivalGame.fromState(JSON.parse(JSON.stringify(g.exportState())));
function battle(seed = 17) {
    const g = new SurvivalGame(seed);
    g.start();
    g.fixedDone = true;
    g.route = 'A';
    g.enterNode();
    return g;
}

test('commands persist progress and another session continues without replaying a node cost', () => {
    const storage = memory(),
        s = new LegacySession(17, new SaveRepository(storage));
    ok(s.execute({ type: 'start' }));
    ok(s.execute({ type: 'enter-node' }));
    const loaded = new LegacySession(42, new SaveRepository(storage));
    assert.equal(loaded.restored, true);
    assert.deepEqual(loaded.game.exportState(), s.game.exportState());
    assert.equal(loaded.game.supplies, 8);
    assert.equal(loaded.game.phase, 'rewards');
    ok(loaded.execute({ type: 'claim-supplies' }));
    assert.equal(new LegacySession(1, new SaveRepository(storage)).game.rewards.supplyTaken, true);
});
test('battle roundtrip preserves random generator, piles, equipment and future draws', () => {
    const g = battle(17);
    for (let turn = 0; turn < 4 && g.phase === 'battle'; turn++) {
        const loaded = restore(g);
        assert.deepEqual(loaded.exportState(), g.exportState());
        ok(g.endTurn());
        ok(loaded.endTurn());
        assert.deepEqual(loaded.exportState(), g.exportState());
    }
});
test('older battle checkpoints discard action history while retaining the deck and key journals', () => {
    const game = battle(17);
    const original = game.exportState();
    const resumed = SurvivalGame.fromState({ ...original, logs: ['先出闪避，再出攻击。'] });
    assert.deepEqual(resumed.exportState(), original);
    assert.ok(!Object.hasOwn(resumed, 'logs'));
    ok(game.endTurn());
    ok(resumed.endTurn());
    assert.deepEqual(resumed.exportState(), game.exportState());
});
test('equipped weapons and generated temporary card ids survive restore without duplicates', () => {
    let g;
    for (let seed = 1; seed < 200; seed++) {
        const next = battle(seed);
        if (next.battle.hand.some((c) => c.kind === 'knife')) {
            g = next;
            break;
        }
    }
    assert.ok(g);
    ok(g.play(g.battle.hand.find((c) => c.kind === 'knife').id));
    ok(g.endTurn());
    const loaded = restore(g);
    assert.equal(loaded.battle.weapon.kind, 'knife');
    ok(g.endTurn());
    ok(loaded.endTurn());
    assert.deepEqual(loaded.exportState(), g.exportState());
    const cards = [
        ...loaded.battle.hand,
        ...loaded.battle.draw,
        ...loaded.battle.discard,
        loaded.battle.weapon,
    ];
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
});
test('restoration makes independent copies of inventory and battle state', () => {
    const g = battle(),
        state = g.exportState(),
        loaded = SurvivalGame.fromState(state);
    state.cards[0].selected = false;
    state.battle.hand.length = 0;
    assert.ok(loaded.battle.hand.length > 0);
    assert.equal(loaded.cards[0].selected, true);
});
test('v2 armor saves migrate to health and preserve the existing draw and discard order', () => {
    const storage = memory();
    const repo = new SaveRepository(storage);
    const game = battle();
    ok(game.endTurn());
    repo.save(game.exportState());
    const { checksum: _checksum, ...old } = JSON.parse(storage.getItem(repo.key));
    old.version = 2;
    old.state.schemaVersion = 2;
    old.state.armor = old.state.health;
    old.state.critical = false;
    delete old.state.health;
    old.state.logs = ['永久丢弃菜刀，释放 4 负重。', '领取物资 2 / 5。超出负重的部分已放弃。'];
    const encode = envelope => {
        const body = JSON.stringify(envelope);
        let checksum = 2166136261;
        for (let i = 0; i < body.length; i++) checksum = Math.imul(checksum ^ body.charCodeAt(i), 16777619);
        return JSON.stringify({ ...envelope, checksum: (checksum >>> 0).toString(16) });
    };
    const encoded = encode(old);
    storage.setItem(repo.key, encoded);

    const resumed = new LegacySession(99, new SaveRepository(storage));
    assert.equal(resumed.restored, true);
    const baseline = game.exportState();
    assert.ok(!Object.hasOwn(resumed.game.exportState(), 'logs'));
    assert.deepEqual(resumed.game.exportState(), baseline);
    ok(resumed.execute({ type: 'end-turn' }));
    const current = JSON.parse(storage.getItem(repo.key));
    assert.equal(current.version, 4);
    assert.ok(!Object.hasOwn(current.state, 'logs'));
    assert.equal(storage.getItem(repo.key + '.backup'), encoded);

    const depleted = encode({ ...old, state: { ...old.state, armor: 0, critical: true } });
    storage.setItem(repo.key, depleted);
    const defeated = new LegacySession(99, new SaveRepository(storage));
    assert.equal(defeated.restored, true);
    assert.equal(defeated.game.phase, 'failure');
    assert.equal(defeated.game.health, 0);
    assert.equal(storage.getItem(repo.key + '.backup'), depleted);
    assert.deepEqual(new LegacySession(99, new SaveRepository(storage)).game.exportState(), defeated.game.exportState());
});
test('return and optional repair survive reload without a daily payment', () => {
    const g = new SurvivalGame(2);
    ok(g.start());
    g.fixedDone = true;
    g.route = 'A';
    g.pathIndex = 4;
    g.phase = 'map';
    g.supplies = 1;
    g.health = 5;
    g.advanceTime(1);
    const loaded = restore(g);
    assert.equal(loaded.currentJournal.id, 'tutorial-cleared');
    ok(loaded.continueJournal());
    assert.equal(loaded.supplies, 1);
    ok(loaded.healAtShelter());
    assert.equal(loaded.supplies, 0);
    const afterRepair = restore(loaded);
    assert.equal(afterRepair.day, 2);
    assert.equal('dailySpent' in afterRepair.settlement, false);
    assert.deepEqual(restore(afterRepair).exportState(), afterRepair.exportState());
});
test('automatic return-to-shelter transition is saved by the application session', () => {
    const storage = memory(),
        s = new LegacySession(2, new SaveRepository(storage));
    s.game.start();
    s.game.fixedDone = true;
    s.game.route = 'A';
    s.game.pathIndex = 4;
    s.advanceTime(1);
    const loaded = new LegacySession(99, new SaveRepository(storage));
    assert.equal(loaded.game.phase, 'journal');
    assert.equal(loaded.game.currentJournal.id, 'tutorial-cleared');
    assert.deepEqual(loaded.game.exportState(), s.game.exportState());
});
test('a damaged primary save recovers its previous valid checkpoint and retains that backup', () => {
    const storage = memory(),
        repo = new SaveRepository(storage),
        s = new LegacySession(2, repo);
    s.execute({ type: 'start' });
    const checkpoint = storage.getItem(repo.key);
    s.execute({ type: 'enter-node' });
    storage.setItem(repo.key, 'damaged');
    const loaded = new LegacySession(99, new SaveRepository(storage));
    assert.equal(loaded.game.phase, 'map');
    assert.match(loaded.startupMessage, /备份/);
    loaded.execute({ type: 'enter-node' });
    assert.equal(storage.getItem(repo.key + '.backup'), checkpoint);
    assert.equal(new LegacySession(3, new SaveRepository(storage)).game.phase, 'rewards');
});
test('unsupported save versions are preserved until the player explicitly starts a new game', () => {
    const storage = memory(),
        repo = new SaveRepository(storage),
        s = new LegacySession(2, repo);
    s.execute({ type: 'start' });
    const envelope = JSON.parse(storage.getItem(repo.key));
    envelope.version = 99;
    const future = JSON.stringify(envelope);
    storage.setItem(repo.key, future);
    const loaded = new LegacySession(99, new SaveRepository(storage));
    assert.equal(loaded.restored, false);
    assert.match(loaded.startupMessage, /版本/);
    loaded.execute({ type: 'start' });
    assert.equal(storage.getItem(repo.key), future);
    ok(loaded.execute({ type: 'new-game' }));
    assert.notEqual(storage.getItem(repo.key), future);
    assert.equal(new LegacySession(3, new SaveRepository(storage)).game.phase, 'journal');
});
test('changed card definitions block overwrite instead of silently dropping owned cards', () => {
    const storage = memory(),
        repo = new SaveRepository(storage),
        s = new LegacySession(2, repo);
    s.execute({ type: 'start' });
    const before = storage.getItem(repo.key);
    const changed = JSON.parse(JSON.stringify(original));
    changed.cards[0].name += '（测试）';
    catalog.installCatalog(changed);
    try {
        const loaded = new LegacySession(3, new SaveRepository(storage));
        assert.equal(loaded.restored, false);
        assert.match(loaded.startupMessage, /卡牌配置/);
        loaded.execute({ type: 'start' });
        assert.equal(storage.getItem(repo.key), before);
    } finally {
        catalog.installCatalog(original);
    }
});
test('storage quota failure does not crash gameplay or replace the last valid save', () => {
    const storage = memory(),
        repo = new SaveRepository(storage),
        s = new LegacySession(2, repo);
    s.execute({ type: 'start' });
    const before = storage.getItem(repo.key);
    storage.setItem = () => {
        throw Error('quota');
    };
    ok(s.execute({ type: 'enter-node' }));
    assert.equal(s.game.phase, 'rewards');
    assert.equal(storage.getItem(repo.key), before);
    assert.match(s.saveStatus, /保存失败/);
});
test('invalid or unknown input commands do not mutate progress or write a new save', () => {
    const storage = memory(),
        repo = new SaveRepository(storage),
        s = new LegacySession(2, repo);
    s.execute({ type: 'start' });
    const before = storage.getItem(repo.key),
        state = s.game.exportState();
    assert.equal(s.execute({ type: 'choose-route', route: 'C' }).ok, false);
    assert.equal(s.execute({ type: 'unknown' }).ok, false);
    assert.deepEqual(s.game.exportState(), state);
    assert.equal(storage.getItem(repo.key), before);
});
test('saved state validation rejects broken phase relationships, missing cards, duplicate ids and non-finite numbers', () => {
    const g = battle(),
        good = g.exportState();
    for (const mutate of [
        (s) => (s.battle = null),
        (s) => (s.cards[0].kind = 'missing'),
        (s) => (s.cards[1].id = s.cards[0].id),
        (s) => (s.supplies = NaN),
        (s) => (s.nextId = 0),
        (s) => (s.randomState = 0),
        (s) => s.battle.hand.push(s.battle.hand[0]),
    ]) {
        const bad = JSON.parse(JSON.stringify(good));
        mutate(bad);
        assert.throws(() => SurvivalGame.fromState(bad), /存档/);
    }
});
test('existing tutorial content is a scenario configuration and enemy stats are read from it', () => {
    const definition = {
        ...TUTORIAL_SCENARIO,
        enemies: { ...TUTORIAL_SCENARIO.enemies, enemy1: { hp: 8, attack: 1, strongAttack: 3 } },
    };
    const g = new SurvivalGame(3, definition);
    g.start();
    g.fixedDone = true;
    g.route = 'A';
    g.enterNode();
    assert.equal(g.battle.hp, 8);
    assert.equal(g.incomingDamage, 1);
    assert.equal(TUTORIAL_SCENARIO.enemies.enemy1.hp, 6);
});
