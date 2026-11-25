const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createEditorServer } = require('./card-editor-server.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright/ashen-labyrinth');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
    paths: [root, path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')],
}));
const source = path.join(root, 'assets/resources/data/cards.json');
const report = { passed: false, platform: 'Pink/Cocos Web Desktop', runtimeErrors: [], consoleErrors: [], actions: [] };
fs.mkdirSync(output, { recursive: true });

function input(page, view = page) {
    const state = () => view.evaluate(() => globalThis.__emberUI.snapshot());
    const save = () => view.evaluate(() => globalThis.__survivalGame.exportState());
    const idle = () => view.waitForFunction(
        () => globalThis.__emberUI?.snapshot().ready && !globalThis.__emberUI.snapshot().busy,
        null, { timeout: 16000 });
    async function target(id) {
        const current = await state(), match = current.hits.find((v) => v.id === id && v.enabled);
        assert.ok(match, `${current.phase} · 缺少可用按钮 ${id}`);
        const rect = await view.locator('#GameCanvas').boundingBox();
        const scale = Math.min(rect.width / 1440, rect.height / 900);
        return [
            rect.x + (rect.width - 1440 * scale) / 2 + (match.x + match.width / 2) * scale,
            rect.y + (rect.height - 900 * scale) / 2 + (match.y + match.height / 2) * scale,
        ];
    }
    async function click(id, wait = true) {
        await idle();
        const before = await state();
        await page.mouse.click(...await target(id));
        if (wait) {
            await idle();
            const next = await state();
            report.actions.push({ id, source: before.currentNode, from: before.phase, to: next.phase });
        }
    }
    async function depart(route, tier) {
        await click('camp-keeper');
        await click('camp-depart');
        if (tier) await click('entry-tier-' + tier);
        await click('entry-confirm');
        await click('enter-threshold');
        if (route) await click('route-' + route);
    }
    return { state, save, idle, click, depart, target };
}
const image = (page, name) => page.screenshot({ path: path.join(output, name + '.png') });
function observe(page) {
    page.on('pageerror', (error) => report.runtimeErrors.push(error.message));
    page.on('console', (entry) => {
        if (entry.type() !== 'error') return;
        const url = entry.location().url;
        report.consoleErrors.push(url ? `${entry.text()} (${url})` : entry.text());
    });
}
async function campText(page) {
    return page.evaluate(() => {
        const panel = cc.director.getScene().getComponentInChildren('CampStationPanel');
        return { title: panel.title.string, context: panel.context.string, body: panel.body.string };
    });
}
async function controlGlyph(page, id) {
    return page.evaluate(id => {
        const action = cc.director.getScene().getComponentsInChildren('ButtonAction')
            .find(item => item.node.activeInHierarchy && item.actionId === id);
        const surface = action?.getComponent('ButtonPresentation')?.surface;
        return {
            textShown: action?.caption?.enabled,
            symbol: (surface ?? action?.node)?.getChildByName('ControlGlyph')?.getComponent(cc.Sprite)?.spriteFrame?.name,
        };
    }, id);
}
async function visitSettings(page, native) {
    const before = await native.save(), snapshot = await native.state();
    for (const name of ['audio', 'restart', 'help'])
        assert.ok(!snapshot.hits.some(item => item.id === name), name);
    for (const [id, symbol] of [['settings', 'settings'], ['map', 'map'], ['log', 'journal'], ['bag', 'cards']])
        assert.deepEqual(await controlGlyph(page, id), { textShown: false, symbol: 'ic-' + symbol });
    const hud = await page.evaluate(() => {
        const bar = cc.director.getScene().getComponentInChildren('StatusBar');
        return {
            visibleBacking: bar.paper.node.activeInHierarchy,
            labels: bar.node.getComponentsInChildren(cc.Label)
                .filter(label => label.enabledInHierarchy && label.string).map(label => label.string),
        };
    });
    assert.equal(hud.visibleBacking, false);
    assert.deepEqual(hud.labels.sort(), ['1', '10', '10 / 10', '12'].sort());
    await native.click('settings');
    assert.equal((await native.state()).overlay, 'settings');
    assert.deepEqual(await controlGlyph(page, 'audio'), { textShown: false, symbol: 'ic-sound' });
    await native.click('audio');
    assert.deepEqual(await controlGlyph(page, 'audio'), { textShown: false, symbol: 'ic-muted' });
    await image(page, 'controls-settings');
    await native.click('audio');
    await native.click('restart');
    assert.equal((await native.state()).overlay, 'restart');
    await native.click('modal-cancel');
    assert.equal((await native.state()).overlay, 'settings');
    await native.click('help');
    assert.equal((await native.state()).overlay, 'help');
    await page.keyboard.press('Escape');
    assert.equal((await native.state()).overlay, 'settings');
    await native.click('modal-close');
    assert.equal((await native.state()).overlay, null);
    assert.deepEqual(await native.save(), before);
    report.settings = { iconRow: true, floatingHud: true, soundToggle: true, restartCancellation: true, helpReturnsToSettings: true };
}

