const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const load = require('../tools/load-ts.cjs').createLoader();
load(path.join(root, 'assets/game/core/content/CardCatalog.ts')).installCatalog(
    JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/data/cards.json'), 'utf8'))
);
const { GameSession } = load(path.join(root, 'assets/game/application/GameSession.ts'));
const { TUTORIAL_SCENARIO } = load(path.join(root, 'assets/game/core/content/GameScenario.ts'));
class LegacySession extends GameSession {
    constructor(seed, saves) {
        super(seed, saves, TUTORIAL_SCENARIO);
    }
}
const { UiActionRouter } = load(path.join(root, 'assets/game/presentation/ui/UiActionRouter.ts'));
const { initialUiState } = load(path.join(root, 'assets/game/presentation/ui/UiState.ts'));
function setup() {
    const session = new LegacySession(17),
        ui = initialUiState(),
        commands = [],
        messages = [];
    const router = new UiActionRouter(session, ui, {
        act(command) {
            commands.push(command);
            return session.execute(command);
        },
        refresh() {},
        playCard() {},
        enemyTurn() {},
        sound() {},
        toggleAudio() {},
        healEffect() {},
        message(text) {
            messages.push(text);
        },
    });
    const click = (id) => router.handle({ id, payload: '' });
    return { session, ui, commands, messages, click, game: session.game };
}
function fixedRewards() {
    const c = setup();
    c.session.execute({ type: 'start' });
    c.session.execute({ type: 'enter-node' });
    return c;
}
test('leaving unclaimed rewards requires confirmation and cancel preserves the whole checkpoint', () => {
    const c = fixedRewards(),
        before = c.game.exportState();
    c.click('rewards-done');
    assert.equal(c.ui.overlay, 'reward-leave');
    assert.deepEqual(c.game.exportState(), before);
    c.click('modal-cancel');
    assert.equal(c.ui.overlay, null);
    assert.deepEqual(c.game.exportState(), before);
    c.click('rewards-done');
    c.click('modal-confirm');
    assert.equal(c.game.phase, 'map');
    assert.equal(c.game.fixedDone, true);
    assert.deepEqual(c.commands, [{ type: 'finish-rewards' }]);
});
test('fully claimed rewards continue directly without a redundant confirmation', () => {
    const c = fixedRewards();
    c.session.execute({ type: 'claim-supplies' });
    c.session.execute({ type: 'claim-card', index: 0 });
    c.click('rewards-done');
    assert.equal(c.ui.overlay, null);
    assert.equal(c.game.phase, 'map');
});
test('supply points are collected in full after taking a weightless card', () => {
    const c = fixedRewards();
    c.session.execute({ type: 'claim-card', index: 0 });
    assert.equal(c.game.baseWeight, 0);
    const before = c.game.exportState();
    c.click('claim-supplies');
    assert.equal(c.game.supplies, before.supplies + before.rewards.supplies);
    assert.equal(c.game.rewards.supplyTaken, true);
    assert.equal(c.ui.overlay, null);
});
test('supply points can be collected with an already high resource balance', () => {
    const c = fixedRewards();
    c.session.execute({ type: 'claim-card', index: 0 });
    c.game.supplies = 40;
    const before = c.game.exportState();
    c.click('claim-supplies');
    assert.equal(c.game.supplies, before.supplies + before.rewards.supplies);
    assert.deepEqual(c.commands, [{ type: 'claim-supplies' }]);
});
test('discard cancel and confirmation return to the originating bag page, including at camp', () => {
    for (const phase of ['rewards', 'rest']) {
        const c = fixedRewards();
        c.game.phase = phase;
        c.ui.overlay = 'bag';
        c.ui.page = 1;
        const knife = c.game.cards.find((card) => card.kind === 'knife'),
            before = c.game.exportState();
        c.click('discard-' + knife.id);
        assert.equal(c.ui.overlay, 'discard');
        c.click('modal-cancel');
        assert.equal(c.ui.overlay, 'bag');
        assert.equal(c.ui.page, 1);
        assert.deepEqual(c.game.exportState(), before);
        c.click('discard-' + knife.id);
        c.click('modal-confirm');
        assert.equal(c.ui.overlay, 'bag');
        assert.equal(c.ui.page, 1);
        assert.ok(!c.game.cards.some((card) => card.id === knife.id));
    }
});
test('the camp cash shortcut returns to camp after either cancel or discard', () => {
    const c = setup();
    c.game.phase = 'rest';
    c.click('rest-cash');
    c.click('modal-cancel');
    assert.equal(c.ui.overlay, null);
    c.click('rest-cash');
    c.click('modal-confirm');
    assert.equal(c.ui.overlay, null);
    assert.ok(!c.game.cards.some((card) => card.kind === 'cash'));
});
test('continuing a key journal returns to shelter without resetting the campaign', () => {
    const c = setup();
    c.session.execute({ type: 'start' });
    Object.assign(c.game, { fixedDone: true, route: 'A', pathIndex: 4 });
    c.session.advanceTime(1);
    c.game.day = 2;
    const before = c.game.exportState();
    c.click('journal-start');
    assert.equal(c.ui.overlay, null);
    assert.equal(c.game.phase, 'shelter');
    assert.equal(c.game.day, 2);
    assert.equal(c.game.supplies, before.supplies);
    assert.deepEqual(c.game.cards, before.cards);
    assert.equal(c.game.journalEntries.find(entry => entry.id === 'tutorial-cleared').read, true);
});
test('an open confirmation blocks underlying reward actions', () => {
    const c = fixedRewards();
    c.click('rewards-done');
    const before = c.game.exportState();
    c.click('claim-card-0');
    c.click('claim-supplies');
    assert.deepEqual(c.game.exportState(), before);
    assert.equal(c.ui.overlay, 'reward-leave');
});

