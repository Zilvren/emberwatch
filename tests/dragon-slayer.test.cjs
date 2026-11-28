const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../tools/load-ts.cjs').createLoader();
const from = (file) => load(path.join(__dirname, '../assets/game', file + '.ts'));
const { installCatalog, effectSummary } = from('core/content/CardCatalog');
const { createCardSet } = from('core/content/ContentRegistry');
const { RUN_DECK_SCENARIO, SYNTHESIS_SCENARIO, FIELD_SCENARIO } = from('core/content/GameScenario');
const { SurvivalGame } = from('core/SurvivalGame');
const { GameSession } = from('application/GameSession');
const { SaveRepository } = from('infrastructure/SaveRepository');
const { cardViewModel } = from('presentation/cards/CardViewModel');
const source = require('../assets/resources/data/cards.json');
const catalog = installCatalog(source);

const ok = (result) => assert.ok(result.ok, result.message);
const materials = ['knife', 'whetstone_1', 'whetstone_2', 'whetstone_3', 'dragon_blood'];
const steps = [
    ['sharpen_knife', ['knife', 'whetstone_1'], 'sharpened_knife'],
    ['hone_knife', ['sharpened_knife', 'whetstone_2'], 'honed_knife'],
    ['forge_dragon_slayer', ['honed_knife', 'whetstone_3', 'dragon_blood'], 'dragon_slayer'],
];

function battle(kinds, cardSet = createCardSet()) {
    const game = new SurvivalGame(7, SYNTHESIS_SCENARIO, cardSet);
    ok(game.start('standard'));
    for (const kind of kinds) game.inventoryRules.addDiscovery(kind);
    game.combatRules.startBattle('enemy1');
    game.battle.hp = game.battle.maxHp = 300;
    game.battle.attack = game.battle.strongAttack = 0;
    const cards = [...game.battle.hand, ...game.battle.draw];
    game.battle.hand = cards.filter((card) => kinds.includes(card.kind));
    game.battle.draw = cards.filter((card) => !kinds.includes(card.kind));
    return game;
}

function play(game, kind, order = 0) {
    const card = game.battle.hand.filter((card) => card.kind === kind)[order];
    assert.ok(card, `Missing ${kind} in hand`);
    ok(game.play(card.id));
    return card.id;
}

function storage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
}

test('the three exact recipes consume the specified grades and make one-slot weapons', () => {
    const session = new GameSession(19, undefined, SYNTHESIS_SCENARIO, true);
    ok(session.execute({ type: 'start', tier: 'standard' }));
    for (const kind of ['knife', 'whetstone_2', 'whetstone_3', 'dragon_blood'])
        session.game.inventoryRules.addDiscovery(kind);
    ok(session.execute({ type: 'open-recipes' }));
    const command = (recipeId) => session.execute({ type: 'synthesize', recipeId });
    const before = session.game.exportState();
    assert.equal(command('sharpen_knife').ok, false);
    assert.deepEqual(session.game.cards, before.cards);
    session.game.inventoryRules.addDiscovery('whetstone_1');
    for (const [recipeId, input, output] of steps) {
        const recipe = session.view.content.catalog.recipes.find(({ id }) => id === recipeId);
        assert.deepEqual(recipe.materials, input.map((card) => ({ card, count: 1 })));
        ok(command(recipeId));
        assert.ok(session.view.cards.some(({ kind }) => kind === output));
        assert.ok(input.every((id) => !session.view.cards.some(({ kind }) => kind === id)));
        const weapon = session.view.content.cards[output];
        assert.equal(weapon.weaponSlots, 1);
        assert.equal(weapon.effect.generatedCards.length, 1);
        assert.equal(weapon.reward, false);
    }
    ok(session.execute({ type: 'undo-synthesis' }));
    assert.ok(session.view.cards.some(({ kind }) => kind === 'dragon_blood'));
    assert.ok(session.view.cards.some(({ kind }) => kind === 'whetstone_3'));
    assert.equal(session.view.cards.some(({ kind }) => kind === 'dragon_slayer'), false);
});

