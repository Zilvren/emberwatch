const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const from = file => load(path.resolve(__dirname, '../assets/game', file + '.ts'));
const source = require('../assets/resources/data/cards.json');
const { installCatalog, validateCatalog } = from('core/content/CardCatalog');
const { createCardSet } = from('core/content/ContentRegistry');
const { ASHEN_LABYRINTH_SCENARIO } = from('core/content/GameScenario');
const { Random } = from('core/Random');
const { RuleFeedback } = from('core/systems/RuleContext');
const { RewardRules } = from('core/systems/RewardRules');
const { GameSession } = from('application/GameSession');
const { SaveRepository } = from('infrastructure/SaveRepository');
const { cardViewModel } = from('presentation/cards/CardViewModel');

const content = createCardSet(validateCatalog(source));

test('card faces resolve authored grades, legacy defaults and starter or generated cards', () => {
    const rarity = kind => cardViewModel(content.cards[kind], content.cards, '体力', {
        labyrinth: true,
        labyrinthCatalog: content.catalog.labyrinth,
    }).rarity;
    assert.equal(rarity('ration_voucher'), 'legendary');
    assert.equal(rarity('sealed_battery'), 'rare');
    assert.equal(rarity('shield_spear'), 'epic');
    assert.equal(rarity('knife'), 'common');
    assert.equal(rarity('lab_step'), undefined);
    assert.equal(rarity('fist_uppercut_temp'), undefined);
    const invalid = structuredClone(source);
    invalid.cards.find(card => card.id === 'slash').rarity = 'legendary';
    assert.throws(() => validateCatalog(invalid), /稀有度/);
});

function rolls(layer, sample, set = content, pool = set.catalog.labyrinth.discoveryPool) {
    const state = {
        discoveryPool: pool,
        pathIndex: 0,
        visited: [],
        supplies: 0,
        expeditionMap: { points: ['fallenShelves', 'serviceDuct', 'lightCut'].map(id => ({ id, layer })) },
    };
    const random = new Random(1);
    random.next = () => sample;
    const rules = new RewardRules(state, new RuleFeedback(state), set, undefined,
        reason => assert.fail(reason), ASHEN_LABYRINTH_SCENARIO, random);
    return { state, rules };
}

test('battle offers take one gold roll and make room for an unlocked finisher', () => {
    const gold = cards => cards.filter(kind => content.cards[kind].rarity === 'legendary');
    const early = rolls(1, .04), late = rolls(16, .04);
    for (const { state, rules } of [early, late]) {
        rules.collectFieldSupplies('fallenShelves', 0, 3);
        assert.equal(state.rewards.cards.length, 3);
        assert.equal(new Set(state.rewards.cards).size, 3);
        assert.ok(state.rewards.cards.every(kind => !content.cards[kind].fist));
    }
    assert.equal(gold(early.state.rewards.cards).length, 0);
    assert.equal(gold(late.state.rewards.cards).length, 1);
    late.rules.collectBattleRewards('lightCut', 1, 3, ['fist_straight_four']);
    assert.equal(late.state.rewards.guaranteedFinisher, 'fist_straight_four');
    assert.equal(late.state.rewards.cards.length, 3);
    assert.equal(gold(late.state.rewards.cards).length, 1);

    const smallGoldPool = rolls(16, .04, content, ['evade', 'knife', 'dragon_slayer']);
    smallGoldPool.rules.collectBattleRewards('lightCut', 0, 3, []);
    assert.deepEqual(gold(smallGoldPool.state.rewards.cards), ['dragon_slayer']);
    const withoutGold = rolls(16, .04, content, ['evade', 'knife']);
    withoutGold.rules.collectBattleRewards('lightCut', 0, 3, []);
    assert.deepEqual(withoutGold.state.rewards.cards.sort(), ['evade', 'knife']);
});

test('supply offers use their own grades and sample only within the selected grade', () => {
    const draft = structuredClone(source);
    draft.cards.find(card => card.id === 'salvage_rope').rewardWeight = .01;
    draft.cards.find(card => card.id === 'supply_1').rewardWeight = 100;
    const set = createCardSet(validateCatalog(draft));
    const early = rolls(1, .04, set), late = rolls(16, .04, set);
    early.rules.collectFieldSupplies('serviceDuct', 2);
    late.rules.collectFieldSupplies('serviceDuct', 2);
    assert.deepEqual(early.state.rewards.cards, ['supply_1']);
    assert.deepEqual(late.state.rewards.cards, ['ration_voucher']);
    assert.equal(late.state.supplies, 2);
});

test('changing rarity and same-grade weights preserves an already displayed offer on reload', () => {
    installCatalog(source);
    const data = new Map();
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const session = new GameSession(71, new SaveRepository(storage));
    for (const command of [
        { type: 'start', tier: 'standard' },
        { type: 'enter-node', id: 'threshold' },
        { type: 'enter-node', id: 'serviceDuct' },
        { type: 'discover', kind: null },
        { type: 'enter-node', id: 'stampedDrawer' },
    ]) {
        const result = session.execute(command);
        assert.ok(result.ok, result.message);
    }
    const pending = session.game.exportState();
    assert.ok(pending.rewards.cards.includes('dragon_slayer'));
    const draft = structuredClone(source);
    Object.assign(draft.cards.find(card => card.id === 'dragon_slayer'), { rarity: 'rare', rewardWeight: 2.5 });
    installCatalog(draft);
    const resumed = new GameSession(1, new SaveRepository(storage));
    assert.ok(resumed.restored, resumed.startupMessage);
    assert.deepEqual(resumed.game.exportState(), pending);
    assert.equal(resumed.view.content.cards.dragon_slayer.rarity, 'rare');
});