async function visitPile(page, native, id) {
    const before = await native.save();
    await page.mouse.move(...await native.target(id));
    const hoveredSurfaceAlpha = await page.evaluate(id => {
        const action = cc.director.getScene().getComponentsInChildren('ButtonAction')
            .find(item => item.node.activeInHierarchy && item.actionId === id);
        return action.getComponent('ButtonPresentation').panel.fill.a;
    }, id);
    assert.equal(hoveredSurfaceAlpha, 0);
    await native.click(id);
    assert.equal((await native.state()).overlay, id);
    const panel = () => page.evaluate(() => {
        const view = cc.director.getScene().getComponentInChildren('BattlePilePanel');
        return {
            title: view.title.string,
            hint: view.hint.string,
            cards: view.holders.filter(holder => holder.active).map(holder => {
                const card = holder.getComponentInChildren('SelectableCard');
                return { kind: card.card.kind, expanded: card.card.expanded, badge: card.badge?.string };
            }),
        };
    });
    const expected = id === 'draw-pile' ? before.battle.draw : before.battle.discard;
    const current = await panel();
    assert.ok(current.title.endsWith(String(expected.length)));
    if (expected.length) {
        if (id === 'discard-pile')
            assert.deepEqual(current.cards.map(card => card.kind), expected.slice(-3).reverse().map(card => card.kind));
        else assert.ok(current.cards.every(card => /×\d/.test(card.badge)));
        await image(page, 'controls-' + id);
        await native.click('pile-inspect-0');
        assert.ok((await panel()).cards[0].expanded);
        if ((await native.state()).hits.some(hit => hit.id === 'pile-next' && hit.enabled)) {
            await native.click('pile-next');
            assert.ok((await panel()).cards.every(card => !card.expanded));
            await native.click('pile-prev');
        }
    } else {
        assert.equal(current.hint, '牌堆为空');
        assert.deepEqual(current.cards, []);
        await image(page, 'controls-empty-pile');
    }
    await page.keyboard.press('Escape');
    assert.equal((await native.state()).overlay, null);
    const focusAlpha = await page.evaluate(id => {
        const action = cc.director.getScene().getComponentsInChildren('ButtonAction')
            .find(item => item.node.activeInHierarchy && item.actionId === id);
        return action.getComponent('ButtonPresentation').focusRing.fill.a;
    }, id);
    assert.equal(focusAlpha, 0);
    assert.deepEqual(await native.save(), before);
}

