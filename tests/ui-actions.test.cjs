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
const { UiActionRouter } = load(path.join(root, 'assets/game/presentation/ui/UiActionRouter.ts'));
const { initialUiState } = load(path.join(root, 'assets/game/presentation/ui/UiState.ts'));
function setup() {
    const session = new GameSession(17), ui = initialUiState(), commands = [], messages = [];
    const router = new UiActionRouter(session, ui, {
        act(command) { commands.push(command); return session.execute(command); },
        refresh() {}, playCard() {}, enemyTurn() {}, sound() {}, toggleAudio() {}, healEffect() {},
        message(text) { messages.push(text); },
    });
    const click = id => router.handle({ id, payload: '' });
    return { session, ui, commands, messages, click, game: session.game };
}
function fixedRewards() {
    const c = setup();
    c.session.execute({ type: 'start' });
    c.session.execute({ type: 'enter-node' });
    return c;
}
test('leaving unclaimed rewards requires confirmation and cancel preserves the whole checkpoint', () => {
    const c = fixedRewards(), before = c.game.exportState();
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
test('partial supply claims show the loss before any resource or reward flag changes', () => {
    const c = fixedRewards();
    c.session.execute({ type: 'claim-card', index: 0 });
    assert.equal(c.game.baseWeight, 29);
    const before = c.game.exportState();
    c.click('claim-supplies');
    assert.equal(c.ui.overlay, 'supply-overflow');
    assert.deepEqual(c.game.exportState(), before);
    c.click('modal-close');
    assert.deepEqual(c.game.exportState(), before);
    c.click('claim-supplies');
    c.click('modal-confirm');
    assert.equal(c.game.supplies, before.supplies + 1);
    assert.equal(c.game.rewards.supplyTaken, true);
    assert.equal(c.ui.overlay, null);
});
test('a full bag cannot accidentally consume a zero-yield supply reward', () => {
    const c = fixedRewards();
    c.session.execute({ type: 'claim-card', index: 0 });
    c.game.supplies++;
    assert.equal(c.game.baseWeight, 30);
    const before = c.game.exportState();
    c.click('claim-supplies');
    assert.deepEqual(c.game.exportState(), before);
    assert.match(c.messages[0], /先整理背包/);
    assert.equal(c.commands.length, 0);
});
test('discard cancel and confirmation return to the originating bag page, including at camp', () => {
    for (const phase of ['rewards', 'rest']) {
        const c = fixedRewards();
        c.game.phase = phase;
        c.ui.overlay = 'bag'; c.ui.page = 1;
        const knife = c.game.cards.find(card => card.kind === 'knife'), before = c.game.exportState();
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
        assert.ok(!c.game.cards.some(card => card.id === knife.id));
    }
});
test('the camp cash shortcut returns to camp after either cancel or discard', () => {
    const c = setup(); c.game.phase = 'rest';
    c.click('rest-cash'); c.click('modal-cancel');
    assert.equal(c.ui.overlay, null);
    c.click('rest-cash'); c.click('modal-confirm');
    assert.equal(c.ui.overlay, null);
    assert.ok(!c.game.cards.some(card => card.kind === 'cash'));
});
test('replaying a completed teaching day cannot erase the result without confirmation', () => {
    const c = setup(); c.game.phase = 'day2'; c.game.day = 2;
    const before = c.game.exportState();
    c.click('journal-start');
    assert.equal(c.ui.overlay, 'restart');
    assert.deepEqual(c.game.exportState(), before);
    c.click('modal-cancel');
    assert.deepEqual(c.game.exportState(), before);
    c.click('journal-start'); c.click('modal-confirm');
    assert.equal(c.game.phase, 'journal');
    assert.equal(c.game.day, 1);
});
test('an open confirmation blocks underlying reward actions', () => {
    const c = fixedRewards();
    c.click('rewards-done');
    const before = c.game.exportState();
    c.click('claim-card-0'); c.click('claim-supplies');
    assert.deepEqual(c.game.exportState(), before);
    assert.equal(c.ui.overlay, 'reward-leave');
});
