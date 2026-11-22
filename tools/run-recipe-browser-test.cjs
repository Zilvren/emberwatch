const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createEditorServer } = require('./card-editor-server.cjs');
const synthesisCatalog = require('../tests/fixtures/card-synthesis.cjs');

const output = path.resolve(__dirname, '../output/playwright/synthesis');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const width = 1440;
const height = 900;

async function editor(page, origin) {
    const save = page.getByRole('button', { name: /保存到项目/ });
    await page.goto(origin);
    await page.getByRole('button', { name: '选择卡牌：基础攻击', exact: true }).click();
    const keyword = page.getByLabel('可作为合成材料', { exact: true });
    await keyword.waitFor();
    assert.equal(await keyword.isChecked(), true);
    await keyword.uncheck();
    assert.equal(await save.isDisabled(), true);
    assert.match(await page.locator('#validation').textContent(), /未勾选/);
    await keyword.check();
    assert.match(await page.locator('#preview-keywords').textContent(), /可作为合成材料/);
    await page.getByRole('link', { name: '配方编辑' }).click();
    assert.match(page.url(), /\/recipes$/);
    await page.getByRole('button', { name: '＋ 新建配方' }).click();
    assert.equal(await save.isDisabled(), true);
    await page.getByLabel('材料卡牌', { exact: true }).selectOption('wood_stick');
    await page.getByLabel('产物卡牌', { exact: true }).selectOption('wood_stick');
    assert.match(await page.locator('#recipe-validation').textContent(), /循环/);
    assert.equal(await save.isDisabled(), true);
    await page.getByLabel('产物卡牌', { exact: true }).selectOption('spare_parts');
    await save.click();
    await page.waitForFunction(() => document.querySelector('#save-state').textContent.startsWith('已保存'));
    await page.reload();
    const added = page.getByRole('button', { name: /拆解零件 ×1 木棍 ×1/ });
    await added.click();
    assert.equal(await page.getByLabel('材料卡牌', { exact: true }).inputValue(), 'wood_stick');
    await page.getByRole('button', { name: /简易长矛 ×1 木棍 ×1/ }).click();
    assert.match(await page.locator('#recipe-tree').textContent(), /由|来源/);
    assert.match(await page.locator('#recipe-tree').textContent(), /加固长矛/);
    await page.screenshot({ path: path.join(output, 'editor.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'editor-narrow.png'), fullPage: true });
    await page.setViewportSize({ width, height });
    await page.getByLabel('试玩时解锁地图合成').check();
    await page.getByRole('button', { name: '▷ 试玩游戏', exact: true }).click();
    assert.match(await page.locator('#game-frame').getAttribute('src'), /mapCraft=1/);
    await page.getByRole('button', { name: '关闭试玩 ×', exact: true }).click();
}

function gameControls(page) {
    const snapshot = () => page.evaluate(() => globalThis.__emberUI.snapshot());
    const state = () => page.evaluate(() => globalThis.__survivalGame.exportState());
    const phase = (value) => page.waitForFunction(
        (phase) => globalThis.__emberUI?.snapshot().phase === phase && !globalThis.__emberUI.snapshot().busy,
        value, { timeout: 15000 });
    const idle = () => page.waitForFunction(
        () => globalThis.__emberUI?.snapshot().ready && !globalThis.__emberUI.snapshot().busy,
        null, { timeout: 50000 });
    async function clickHit(hit) {
        const { x, y, width: canvasWidth, height: canvasHeight } = await page.locator('#GameCanvas').boundingBox();
        const scale = Math.min(canvasWidth / width, canvasHeight / height);
        await page.mouse.click(x + (canvasWidth - width * scale) / 2 + (hit.x + hit.width / 2) * scale,
            y + (canvasHeight - height * scale) / 2 + (hit.y + hit.height / 2) * scale);
        await idle();
    }
    async function click(id, payload) {
        await idle();
        const current = await snapshot();
        const hit = current.hits.find((hit) => hit.id === id && hit.enabled && (!payload || hit.payload === payload));
        assert.ok(hit, `Missing ${id}/${payload ?? ''} in ${current.phase}/${current.overlay}. Enabled ${current.hits.filter((hit) => hit.enabled).map((hit) => hit.id + ':' + hit.payload).join(', ')}`);
        await clickHit(hit);
    }
    return { snapshot, state, phase, idle, clickHit, click };
}

async function game(page, origin) {
    const lockedURL = `${origin}play/?cards=live&seed=17&save=off&scenario=synthesis`;
    const { snapshot, state, phase, idle, clickHit, click } = gameControls(page);
    const start = async () => {
        await idle();
        await click('journal-start');
        await click('entry-tier-low');
        await click('entry-confirm');
        await phase('map');
    };
    const fixed = async () => {
        await click('enter-fixed');
        await phase('rewards');
        const candidate = await page.evaluate(() => {
            const controller = cc.director.getScene().getChildByName('Canvas').getChildByName('GameRoot').getComponent('GameDirector');
            const rewardScreen = controller.scene.screens.rewards;
            const card = rewardScreen.getComponentsInChildren('CardPresentation').find((card) => card.kind === 'wood_stick');
            return card?.inspect().keywords;
        });
        assert.ok(candidate?.includes('已有搭配 · 缺此材料'), JSON.stringify(candidate));
        await click('claim-supplies');
        await click('reward-select-0');
        await click('claim-card-0');
        await click('rewards-done');
        await phase('map');
    };
    const endUnclaimed = async () => {
        await click('claim-supplies');
        await click('rewards-done');
        await click('modal-confirm');
        await phase('map');
    };

    await page.setViewportSize({ width: 1024, height: 640 });
    await page.goto(lockedURL);
    await start();
    await click('recipe-open');
    assert.match((await snapshot()).synthesisBlocked, /局外遗物/);
    await click('recipe-filter', 'partial');
    assert.ok((await snapshot()).hits.some(({ id, caption }) => id === 'recipe-card' && caption.includes('还缺')));
    await page.screenshot({ path: path.join(output, 'map-locked.png') });
    await page.keyboard.press('Escape');
    assert.equal((await snapshot()).overlay, null);
    await page.setViewportSize({ width, height });
    await fixed();
    await click('route-B');
    await click('enter-scavenge');
    await click('claim-supplies');
    await click('reward-select-0');
    await click('claim-card-0');
    await click('rewards-done');
    assert.ok((await state()).cards.some(({ kind }) => kind === 'cloth_supplies'));
    await click('enter-enemy1');
    await phase('battle');
    const before = await state();
    const endTurn = (await snapshot()).hits.find(({ id }) => id === 'end-turn');
    await click('recipe-open');
    assert.equal((await snapshot()).hits.find(({ id }) => id === 'recipe-craft').enabled, false);
    await clickHit(endTurn);
    assert.deepEqual(await state(), before);
    await page.screenshot({ path: path.join(output, 'battle-read-only.png') });
    await page.keyboard.press('Escape');
    assert.deepEqual(await state(), before);
    let stick = (await snapshot()).hand.find(({ kind }) => kind === 'wood_stick');
    if (!stick) {
        await click('end-turn');
        stick = (await snapshot()).hand.find(({ kind }) => kind === 'wood_stick');
    }
    assert.ok(stick);
    await click(`card-${stick.id}`);
    await click('enemy-target');
    await phase('rewards');
    await endUnclaimed();
    await click('enter-rest');
    await phase('rest');
    await click('rest-synthesis');
    const uncooked = await state();
    await click('recipe-pick', 'make_spear');
    await click('recipe-craft');
    assert.equal((await state()).cards.some(({ kind }) => kind === 'simple_spear'), true);
    await click('recipe-link', 'reinforce_spear');
    assert.ok((await snapshot()).hits.some(({ id, caption }) => id === 'recipe-card' && caption.includes('拆解零件 ×2')));
    await page.screenshot({ path: path.join(output, 'camp-chain.png') });
    await click('recipe-craft');
    assert.equal((await state()).cards.filter(({ kind }) => kind === 'spare_parts').length, 2);
    await click('recipe-undo');
    assert.equal((await snapshot()).canUndoSynthesis, false);
    assert.equal((await state()).cards.some(({ kind }) => kind === 'simple_spear'), true);
    assert.equal((await state()).supplies, uncooked.supplies);
    await click('recipe-craft');
    await page.keyboard.press('Escape');
    await click('rest-synthesis');
    assert.equal((await snapshot()).canUndoSynthesis, false);
    assert.equal((await state()).cards.some(({ kind }) => kind === 'long_spear'), true);

    await page.keyboard.press('Escape');
    await click('rest-done');
    await click('enter-enemy2');
    await phase('battle');
    for (let turn = 0; turn < 6 && (await snapshot()).phase === 'battle'; turn++) {
        const { hand } = await snapshot();
        for (const { id, kind, blocked } of hand) {
            if ((await snapshot()).phase !== 'battle') break;
            if (blocked || !['long_spear', 'spare_parts', 'attack'].includes(kind)) continue;
            await click('card-' + id);
            await click('enemy-target');
        }
        if ((await snapshot()).phase === 'battle') await click('end-turn');
    }
    await phase('rewards');
    await click('claim-supplies');
    await click('rewards-done');
    await click('modal-confirm');
    await phase('journal');
    const returned = await state();
    assert.equal(returned.day, 2);
    assert.ok(returned.journalEntries.some(({ id, read }) => id === 'street-cleared' && !read));
    assert.deepEqual(returned.storedSupplies, { cloth_supplies: 1 });
    assert.deepEqual(returned.cards, []);
    await click('journal-start');
    await phase('shelter');
    await page.screenshot({ path: path.join(output, 'shelter-exchange.png') });
    await click('shelter-repair');
    assert.equal((await state()).supplies, returned.supplies + 3);
    await click('shelter-done');
    await click('entry-tier-emergency');
    await click('entry-confirm');
    await phase('map');
    const next = await state();
    assert.equal(next.day, returned.day);
    assert.equal(next.supplies, returned.supplies + 3);
    assert.equal(next.armor, 10);
    assert.ok(next.cards.some(({ kind }) => kind === 'knife'));
    assert.equal(next.cards.some(({ kind }) => kind === 'long_spear'), false);

    await page.goto(`${lockedURL}&mapCraft=1`);
    await start();
    await fixed();
    await click('recipe-open');
    assert.equal((await snapshot()).synthesisBlocked, '');
    await click('recipe-pick', 'make_spear');
    await click('recipe-craft');
    assert.ok((await state()).cards.some(({ kind }) => kind === 'simple_spear'));
    await page.screenshot({ path: path.join(output, 'map-unlocked.png') });

    await page.goto(`${origin}play/?seed=17&save=off&scenario=synthesis&preview=encounter`);
    await phase('battle');
    await click('recipe-open');
    assert.equal((await snapshot()).hits.some(({ id }) => id === 'recipe-pick'), false);
    await page.screenshot({ path: path.join(output, 'empty-table.png') });
}

async function run() {
    fs.mkdirSync(output, { recursive: true });
    const scratch = fs.mkdtempSync(path.join(output, 'fixture-'));
    const catalogFile = path.join(scratch, 'cards.json');
    fs.writeFileSync(catalogFile, JSON.stringify(synthesisCatalog()), 'utf8');
    const server = createEditorServer({ catalogFile, backupDirectory: path.join(scratch, 'backups') });
    let browser;
    try {
        const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
        browser = await chromium.launch({
            ...(executablePath ? { executablePath } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }),
            headless: true,
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const origin = `http://127.0.0.1:${server.address().port}/`;
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await editor(page, origin);
        console.log('Editor: recipe form, tree, validation, persistence, narrow layout and map test entry passed.');
        await game(page, origin);
        assert.deepEqual(errors, []);
        console.log('Game: locked and unlocked map, camp synthesis, one undo, return journal, supply exchange and fresh departure passed.');
    } finally {
        await browser?.close();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
        const resolved = fs.realpathSync(scratch);
        if (path.dirname(resolved) === fs.realpathSync(output) && path.basename(resolved).startsWith('fixture-'))
            fs.rmSync(resolved, { recursive: true, force: true });
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