async function visitCamp(page, native) {
    const initial = await native.save();
    const snapshot = await native.state();
    const stations = [
        ['camp-keeper', 'ic-keeper'], ['camp-bench', 'ic-heal'],
        ['camp-warehouse', 'ic-warehouse'], ['camp-fire', 'ic-fire'],
    ];
    for (const [id, icon] of stations) {
        assert.ok(snapshot.hits.some(hit => hit.enabled && hit.id === id), id);
        const marker = await page.evaluate(stationId => {
            const action = cc.director.getScene().getComponentsInChildren('ButtonAction')
                .find(item => item.node.activeInHierarchy && item.actionId === stationId);
            const style = action.getComponent('ButtonPresentation');
            return { fill: style.panel.fill.a, line: style.panel.line.a, icon: style.surface
                .getChildByName('ControlGlyph').getComponent(cc.Sprite).spriteFrame.name };
        }, id);
        assert.deepEqual(marker, { fill: 0, line: 0, icon }, id);
    }
    await image(page, 'camp-arrival');

    // At design size click the artwork itself, away from its nameplate.
    await page.mouse.click(903, 548);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-keeper');
    await image(page, 'camp-keeper');
    await native.click('modal-close');
    await page.mouse.click(1213, 605);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-warehouse');
    assert.match((await campText(page)).title, new RegExp(String(initial.supplies)));
    await image(page, 'camp-warehouse');
    await native.click('camp-find-keeper');
    assert.equal((await campText(page)).title, '守门人');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !globalThis.__emberUI.snapshot().overlay);
    await page.mouse.click(235, 556);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-bench');
    assert.match((await campText(page)).body, /血量已满/);
    await native.click('camp-deck');
    assert.equal((await native.state()).overlay, 'bag');
    await native.click('modal-close');
    await page.mouse.click(646, 637);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-fire');
    assert.equal((await campText(page)).title, '灰里的门槛');
    await native.click('modal-close');
    await page.keyboard.press('Tab');
    const nextFocus = await page.evaluate(() => cc.director.getScene().getChildByName('Canvas')
        .getChildByName('GameRoot').getComponent('ButtonFocusGroup').inspect().focused);
    assert.ok(['camp-bench', 'camp-fire', 'camp-keeper', 'camp-warehouse', 'bag', 'map', 'log', 'settings'].includes(nextFocus));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!globalThis.__emberUI.snapshot().overlay);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !globalThis.__emberUI.snapshot().overlay);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(160);
    await image(page, 'camp-small');
    await native.click('camp-keeper');
    assert.equal((await campText(page)).title, '守门人');
    await image(page, 'camp-keeper-small');
    await native.click('camp-depart');
    assert.equal((await native.state()).overlay, 'entry');
    await native.click('entry-tier-low');
    await native.click('modal-close');
    assert.deepEqual(await native.save(), initial);
    await page.setViewportSize({ width: 1440, height: 900 });
}
async function oneRoute(browser, url, lane) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: lane === 'A' ? 'no-preference' : 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=17&save=on');
        await native.idle();
        assert.equal((await native.state()).scenario, 'ashen-labyrinth');
        assert.equal((await native.save()).cards.length, 12);
        if (lane === 'A') {
            await visitSettings(page, native);
            await visitCamp(page, native);
        }
        await native.depart(undefined, lane === 'B' ? 'emergency' : 'standard');
        let snap = await native.state();
        assert.equal(snap.routeMap.points.filter((p) => p.kind !== 'home').length, 10);
        assert.ok(new Set(snap.routeMap.points.map((p) => p.x)).size > 6);
        if (lane === 'A') await image(page, '02-ten-node-map');
        await native.click('route-' + lane);
        const enemies = [], options = [];
        let flew = false, choiceReload = false, nextHand = false, chosen = null;
        const normalEnemyTurns = [];
        for (let i = 0; i < 200; i++) {
            snap = await native.state();
            const save = await native.save();
            if (snap.phase === 'journal' && save.day === 2) break;
            if (snap.phase === 'failure') throw new Error(`Route ${lane} failed at ${snap.currentNode}`);
            if (snap.phase === 'map' && snap.currentNode === 'return') {
                await page.waitForFunction(() => globalThis.__emberUI.snapshot().phase === 'journal');
                continue;
            }
            if (snap.phase === 'map') {
                await native.click('enter-' + snap.currentNode);
                continue;
            }
            if (snap.phase === 'rest') {
                if (lane === 'A') await image(page, '07-rest');
                await native.click('rest-done');
                continue;
            }
            if (snap.phase === 'rewards') {
                assert.equal(save.rewards.discovery, true);
                assert.equal(save.rewards.cards.length, 3);
                assert.ok(save.rewards.cards.every((id) => save.discoveryPool.includes(id)));
                options.push({ source: save.rewards.source, offers: save.rewards.cards });
                if (!choiceReload && lane === 'A') {
                    await page.reload();
                    await native.idle();
                    assert.deepEqual(await native.save(), save);
                    choiceReload = true;
                    await image(page, '06-discovery');
                }
                if (lane === 'A' && chosen === null) {
                    chosen = save.rewards.cards[0];
                    await native.click('reward-select-0');
                    await native.click('discover-confirm');
                } else await native.click('rewards-done');
                continue;
            }
            assert.equal(snap.phase, 'battle');
            const b = save.battle;
            assert.ok(snap.heroRig.runtimeReady && snap.enemyRig.runtimeReady);
            assert.equal(snap.heroRig.actor, 'ashen-survivor');
            assert.equal(snap.enemyRig.actor, 'ashen-' + b.enemy);
            assert.equal(b.discovery, undefined);
            if (enemies.at(-1)?.node !== snap.currentNode) {
                enemies.push({ node: snap.currentNode, actor: b.enemy, health: save.health, hp: b.maxHp });
                if (chosen && [...b.draw, ...b.hand].some((c) => c.kind === chosen)) nextHand = true;
                if (lane === 'A' && !enemies.slice(0, -1).some((e) => e.actor === b.enemy)) {
                    await page.waitForTimeout(180);
                    await image(page, '03-' + b.enemy);
                    if (enemies.length === 1) {
                        const topShadeVisible = await page.evaluate(() => cc.director.getScene()
                            .getComponentsInChildren('SceneShade')
                            .some(shade => shade.node.activeInHierarchy && shade.top > 0));
                        assert.equal(topShadeVisible, false);
                        await visitPile(page, native, 'draw-pile');
                        await visitPile(page, native, 'discard-pile');
                    }
                    await page.emulateMedia({ reducedMotion: 'no-preference' });
                    await page.waitForFunction(() => !globalThis.__emberUI.snapshot().reducedMotion);
                    await Promise.all([
                        page.waitForFunction(() => globalThis.__emberUI.snapshot().enemyMotion === 'attack'),
                        native.click('end-turn', false),
                    ]);
                    await native.idle();
                    assert.equal((await native.state()).health, snap.health - b.attack);
                    if (enemies.length === 1) {
                        await visitPile(page, native, 'discard-pile');
                        report.piles = { drawGrouped: true, discardNewestFirst: true, emptyPile: true, checkpointUnchanged: true };
                    }
                    normalEnemyTurns.push(b.enemy);
                    if (flew) await page.emulateMedia({ reducedMotion: 'reduce' });
                    continue;
                }
            }
            if (b.cardChoice) {
                await native.click('reward-select-0');
                await native.click('resolve-choice-confirm');
                continue;
            }
            const move = await page.evaluate(() => {
                const g = globalThis.__survivalGame, b = g.battle;
                const available = b.hand.filter((c) => !g.cardBlocked(c));
                const def = (c) => g.content.cards[c.kind].effect;
                const hits = available.filter((c) => def(c).type === 'damage')
                    .sort((a, b) => g.attackDamage(b.kind) - g.attackDamage(a.kind));
                const card = available.find((c) => def(c).labyrinth?.rule === 'gain-stamina')
                    ?? hits.find((c) => g.attackDamage(c.kind) >= b.hp)
                    ?? (g.incomingDamage > b.block && !b.calm.deferred
                        ? available.find((c) => def(c).type === 'block') : undefined)
                    ?? hits[0] ?? available.find((c) => def(c).type === 'draw');
                return card ? { id: card.id, attack: def(card).type === 'damage' } : null;
            });
            if (!move) {
                await native.click('end-turn');
                continue;
            }
            const before = await native.save();
            await native.click('card-' + move.id);
            if (!move.attack) continue;
            assert.deepEqual(await native.save(), before, 'Selecting alone settled an attack.');
            assert.equal((await native.state()).flyingCard, false);
            if (lane === 'A' && !flew) {
                await Promise.all([
                    page.waitForFunction(() => globalThis.__emberUI.snapshot().flyingCard),
                    native.click('enemy-target', false),
                ]);
                const during = await native.state();
                assert.equal(during.heroMotion, 'idle');
                assert.equal(during.heroRig.motion, 'idle');
                await image(page, '04-flying-back');
                await native.idle();
                const after = await native.save();
                assert.ok(!after.battle || (after.battle.hp < before.battle.hp && !after.battle.hand.some((c) => c.id === move.id)));
                flew = true;
                await page.setViewportSize({ width: 1024, height: 768 });
                await page.waitForTimeout(180);
                await image(page, '05-smaller-viewport');
                await page.setViewportSize({ width: 1440, height: 900 });
                await page.emulateMedia({ reducedMotion: 'reduce' });
            } else await native.click('enemy-target');
        }
        const beforeReturn = await native.save();
        assert.equal(beforeReturn.day, 2);
        assert.equal(beforeReturn.cards.length, 12);
        assert.equal(beforeReturn.visited.length, lane === 'A' ? 8 : 7);
        assert.equal(beforeReturn.settlement.discoveredCards, lane === 'A' ? 1 : 0);
        if (lane === 'A') {
            assert.ok(flew && choiceReload && nextHand);
            assert.deepEqual(normalEnemyTurns, ['ash-moth', 'stone-claw', 'veil-idol']);
        }
        await native.click('journal-start');
        if (lane === 'A') await image(page, '08-shelter');
        const returned = await native.save();
        await page.reload();
        await native.idle();
        assert.deepEqual(await native.save(), returned);
        if (lane === 'A') {
            await native.click('camp-fire');
            assert.equal((await campText(page)).title, '沉灯熄灭之后');
            await native.click('camp-prev');
            assert.equal((await campText(page)).title, '灰里的门槛');
            await native.click('camp-next');
            assert.match((await campText(page)).context, /第 2 天/);
            await native.click('modal-close');
            await native.click('camp-bench');
            const cost = returned.settlement.treatmentCost;
            assert.ok(cost > 0);
            await native.click('camp-repair');
            assert.equal((await native.save()).supplies, returned.supplies - cost);
            assert.equal((await native.save()).health, 10);
            assert.ok(!(await native.state()).hits.some(hit => hit.id === 'camp-repair' && hit.enabled));
            await image(page, 'camp-workbench');
            await page.reload();
            await native.idle();
            await native.click('camp-warehouse');
            assert.match((await campText(page)).title, new RegExp(String(returned.supplies - cost)));
            await native.click('modal-close');
            await native.click('camp-keeper');
            await native.click('camp-depart');
            assert.equal((await native.state()).overlay, 'entry');
            await native.click('modal-close');
            report.camp = { paintedHotspots: 4, keyboardActivation: true, canceledDeparturePreservedSave: true,
                journalsReopened: 2, nextDeparture: true, warehouseStock: returned.supplies - cost,
                repairChargedOnce: cost, persistedHealth: 10, viewports: ['1440x900', '1024x768'] };
        }
        return { lane, enemies, options, initialHealth: 10, finalHealth: returned.health,
            visited: returned.visited.length, flew, nextHand, choiceReload, restoredReturn: true, normalEnemyTurns };
    } catch (error) {
        await image(page, 'failure-' + lane).catch(() => {});
        throw error;
    } finally {
        await page.close();
    }
}