test('reward comparison is transient and only confirmation claims a card once', () => {
    const c = fixedRewards(),
        before = c.game.exportState();
    c.click('reward-select-0');
    assert.equal(c.ui.rewardSelection, 0);
    assert.deepEqual(c.game.exportState(), before);
    c.click('claim-card-0');
    const after = c.game.exportState();
    assert.equal(c.game.rewards.cardTaken, true);
    assert.equal(c.game.cards.length, before.cards.length + 1);
    c.click('claim-card-0');
    assert.deepEqual(c.game.exportState(), after);
});
test('inventory filters, sorting and card reader never execute game commands', () => {
    const c = setup(),
        before = c.game.exportState();
    c.click('bag');
    c.click('bag-filter-deck');
    c.click('bag-sort');
    c.click('inspect-' + c.game.cards[0].id);
    assert.equal(c.ui.bagReader, true);
    c.click('modal-close');
    assert.equal(c.ui.overlay, 'bag');
    assert.equal(c.ui.bagReader, false);
    c.click('modal-close');
    assert.equal(c.ui.overlay, null);
    assert.deepEqual(c.game.exportState(), before);
    assert.equal(c.commands.length, 0);
});
test('camp card selection goes through the existing toggle command', () => {
    const c = setup();
    c.game.phase = 'rest';
    const card = c.game.cards.find((card) => card.kind === 'dodge');
    const selected = card.selected;
    c.click('rest-bag');
    assert.equal(c.ui.deckEdit, true);
    c.click('inspect-' + card.id);
    assert.equal(card.selected, !selected);
    assert.deepEqual(c.commands, [{ type: 'toggle-card', id: card.id }]);
    assert.equal(c.ui.bagReader, false);
});
test('map browsing is read-only and cannot replace another open modal', () => {
    const c = setup(),
        before = c.game.exportState();
    c.click('map');
    assert.equal(c.ui.overlay, 'map');
    c.click('map');
    assert.equal(c.ui.overlay, null);
    c.click('bag');
    c.click('map');
    assert.equal(c.ui.overlay, 'bag');
    assert.deepEqual(c.game.exportState(), before);
    assert.equal(c.commands.length, 0);
});

test('camp deck entry does not inherit the reward overflow filter or change selected cards', () => {
    const c = setup();
    c.game.phase = 'rewards';
    c.click('reward-bag');
    c.click('bag-filter-overflow');
    c.click('modal-close');
    c.game.phase = 'rest';
    const before = c.game.exportState();
    c.click('rest-bag');
    assert.equal(c.ui.deckEdit, true);
    assert.equal(c.ui.bagFilter, 'all');
    assert.deepEqual(c.game.exportState(), before);
    assert.equal(c.commands.length, 0);
});
test('switching from bag browsing to deck editing resets its filter without executing commands', () => {
    const c = setup();
    c.game.phase = 'rest';
    c.click('bag');
    c.click('bag-filter-overflow');
    c.click('bag-mode');
    assert.equal(c.ui.deckEdit, true);
    assert.equal(c.ui.bagFilter, 'all');
    c.click('modal-close');
    c.click('rules-help');
    assert.equal(c.ui.overlay, 'help');
    assert.equal(c.commands.length, 0);
});