test('same-name weapons generate separately while equipment strength uses only the highest', () => {
    const game = battle(['dragon_slayer', 'dragon_slayer', 'honed_knife', 'whetstone_1']);
    play(game, 'dragon_slayer');
    play(game, 'whetstone_1');
    assert.equal(game.strength, 5);
    assert.ok(game.battle.hand.every(({ kind }) => kind !== 'slash_dragon'));
    const secondBlade = game.battle.hand.find(({ kind }) => kind === 'dragon_slayer').id;
    const lowerBlade = game.battle.hand.find(({ kind }) => kind === 'honed_knife').id;
    game.endTurn();
    game.combatRules.drawCards(10);
    ok(game.play(secondBlade));
    assert.equal(game.strength, 5);
    assert.equal(game.battle.hand.filter(({ kind }) => kind === 'slash_dragon').length, 1);
    game.endTurn();
    game.combatRules.drawCards(10);
    const slashes = game.battle.hand.filter(({ kind }) => kind === 'slash_dragon');
    assert.equal(slashes.length, 3);
    assert.equal(game.attackDamage('slash_dragon'), 25);
    const firstSlash = play(game, 'slash_dragon');
    assert.ok(!game.battle.discard.some(({ id }) => id === firstSlash));
    game.combatRules.drawCards(10);
    ok(game.play(lowerBlade));
    assert.equal(game.battle.cardChoice.mode, 'replace-weapon');
    ok(game.resolveCombatChoice(game.battle.weapons[0].id));
    assert.equal(game.strength, 5);
    game.endTurn();
    assert.ok(game.battle.hand.some(({ kind }) => kind === 'slash_rank_two'));
});

test('swapping the last strong weapon changes current strength without changing a generated slash', () => {
    const game = battle(['dragon_slayer', 'honed_knife', 'long_wood_stick']);
    const lower = game.battle.hand.find(({ kind }) => kind === 'honed_knife').id;
    play(game, 'dragon_slayer');
    play(game, 'long_wood_stick');
    game.endTurn();
    game.combatRules.drawCards(10);
    assert.ok(game.battle.hand.some(({ kind }) => kind === 'club_hit'));
    assert.equal(game.attackDamage('club_hit'), game.content.cards.club_hit.effect.amount + 4);
    ok(game.play(lower));
    ok(game.resolveCombatChoice(game.battle.weapons[0].id));
    assert.equal(game.strength, 2);
    assert.equal(game.attackDamage('slash_dragon'), 22);
    const hp = game.battle.hp;
    play(game, 'slash_dragon');
    assert.equal(game.battle.hp, hp - 22);
});

test('each stone and dragon blood can be used once, survives the run, and restores correctly', () => {
    const game = battle(['whetstone_3', 'whetstone_3', 'dragon_blood', 'dragon_blood']);
    play(game, 'whetstone_3');
    play(game, 'whetstone_3');
    game.health = 1;
    const usedBlood = play(game, 'dragon_blood');
    assert.equal(game.health, 10);
    assert.equal(game.strength, 4);
    const disk = storage(), repo = new SaveRepository(disk);
    repo.save(game.exportState());
    assert.equal(repo.status, '进度已保存', repo.warning);
    const resumed = new GameSession(31, new SaveRepository(disk), SYNTHESIS_SCENARIO);
    assert.ok(resumed.restored, resumed.startupMessage);
    const restored = resumed.game;
    assert.equal(restored.strength, 4);
    assert.equal(restored.play(usedBlood).ok, false);
    assert.equal(restored.cardBlocked(restored.battle.hand.find(({ kind }) => kind === 'dragon_blood')), '体力不足');
    restored.endTurn();
    restored.combatRules.drawCards(10);
    assert.equal(restored.battle.hand.filter(({ kind }) => kind === 'whetstone_3').length, 0);
    restored.health = 2;
    play(restored, 'dragon_blood');
    assert.equal(restored.health, 10);
    assert.equal(restored.cards.filter(({ kind }) => kind === 'dragon_blood').length, 2);
    assert.equal(restored.cards.filter(({ kind }) => kind === 'whetstone_3').length, 2);
    restored.combatRules.startBattle('enemy1');
    assert.equal(restored.strength, 0);
    assert.equal([...restored.battle.hand, ...restored.battle.draw].filter(({ kind }) => kind === 'dragon_blood').length, 2);
});