async function editor(browser, url) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    observe(page);
    try {
        const oldAtlasUrl = '**/shared/ui-art.json';
        await page.route(oldAtlasUrl, route => route.fulfill({
            json: { width: 1536, height: 1024, frames: { attack: { x: 0, y: 0, width: 120, height: 120 } } },
        }));
        await page.goto(url);
        const deckButton = page.getByRole('button', { name: '发现牌组', exact: true });
        const decks = page.locator('#deck-dialog');
        await page.locator('#preview-asset-note').waitFor();
        await deckButton.click();
        assert.equal(await decks.getByRole('checkbox').count(), 3);
        await page.locator('#close-decks').click();
        assert.equal(await page.locator('#preview-art .painted-tile').count(), 0);
        await page.unroute(oldAtlasUrl);
        await page.getByRole('button', { name: '重新载入', exact: true }).click();
        await page.locator('#preview-art .painted-tile').waitFor();
        assert.equal(await page.locator('#preview-asset-note').isVisible(), false);

        await deckButton.click();
        await image(page, '09-deck-editor');
        await decks.getByRole('checkbox', { name: /共用配合/ }).uncheck();
        await decks.getByRole('checkbox', { name: /快速暂缓/ }).uncheck();
        assert.match(await page.locator('#discovery-count').textContent(), /3 种/);
        await page.locator('#save-decks').click();
        await decks.waitFor({ state: 'hidden' });
        await page.reload();
        await deckButton.click();
        assert.equal(await decks.getByRole('checkbox', { name: /蓄压倍率/ }).isChecked(), true);
        assert.equal(await decks.locator('input:checked').count(), 1);
        await page.locator('#close-decks').click();
        await page.getByRole('button', { name: /试玩游戏/ }).click();
        await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow?.__emberUI?.snapshot().ready);
        const frame = page.frames().find((f) => f.url().includes('/play/'));
        const native = input(page, frame);
        await native.depart('B');
        await native.click('enter-serviceDuct');
        await native.click('enter-abandonedStall');
        const offered = (await native.save()).rewards.cards;
        assert.deepEqual(offered.slice().sort(), ['lab_bracelet', 'lab_calibration', 'lab_valve']);
        await image(page, '10-filtered-test-run');
        await page.locator('#close-game').click();
        await page.locator('#discovery-decks').click();
        await decks.getByRole('checkbox', { name: /蓄压倍率/ }).uncheck();
        assert.match(await page.locator('#discovery-count').textContent(), /发现池为空/);
        await page.locator('#save-decks').click();
        await page.getByRole('button', { name: /试玩游戏/ }).click();
        await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow?.__emberUI?.snapshot().ready);
        const empty = input(page, page.frames().find((f) => f.url().includes('/play/')));
        await empty.depart('B');
        await empty.click('enter-serviceDuct');
        await empty.click('enter-abandonedStall');
        assert.equal((await empty.state()).phase, 'map');
        assert.equal((await empty.save()).rewards, null);
        return { mismatchedAtlasKeptControls: true, correctAtlasRecoveredOnReload: true,
            selectionPersistedAfterReload: true, selectedOneDeck: offered, deselectAllSkippedOffer: true };
    } catch (error) {
        await image(page, 'failure-editor').catch(() => {});
        throw error;
    } finally {
        await page.close();
    }
}

