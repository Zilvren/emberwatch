const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const root = path.resolve(__dirname, '..');
const from = (file) => load(path.join(root, 'assets/game', file + '.ts'));
const catalog = from('core/content/CardCatalog');
catalog.installCatalog(require('../assets/resources/data/cards.json'));
const { SurvivalGame } = from('core/SurvivalGame');
const { RUN_DECK_SCENARIO } = from('core/content/GameScenario');

const own = (kind, index) => ({
    id: `${kind}-${index}`,
    kind,
    zone: 'base',
    selected: true,
    found: true,
});

function battle() {
    const game = new SurvivalGame(7, RUN_DECK_SCENARIO);
    game.phase = 'battle';
    game.entryTier = 'standard';
    game.cards = [];
    game.battle = {
        stamina: 3,
        maxStamina: 3,
        enemy: 'enemy1',
        hp: 50,
        maxHp: 50,
        attack: 1,
        strongAttack: 2,
        turn: 1,
        intent: 'attack',
        boosted: false,
        block: 0,
        draw: [],
        hand: [],
        discard: [],
        weapon: null,
        weapons: [],
        weaponTurns: {},
        equippedTurn: 0,
        rage: 0,
    };
    return game;
}

test('the shield-spear route is authored with three recipes and weighted materials', () => {
    const game = new SurvivalGame(7, RUN_DECK_SCENARIO);
    assert.deepEqual(game.content.catalog.recipes.filter(({ products }) =>
        products.some(({ card }) => ['rough_spear', 'steel_spear', 'shield_spear'].includes(card))
    ).map(({ id }) => id), [
        'knife_and_long_wood_stick',
        'rough_spear_and_scrap_blade',
        'steel_spear_and_metal_guard',
    ]);
    assert.equal(game.content.cards.knife.initialCount, 0);
    assert.equal(game.content.cards.knife.reward, true);
    assert.equal(game.content.cards.shield_spear.weaponSlots, 2);
    assert.equal(game.content.cards.long_wood_stick.weaponSlots, 1);
    assert.equal(game.content.rewardWeights.long_wood_stick, 1);
});

test('crafting boosts the next material once and consumes the materials', () => {
    const game = new SurvivalGame(7, RUN_DECK_SCENARIO);
    game.phase = 'rest';
    game.cards = [own('knife', 1), own('long_wood_stick', 2), own('scrap_blade', 3), own('metal_guard', 4)];
    assert.equal(game.synthesis.craft('knife_and_long_wood_stick', false).ok, true);
    assert.equal(game.synthesisRewardBoosts.scrap_blade, 2);
    assert.equal(game.cards.some(({ kind }) => kind === 'rough_spear'), true);
    assert.equal(game.synthesis.craft('rough_spear_and_scrap_blade', false).ok, true);
    assert.equal(game.synthesisRewardBoosts.metal_guard, 2);
    assert.equal(game.synthesisBoostedRecipes.includes('rough_spear_and_scrap_blade'), true);
});

test('finding one first-layer material doubles the other material until it is claimed', () => {
    const game = new SurvivalGame(7, RUN_DECK_SCENARIO);
    game.phase = 'rewards';
    game.rewards = {
        source: 'scavenge',
        supplies: 0,
        cards: ['knife'],
        supplyTaken: true,
        cardTaken: false,
    };
    assert.equal(game.claimCard(0).ok, true);
    assert.equal(game.synthesisRewardBoosts.long_wood_stick, 2);
    assert.equal(game.synthesisMaterialBoostedRecipes.includes('knife_and_long_wood_stick'), true);
    game.rewards = {
        source: 'scavenge',
        supplies: 0,
        cards: ['long_wood_stick'],
        supplyTaken: true,
        cardTaken: false,
    };
    assert.equal(game.claimCard(0).ok, true);
    assert.equal(game.synthesisRewardBoosts.long_wood_stick, undefined);
    game.rewards = {
        source: 'scavenge',
        supplies: 0,
        cards: ['knife'],
        supplyTaken: true,
        cardTaken: false,
    };
    assert.equal(game.claimCard(0).ok, true);
    assert.equal(game.synthesisRewardBoosts.long_wood_stick, undefined);
});