test('strength affects each direct hit but leaves block and the shield-spear percent bonus unchanged', () => {
    const authored = structuredClone(catalog);
    authored.cards.find(({ id }) => id === 'attack').effect.hits = 3;
    const game = battle(['whetstone_3', 'shield_spear', 'shield_spear_charge'], createCardSet(authored));
    play(game, 'whetstone_3');
    play(game, 'shield_spear');
    game.endTurn();
    game.combatRules.drawCards(10);
    const before = game.battle.hp;
    assert.equal(game.attackDamage('attack'), (2 + 2) * 3);
    play(game, 'attack');
    assert.equal(game.battle.hp, before - 12);
    assert.equal(game.battle.rage, 1);
    play(game, 'dodge');
    assert.equal(game.battle.block, 2);
    game.combatRules.drawCards(2);
    game.battle.rage = 5;
    const charged = 10 + 2 + Math.ceil(game.battle.maxHp * 0.05);
    assert.equal(game.attackDamage('shield_spear_charge'), charged);
    play(game, 'shield_spear_charge');
    assert.equal(game.battle.hp, before - 12 - charged);
});

test('early rewards include every material and card descriptions distinguish uses and strength', () => {
    const game = new SurvivalGame(17, SYNTHESIS_SCENARIO);
    assert.ok(materials.every((id) => game.content.rewardPool.includes(id)));
    assert.ok(game.content.rewardWeights.dragon_blood < game.content.rewardWeights.whetstone_3);
    const salt = new SurvivalGame(17, FIELD_SCENARIO);
    assert.ok(!materials.slice(1).some((id) => salt.content.rewardPool.includes(id)));
    const { cards } = game.content;
    assert.match(effectSummary(cards.dragon_slayer, cards), /力量.*每回合生成「屠龙挥砍」/);
    assert.match(cardViewModel(cards.whetstone_3).description, /每张每场限用一次/);
    assert.match(cardViewModel(cards.dragon_blood).fullDescription, /恢复 10 点血量[\s\S]*每张每场限用一次/);
    assert.equal(cardViewModel(cards.slash_dragon, cards, '体力', { damage: 24 }).effect, '造成 24 点伤害');
});

test('a configured save without sharpening cards or recipes resumes the older map', () => {
    const oldCatalog = {
        ...catalog,
        cards: catalog.cards.filter(({ synthesisOnly, fist }) => !synthesisOnly && !fist),
        recipes: catalog.recipes.filter(({ id }) => !steps.some(([recipeId]) => id === recipeId)),
        labyrinth: {
            ...catalog.labyrinth,
            decks: catalog.labyrinth.decks.filter(({ id }) => id !== 'fist-combos'),
            enabledDecks: catalog.labyrinth.enabledDecks.filter((id) => id !== 'fist-combos'),
        },
    };
    const disk = storage();
    installCatalog(oldCatalog);
    try {
        const session = new GameSession(19, new SaveRepository(disk), RUN_DECK_SCENARIO);
        ok(session.execute({ type: 'start', tier: 'standard' }));
        ok(session.execute({ type: 'enter-node' }));
        const expected = session.game.exportState();
        installCatalog(source);
        const current = new GameSession(23, new SaveRepository(disk), SYNTHESIS_SCENARIO);
        assert.ok(current.restored, current.startupMessage);
        assert.deepEqual(current.game.exportState(), expected);
        ok(current.execute({ type: 'new-game' }));
        assert.equal(current.game.scenario.version, SYNTHESIS_SCENARIO.version);
    } finally {
        installCatalog(source);
    }
});