async function legacy(browser, url) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=18&scenario=tide&save=on');
        await native.idle();
        await native.click('journal-start');
        await native.click('entry-confirm');
        const saved = await native.save();
        await page.goto(url + '/play/?cards=live&seed=18&save=on');
        await native.idle();
        assert.deepEqual(await native.save(), saved);
        return { id: saved.scenarioId, version: saved.scenarioVersion, preserved: true };
    } finally {
        await page.close();
    }
}

async function defeat(browser, url) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=19&save=off');
        await native.idle();
        await native.depart('A', 'standard');
        await native.click('enter-lampPassage');
        let previous;
        for (let turn = 0; turn < 20; turn++) {
            const state = await native.save();
            if (state.phase === 'failure') break;
            assert.equal(state.phase, 'battle');
            previous = state;
            await native.click('end-turn');
        }
        const dead = await native.save();
        assert.equal(dead.phase, 'failure');
        assert.equal(dead.health, 0);
        assert.equal(dead.day, 2);
        assert.ok(previous.health > 0 && previous.battle.intent === 'attack');
        const effectsCleared = await page.evaluate(() => {
            const effects = cc.director.getScene().getChildByName('Canvas').getChildByName('GameRoot').getChildByName('Effects');
            return effects.children.every((child) => !child.activeInHierarchy);
        });
        assert.equal(effectsCleared, true);
        await image(page, 'controls-zero-health');
        await native.click('journal-start');
        assert.equal((await native.save()).health, 10);
        return { immediate: true, finalHealth: 0, nextDay: dead.day, recoveredHealth: 10, effectsCleared };
    } finally {
        await page.close();
    }
}

async function main() {
    const temporary = fs.mkdtempSync(path.join(root, 'temp/labyrinth-browser-'));
    const working = path.join(temporary, 'cards.json');
    fs.copyFileSync(source, working);
    const server = createEditorServer({ catalogFile: working, backupDirectory: path.join(temporary, 'backups') });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? undefined,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        report.routes = [];
        for (const lane of ['A', 'B']) report.routes.push(await oneRoute(browser, url, lane));
        report.legacy = await legacy(browser, url);
        report.editor = await editor(browser, url);
        report.defeat = await defeat(browser, url);
        assert.deepEqual(report.runtimeErrors, []);
        assert.deepEqual(report.consoleErrors, []);
        report.passed = true;
    } finally {
        await browser.close();
        await new Promise((done) => server.close(done));
    }
}
main().catch((error) => {
    report.error = String(error.stack ?? error);
    process.exitCode = 1;
}).finally(() => {
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: report.passed, routes: report.routes, editor: report.editor,
        legacy: report.legacy, actions: report.actions.length, errors: report.runtimeErrors, error: report.error }));
});