test('synthesis reward boosts clear when the run returns to shelter', () => {
    const game = new SurvivalGame(7, RUN_DECK_SCENARIO);
    game.synthesisRewardBoosts = { scrap_blade: 2 };
    game.synthesisBoostedRecipes = ['knife_and_long_wood_stick'];
    game.synthesisMaterialBoostedRecipes = ['knife_and_long_wood_stick'];
    game.phase = 'map';
    game.fixedDone = true;
    game.route = 'A';
    game.pathIndex = game.scenario.routes.A.length;
    game.cards = [];
    game.advanceTime(1);
    assert.deepEqual(game.synthesisRewardBoosts, {});
    assert.deepEqual(game.synthesisBoostedRecipes, []);
    assert.deepEqual(game.synthesisMaterialBoostedRecipes, []);
});

test('two one-slot weapons generate their configured temporary cards', () => {
    const game = battle();
    game.battle.hand = [own('knife', 1), own('long_wood_stick', 2)].map(({ id, kind }) => ({ id, kind, temporary: false }));
    assert.equal(game.play('knife-1').ok, true);
    assert.equal(game.play('long_wood_stick-2').ok, true);
    assert.deepEqual(game.battle.weapons.map(({ kind }) => kind), ['knife', 'long_wood_stick']);
    game.endTurn();
    assert.equal(game.battle.hand.filter(({ kind }) => ['slash', 'club_hit'].includes(kind)).length, 2);
});

test('a third one-slot weapon asks which equipped weapon to replace', () => {
    const game = battle();
    game.battle.hand = [
        { id: 'card-1', kind: 'knife', temporary: false },
        { id: 'card-2', kind: 'long_wood_stick', temporary: false },
        { id: 'card-3', kind: 'scrap_blade', temporary: false },
    ];
    assert.equal(game.play('card-1').ok, true);
    assert.equal(game.play('card-2').ok, true);
    game.battle.stamina = 3;
    assert.equal(game.play('card-3').ok, true);
    assert.equal(game.battle.cardChoice.mode, 'replace-weapon');
    assert.deepEqual(game.battle.cardChoice.ids, ['card-1', 'card-2']);
    assert.equal(game.battle.stamina, 3);
    assert.equal(game.battle.hand.some(({ id }) => id === 'card-3'), true);
    game.journalEntries = [{ id: 'departure', day: 1, read: true }];
    assert.doesNotThrow(() => SurvivalGame.fromState(game.exportState()));
    assert.equal(game.resolveCombatChoice('card-1').ok, true);
    assert.deepEqual(game.battle.weapons.map(({ kind }) => kind), ['long_wood_stick', 'scrap_blade']);
    assert.equal(game.battle.discard.some(({ id }) => id === 'card-1'), true);
    assert.equal(game.battle.stamina, 2);
});

test('shield-spear accumulates rage and upgrades charge', () => {
    const game = battle();
    game.battle.hand = [{ id: 'spear', kind: 'shield_spear', temporary: false }];
    assert.equal(game.play('spear').ok, true);
    for (let index = 0; index < 5; index++) {
        const id = `attack-${index}`;
        game.battle.hand.push({ id, kind: 'attack', temporary: false });
        game.battle.stamina = 3;
        assert.equal(game.play(id).ok, true);
    }
    assert.equal(game.battle.rage, 5);
    game.battle.hand.push({ id: 'charge', kind: 'shield_spear_charge', temporary: false });
    game.battle.stamina = 3;
    assert.equal(game.play('charge').ok, true);
    assert.equal(game.battle.rage, 1);
    assert.equal(game.battle.hp, 27);
});

test('shield-spear guard copies the current defense effect and its damage counts as rage', () => {
    const game = battle();
    game.battle.hand = [
        { id: 'spear', kind: 'shield_spear', temporary: false },
        { id: 'dodge', kind: 'dodge', temporary: false },
        { id: 'guard', kind: 'shield_spear_guard', temporary: false },
    ];
    assert.equal(game.play('spear').ok, true);
    assert.equal(game.play('dodge').ok, true);
    game.battle.rage = 5;
    game.battle.stamina = 3;
    assert.equal(game.play('guard').ok, true);
    assert.equal(game.battle.block, 13);
    assert.equal(game.battle.hp, 49);
    assert.equal(game.battle.rage, 1);
});

