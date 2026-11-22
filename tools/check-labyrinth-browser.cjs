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
        await click('journal-start');
        if (tier) await click('entry-tier-' + tier);
        await click('entry-confirm');
        await click('enter-threshold');
        if (route) await click('route-' + route);
    }
    return { state, save, idle, click, depart };
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
async function oneRoute(browser, url, lane) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: lane === 'A' ? 'no-preference' : 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=17&save=on');
        await native.idle();
        assert.equal((await native.state()).scenario, 'ashen-labyrinth');
        assert.equal((await native.save()).cards.length, 12);
        if (lane === 'A') await image(page, '01-journal');
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
                enemies.push({ node: snap.currentNode, actor: b.enemy, armor: save.armor, hp: b.maxHp });
                if (chosen && [...b.draw, ...b.hand].some((c) => c.kind === chosen)) nextHand = true;
                if (lane === 'A' && !enemies.slice(0, -1).some((e) => e.actor === b.enemy)) {
                    await page.waitForTimeout(180);
                    await image(page, '03-' + b.enemy);
                    await page.emulateMedia({ reducedMotion: 'no-preference' });
                    await page.waitForFunction(() => !globalThis.__emberUI.snapshot().reducedMotion);
                    await Promise.all([
                        page.waitForFunction(() => globalThis.__emberUI.snapshot().enemyMotion === 'attack'),
                        native.click('end-turn', false),
                    ]);
                    await native.idle();
                    assert.equal((await native.state()).armor, snap.armor - b.attack);
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
        return { lane, enemies, options, initialArmor: 10, finalArmor: returned.armor,
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
