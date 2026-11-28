const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createEditorServer } = require('./card-editor-server.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.LABYRINTH_QA_OUTPUT || path.join(root, 'output/playwright/ashen-character-and-map');
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
    async function depart(tier) {
        await click('camp-gate');
        if (tier) await click('entry-tier-' + tier);
        await click('entry-confirm');
    }
    return { state, save, idle, click, depart, target };
}

function mapPaths({ points }, id = 'threshold') {
    const { next } = points.find(point => point.id === id);
    return next.length ? next.flatMap(child => mapPaths({ points }, child).map(rest => [id, ...rest])) : [[id]];
}

function assertVerticalMap({ points, edges }) {
    const position = new Map(points.map(point => [point.id, point.y]));
    assert.ok(edges.length > 0 && edges.every(edge => position.get(edge.to) > position.get(edge.from)));
}

async function visitScrollableMap(page, native, name) {
    const before = await native.save();
    const fromBattle = before.phase === 'battle';
    if (fromBattle) await native.click('map');
    assert.equal((await native.state()).overlay, fromBattle ? 'map' : null);
    const overview = await page.evaluate(() => {
        const scene = cc.director.getScene();
        const map = scene.getComponentsInChildren('RouteMap')
            .find(view => view.node.activeInHierarchy);
        if (!map) return null;
        const director = scene.getComponentInChildren('GameDirector');
        const model = map.inspect();
        const markers = map.node.getComponentsInChildren('RoutePoint');
        const focused = model.points.find(point => point.state === 'current') ??
            model.points.find(point => point.state === 'available');
        const marker = markers.find(point => point.data?.id === focused?.id);
        return {
            ...model,
            verticalScrollRange: Math.abs(map.scroll.getMaxScrollOffset().y),
            mask: !!map.scroll.node.getComponent('cc.Mask')?.enabledInHierarchy,
            cancelsDraggedClick: map.scroll.cancelInnerEvents,
            shownFloors: map.floorLabels.filter(label => label.node.activeInHierarchy).length,
            progressText: map.depth?.string,
            legendIcons: map.key?.children.filter(node => node.name.startsWith('Key-')).length,
            readOnlyTarget: marker?.glyph ? director.bounds(marker.glyph.node) : null,
            glyphs: markers.map(point => ({
                id: point.action.actionId.slice(6),
                slot: point.iconFrames.indexOf(point.glyph?.spriteFrame),
                frameCount: point.iconFrames.length,
                width: point.glyph ? director.bounds(point.glyph.node).width : 0,
            })),
        };
    });
    assert.ok(overview && overview.verticalScrollRange > 1500);
    assert.equal(overview.points.length, before.expeditionMap.points.length);
    assert.ok(overview.points.some(point => point.id === 'threshold') &&
        overview.points.some(point => point.id === 'lampCourt'));
    assertVerticalMap(overview);
    assert.equal(new Set(overview.points.map(point => point.layer)).size, 17);
    assert.ok(overview.mask && overview.cancelsDraggedClick);
    assert.equal(overview.shownFloors, 17);
    assert.match(overview.progressText, /\/\s*17/);
    assert.equal(overview.legendIcons, 4);
    const iconSlots = { battle: 0, elite: 1, rest: 2, scavenge: 3, supply: 3, home: 4 };
    const points = new Map(overview.points.map(point => [point.id, point]));
    assert.equal(overview.glyphs.length, points.size);
    for (const { id, slot, frameCount, width } of overview.glyphs) {
        const point = points.get(id);
        assert.equal(frameCount, 5);
        assert.equal(slot, iconSlots[point.icon]);
        if (slot === 3 && point.state !== 'visited' && point.state !== 'current')
            assert.equal(point.title, '未知地点');
        assert.ok(Math.abs(width - 62) < 1);
    }
    await image(page, name);
    const rect = await page.locator('#GameCanvas').boundingBox();
    if (fromBattle) {
        assert.ok(overview.readOnlyTarget);
        const hit = overview.readOnlyTarget, scale = Math.min(rect.width / 1440, rect.height / 900);
        await page.mouse.click(rect.x + (rect.width - 1440 * scale) / 2 + (hit.x + hit.width / 2) * scale,
            rect.y + (rect.height - 900 * scale) / 2 + (hit.y + hit.height / 2) * scale);
        await native.idle();
        assert.equal((await native.state()).overlay, 'map');
    }
    assert.deepEqual(await native.save(), before);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const offset = overview.scrollOffset.y;
    await page.mouse.wheel(0, Math.abs(offset) > overview.verticalScrollRange / 2 ? -520 : 520);
    await page.waitForFunction(initial => {
        const map = cc.director.getScene().getComponentsInChildren('RouteMap')
            .find(view => view.node.activeInHierarchy);
        return Math.abs(map.inspect().scrollOffset.y - initial) > 5;
    }, offset, { timeout: 5000 });
    if (fromBattle) await page.keyboard.press('Escape');
    else {
        // Continue the route at the same place on the playable map.
        await page.evaluate(y => {
            const map = cc.director.getScene().getComponentsInChildren('RouteMap').find(m => m.node.activeInHierarchy);
            map.scroll.stopAutoScroll();
            const offset = map.scroll.getScrollOffset();
            offset.y = y;
            map.scroll.scrollToOffset(offset, 0);
        }, offset);
    }
    await native.idle();
    assert.deepEqual(await native.save(), before);
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
            symbol: (surface ?? action?.node)?.getChildByName('ControlGlyph')?.getComponent('cc.Sprite')?.spriteFrame?.name,
        };
    }, id);
}
async function visitSettings(page, native) {
    const before = await native.save(), snapshot = await native.state();
    for (const name of ['audio', 'restart', 'help', 'log'])
        assert.ok(!snapshot.hits.some(item => item.id === name), name);
    for (const [id, symbol] of [['settings', 'nav-settings'], ['map', 'nav-map'], ['bag', 'nav-deck'], ['supply-bag','nav-satchel']])
        assert.deepEqual(await controlGlyph(page, id), { textShown: false, symbol });
    const hud = await page.evaluate(() => {
        const bar = cc.director.getScene().getComponentInChildren('StatusBar');
        return {
            visibleBacking: bar.lintel.node.activeInHierarchy,
            labels: bar.node.getComponentsInChildren('cc.Label')
                .filter(label => label.enabledInHierarchy && label.string).map(label => label.string),
        };
    });
    assert.equal(hud.visibleBacking, true);
    assert.deepEqual(hud.labels.sort(), [`第 ${before.day} 天`, String(before.supplies),
        `第 ${before.battle.turn} 回合`, String(snapshot.statusBar.input.deckCount)].sort());
    await native.click('supply-bag');
    assert.equal((await native.state()).overlay, 'supply-bag');
    const bag = await page.evaluate(() => {
        const panel = cc.director.getScene().getComponentInChildren('BattlePilePanel');
        return [panel.title.string,panel.hint.string,panel.emptyBag.activeInHierarchy];
    });
    assert.deepEqual(bag, ['物资背包','暂无物资卡',true]);
    await native.click('modal-close');
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
    const [x, y] = await native.target('modal-close');
    const canvas = await page.locator('#GameCanvas').boundingBox();
    const scale = Math.min(canvas.width / 1440, canvas.height / 900);
    // The visible focus border used to extend past the close button's hit area.
    await page.mouse.click(x + 24 * scale, y + 18 * scale);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === null);
    assert.equal((await native.state()).overlay, null);
    assert.deepEqual(await native.save(), before);
    report.settings = { iconRow: true, backedHud: true, supplyBag: true, soundToggle: true, restartCancellation: true, helpReturnsToSettings: true };
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

async function clickCampArt(page, x, y) {
    const point = await page.evaluate(([x,y]) => {
        const d = cc.director.getScene().getComponentInChildren('GameDirector');
        const art = d.bounds(d.scene.screens.camp.getChildByName('CampPainting'));
        const rect = document.querySelector('#GameCanvas').getBoundingClientRect();
        const scale = Math.min(rect.width / 1440, rect.height / 900);
        return [rect.left + (rect.width - 1440 * scale) / 2 + (art.x + art.width * x / 1440) * scale,
            rect.top + (rect.height - 900 * scale) / 2 + (art.y + art.height * y / 900) * scale];
    }, [x,y]);
    await page.mouse.click(...point);
}
async function visitCamp(page, native) {
    const initial = await native.save();
    const snapshot = await native.state();
    const stations = ['camp-gate', 'camp-keeper', 'camp-skills', 'camp-warehouse', 'camp-fire'];
    assert.deepEqual(snapshot.hits.filter(hit => hit.enabled).map(hit => hit.id).sort(), [...stations].sort());
    await page.waitForFunction(() => !!cc.director.getScene().getComponentInChildren('GameDirector').audio.fire?.loop);
    const scene = await page.evaluate(() => {
        const d = cc.director.getScene().getComponentInChildren('GameDirector');
        const camp = d.scene.screens.camp, painting = camp.getChildByName('CampPainting');
        return { hud: d.hud.activeInHierarchy,
            backgroundLoop: !!d.audio.fire?.loop && !!d.audio.fireBuffer,
            plates: camp.getComponentsInChildren('PaperPanel').length,
            labels: painting.getComponentsInChildren('cc.Label').filter(l => l.enabledInHierarchy)
                .map(l => l.string.replace(/　/g, '')).sort() };
    });
    assert.deepEqual(scene, { hud: false, plates: 0, backgroundLoop: true, labels: ['进入迷宫','技能树','仓库','日志','交谈 · 交易'].sort() });
    await image(page, 'camp-arrival');

    // At design size click the artwork itself, away from its nameplate.
    await clickCampArt(page, 903, 548);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-keeper');
    const ambience = await page.waitForFunction(() => cc.director.getScene().getComponentInChildren('GameDirector').audio.fire);
    await image(page, 'camp-keeper');
    await native.click('camp-talk');
    const firstLine = (await campText(page)).body;
    await native.click('camp-talk-next');
    assert.notEqual((await campText(page)).body, firstLine);
    await native.click('camp-trade');
    assert.match((await campText(page)).context, /牌摊/);
    await image(page, 'camp-trade');
    await native.click('modal-close');
    await clickCampArt(page, 1213, 605);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-warehouse');
    assert.match((await campText(page)).title, new RegExp(String(initial.supplies)));
    await image(page, 'camp-warehouse');
    await native.click('camp-find-keeper');
    assert.match((await campText(page)).context, /牌摊/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !globalThis.__emberUI.snapshot().overlay);
    await clickCampArt(page, 235, 556);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-skills');
    await native.click('camp-select-initiative');
    assert.ok(!(await native.state()).hits.some(h => h.id === 'camp-learn' && h.enabled));
    await image(page, 'camp-skills');
    await native.click('camp-equipment');
    assert.match((await campText(page)).body, /血量已满/);
    await native.click('camp-deck');
    assert.equal((await native.state()).overlay, 'bag');
    await native.click('modal-close');
    await clickCampArt(page, 646, 637);
    await page.waitForFunction(() => globalThis.__emberUI.snapshot().overlay === 'camp-fire');
    assert.equal((await campText(page)).title, '灰里的门槛');
    const continuous = await page.evaluate(source => source.loop &&
        source === cc.director.getScene().getComponentInChildren('GameDirector').audio.fire, ambience);
    await ambience.dispose();
    assert.ok(continuous, 'Camp panels should share one continuous fireplace recording');
    await native.click('camp-audio');
    assert.deepEqual(await controlGlyph(page, 'camp-audio'), { textShown: false, symbol: 'ic-muted' });
    assert.equal(await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameDirector').audio.fire), null);
    await native.click('camp-audio');
    await page.waitForFunction(() => !!cc.director.getScene().getComponentInChildren('GameDirector').audio.fire);
    await native.click('modal-close');
    await page.keyboard.press('Tab');
    const nextFocus = await page.evaluate(() => cc.director.getScene().getChildByName('Canvas')
        .getChildByName('GameRoot').getComponent('ButtonFocusGroup').inspect().focused);
    assert.ok(stations.includes(nextFocus));
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
    await native.click('modal-close');
    await native.click('camp-gate');
    assert.equal((await native.state()).overlay, 'entry');
    await native.click('entry-tier-low');
    await native.click('modal-close');
    assert.deepEqual(await native.save(), initial);
    await page.setViewportSize({ width: 1021, height: 452 });
    await page.waitForTimeout(180);
    const framing = await page.evaluate(() => {
        const d = cc.director.getScene().getComponentInChildren('GameDirector');
        const camp = d.scene.screens.camp, painting = camp.getChildByName('CampPainting');
        const rect = document.querySelector('#GameCanvas').getBoundingClientRect();
        const scale = Math.min(rect.width / 1440, rect.height / 900);
        const visible = painting.getComponentsInChildren('cc.Label').filter(label => {
            const bounds = d.bounds(label.node);
            const x = rect.left + (rect.width - 1440 * scale) / 2 + bounds.x * scale;
            const y = rect.top + (rect.height - 900 * scale) / 2 + bounds.y * scale;
            return x >= 8 && y >= 8 && x + bounds.width * scale <= innerWidth - 8 &&
                y + bounds.height * scale <= innerHeight - 8;
        }).length;
        const art = d.bounds(painting);
        const hit = d.bounds(camp.getChildByName('CampControls').getChildByName('camp-gate'));
        const seam = art.x + art.width * 777 / 1440;
        const ink = d.bounds(painting.getChildByName('Inscriptions').getChildByName('camp-gate-sign'));
        const centered = [ink, hit].every(b => Math.abs(b.x + b.width / 2 - 720) < 1 &&
            Math.abs(b.y + b.height / 2 - 450) < 1);
        return { visible, centered: centered && Math.abs(seam - 720) < 1 };
    });
    assert.deepEqual(framing, { visible: stations.length, centered: true });
    await page.setViewportSize({ width: 1440, height: 900 });
}
async function campPurchases(browser, url) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const native = input(page);
    observe(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=17&save=on');
        await native.click('camp-keeper');
        await native.click('camp-trade');
        assert.equal((await campText(page)).title, '阻尼片');
        await native.click('camp-exchange');
        let save = await native.save();
        const card = save.cards.find(c => c.kind === 'lab_damper' && c.found);
        assert.ok(card && save.supplies === 8);
        assert.equal((await campText(page)).title, '交易完成');
        await image(page, 'trade-receipt');
        await native.click('camp-trade-browse');
        assert.ok(!(await native.state()).hits.some(h => h.id === 'camp-exchange' && h.enabled));
        await native.click('modal-close');
        await native.click('camp-skills');
        await native.click('camp-select-guard');
        assert.ok(!(await native.state()).hits.some(h => h.id === 'camp-learn' && h.enabled));
        await native.click('camp-select-footing');
        await native.click('camp-learn');
        assert.equal((await native.save()).supplies, 6);
        await native.click('camp-select-guard');
        await native.click('camp-learn');
        assert.equal((await native.state()).overlay, 'camp-skills');
        save = await native.save();
        assert.deepEqual(save.campSkills, ['footing', 'guard']);
        assert.equal(save.supplies, 0);
        await image(page, 'skill-learned');
        await page.reload();
        await native.idle();
        assert.deepEqual(await native.save(), save);
        await native.depart('emergency');
        await native.click('enter-threshold');
        await native.click('enter-lampPassage');
        const fight = (await native.save()).battle;
        assert.ok([...fight.hand, ...fight.draw].some(c => c.origin === card.id));
        assert.equal(fight.block, 3);
        return { bought: card.kind, balanceAfterShop: 8, balanceAfterTraining: save.supplies,
            learned: save.campSkills, reloadPreserved: true, openingBlock: fight.block, cardInCombat: true };
    } finally {
        await page.close();
    }
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
            await visitCamp(page, native);
        }
        await native.depart(lane === 'B' ? 'emergency' : 'standard');
        let snap = await native.state();
        const departure = await native.save(), graph = departure.expeditionMap;
        const paths = mapPaths(graph);
        const plan = paths.find(route => lane === 'A'
            ? route[1] === 'lampPassage' && route.includes('ashGallery') && route.includes('returnBridge')
            : route[1] === 'serviceDuct' && !route.includes('ashGallery') && !route.includes('returnBridge'));
        assert.equal(plan?.length, 17);
        assert.ok(paths.length > 6 && graph.points.length >= 26);
        assertVerticalMap(snap.routeMap);
        assert.ok(!snap.hits.some(hit => hit.id === 'map-enter'));
        assert.deepEqual(snap.routeMap.points.filter(p => p.state === 'available').map(p => p.id), ['threshold']);
        if (lane === 'A') {
            await image(page, '01-map-entrance');
            const rect = await page.locator('#GameCanvas').boundingBox();
            const offset = snap.routeMap.scrollOffset.y;
            await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
            await page.mouse.wheel(0, -1400);
            await page.waitForFunction(initial => globalThis.__emberUI.snapshot().routeMap.scrollOffset.y !== initial, offset);
            await image(page, '02-map-scrolled');
            assert.deepEqual(await native.save(), departure);
            await page.reload();
            await native.idle();
            assert.deepEqual(await native.save(), departure);
            await visitScrollableMap(page, native, '02-scroll-map-1440');
        }
        const enemies = [], options = [], collected = [];
        let inspectedSupplies = false;
        const supplies = new Map(JSON.parse(fs.readFileSync(source, 'utf8')).cards
            .filter(card => card.role === 'supply').map(card => [card.id, card]));
        let crushed = false, choiceReload = false, battleReload = false, forkReload = false;
        let nextHand = false, chosen = null, laterFork = null, nextDeparture = null;
        const normalEnemyTurns = [];
        for (let i = 0; i < 300; i++) {
            snap = await native.state();
            const save = await native.save();
            if (snap.phase === 'journal' && save.day === 2) break;
            if (snap.phase === 'failure') throw new Error(`Route ${lane} failed at ${snap.currentNode}`);
            if (snap.phase === 'map' && snap.currentNode === 'return') {
                await page.waitForFunction(() => globalThis.__emberUI.snapshot().phase === 'journal');
                continue;
            }
            if (snap.phase === 'map') {
                const next = plan[save.visited.length];
                if (save.visited.length > 1 && snap.currentNode === 'choice') {
                    const choices = snap.routeMap.points.filter(point => point.state === 'available').map(point => point.id);
                    assert.ok(choices.length >= 2 && choices.includes(next));
                    laterFork = { from: save.visited.at(-1), choices, selected: next };
                    if (lane === 'A' && !forkReload) {
                        await image(page, '03-map-fork');
                        await page.setViewportSize({ width: 1024, height: 768 });
                        await page.reload();
                        await native.idle();
                        assert.deepEqual(await native.save(), save);
                        assertVerticalMap((await native.state()).routeMap);
                        await image(page, '04-map-fork-restored-1024');
                        await visitScrollableMap(page, native, '04-scroll-map-1024');
                        await native.click('enter-' + next);
                        const moved = await native.save();
                        assert.equal(moved.expeditionMap.activeNode ?? moved.visited.at(-1), next);
                        forkReload = true;
                        await page.setViewportSize({ width: 1440, height: 900 });
                        continue;
                    }
                }
                await native.click('enter-' + next);
                const moved = await native.save();
                assert.equal(moved.expeditionMap.activeNode ?? moved.visited.at(-1), next);
                continue;
            }
            if (snap.phase === 'rest') {
                if (lane === 'A') await image(page, '07-rest');
                await native.click('rest-done');
                continue;
            }
            if (snap.phase === 'rewards') {
                assert.equal(save.rewards.discovery, true);
                const loot = supplies.get(save.rewards.cards[0]);
                if (loot) {
                    assert.deepEqual(save.rewards.cards, [loot.id]);
                    if (lane === 'A') { await native.click('rewards-done'); continue; }
                    if (!collected.length) {
                        await page.reload();
                        await native.idle();
                        assert.deepEqual(await native.save(), save);
                    }
                    await native.click('reward-select-0');
                    if (!(await native.state()).hits.some(hit => hit.id === 'discover-confirm' && hit.enabled)) {
                        await native.click('rewards-done');
                        continue;
                    }
                    if (!collected.length) await image(page, 'supply-pickup');
                    await native.click('discover-confirm');
                    const packed = await native.save();
                    assert.equal(packed.supplies, save.supplies);
                    assert.equal(packed.cards.at(-1).kind, loot.id);
                    if (packed.cards.at(-1).zone === 'base') collected.push(loot.id);
                    continue;
                }
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
            if (collected.length && !inspectedSupplies) {
                await native.click('bag');
                await native.click('bag-filter-supplies');
                assert.equal((await native.state()).inventoryFilter, 'supplies');
                await image(page, 'supply-bag');
                await native.click('modal-close');
                inspectedSupplies = true;
            }
            const b = save.battle;
            assert.ok(snap.heroRig.runtimeReady && snap.enemyRig.runtimeReady);
            assert.equal(snap.heroRig.actor, 'ashen-lantern-keeper');
            assert.equal(snap.enemyRig.actor, 'ashen-' + b.enemy);
            assert.equal(b.discovery, undefined);
            if (lane === 'A' && !battleReload) {
                await page.reload();
                await native.idle();
                assert.deepEqual(await native.save(), save);
                if ((await native.state()).hits.some(hit => hit.id === 'map' && hit.enabled)) {
                    await visitSettings(page, native);
                    await visitScrollableMap(page, native, '05-map-during-combat');
                }
                battleReload = true;
            }
            if (enemies.at(-1)?.node !== snap.currentNode) {
                enemies.push({ node: snap.currentNode, actor: b.enemy, health: save.health, hp: b.maxHp });
                if (chosen && [...b.draw, ...b.hand].some((c) => c.kind === chosen)) nextHand = true;
                if (lane === 'A' && !enemies.slice(0, -1).some((e) => e.actor === b.enemy)) {
                    await page.waitForTimeout(180);
                    const hud = await page.evaluate(() => {
                        const d = cc.director.getScene().getComponentInChildren('GameDirector');
                        const battle = d.scene.screens.battle;
                        const intent = battle.getComponentInChildren('EnemyIntent');
                        const side = battle.getChildByName('EnemyVitals');
                        return {
                            health: d.hud.getComponent('StatusBar').health.node.activeInHierarchy,
                            hp: side.getChildByName('battle-text5').getComponent('cc.Label').string,
                            toRight: side.worldPosition.x > d.enemy.node.worldPosition.x,
                            attack: intent.attackGlyph.activeInHierarchy,
                            amount: intent.amount.node.getComponent('cc.Label').string,
                            detail: intent.hint.activeInHierarchy,
                        };
                    });
                    assert.deepEqual(hud, {
                        health: false, hp: `${b.hp}/${b.maxHp}`, toRight: true,
                        attack: true, amount: String(b.attack), detail: false,
                    });
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
                    if (crushed) await page.emulateMedia({ reducedMotion: 'reduce' });
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
            assert.deepEqual((await native.state()).heroRig.paper, { visible: true, fragments: 0 });
            if (lane === 'A' && !crushed) {
                const [crush] = await Promise.all([
                    page.waitForFunction(() => {
                        const state = globalThis.__emberUI.snapshot();
                        const paper = state.heroRig.paper;
                        return paper && !paper.visible && paper.fragments > 0 &&
                            { motion: state.heroMotion, rig: state.heroRig.motion };
                    }),
                    native.click('enemy-target', false),
                ]);
                assert.deepEqual(await crush.jsonValue(), { motion: 'attack', rig: 'attack' });
                await crush.dispose();
                await image(page, '04-left-hand-paper-crush');
                await native.idle();
                const after = await native.save();
                assert.ok(!after.battle || (after.battle.hp < before.battle.hp && !after.battle.hand.some((c) => c.id === move.id)));
                crushed = true;
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
        assert.deepEqual(beforeReturn.visited, plan);
        assert.equal(beforeReturn.settlement.discoveredCards, lane === 'A' ? 1 : 0);
        if (lane === 'A') {
            assert.ok(crushed && choiceReload && nextHand && battleReload && forkReload);
            assert.deepEqual(normalEnemyTurns, ['ash-moth', 'stone-claw', 'veil-idol']);
        }
        await native.click('journal-start');
        if (lane === 'A') await image(page, '08-shelter');
        const returned = await native.save();
        await page.reload();
        await native.idle();
        assert.deepEqual(await native.save(), returned);
        if (lane === 'B' && [...supplies.values()].some(card => card.reward)) {
            const stock = {};
            for (const kind of collected) stock[kind] = (stock[kind] ?? 0) + 1;
            assert.ok(collected.length, 'The service duct should yield a supply card.');
            assert.deepEqual(returned.storedSupplies, stock);
            assert.equal(returned.settlement.returnedCards, collected.length);
            await native.click('camp-warehouse');
            await native.click('camp-stock');
            await native.click('modal-close');
            assert.deepEqual(await native.save(), returned);
            await native.click('camp-warehouse');
            await native.click('camp-stock');
            const kinds = Object.keys(stock);
            if (kinds.length > 1) await native.click('camp-stock-next');
            const kind = kinds[1] ?? kinds[0], item = supplies.get(kind);
            assert.match((await campText(page)).title, new RegExp(item.name));
            await image(page, 'supply-warehouse');
            await page.setViewportSize({ width: 1024, height: 768 });
            await page.waitForTimeout(180);
            await image(page, 'supply-warehouse-small');
            await native.click('camp-redeem');
            if (--stock[kind] === 0) delete stock[kind];
            const paid = await native.save();
            assert.equal(paid.supplies, returned.supplies + item.supplyValue);
            assert.deepEqual(paid.storedSupplies, stock);
            await page.reload();
            await native.idle();
            assert.deepEqual(await native.save(), paid);
            report.supplyCards = { collected, exchanged: kind, balance: paid.supplies, remaining: stock };
            const saleKind = Object.keys(stock)[0];
            if (saleKind) {
                const sale = supplies.get(saleKind);
                await native.click('camp-keeper');
                await native.click('camp-trade');
                for (let i = 0; i < kinds.length + 2 && (await campText(page)).title !== sale.name; i++)
                    await native.click('camp-trade-next');
                assert.equal((await campText(page)).title, sale.name);
                await native.click('camp-exchange');
                const sold = await native.save();
                assert.equal(sold.supplies, paid.supplies + sale.supplyValue);
                assert.equal(sold.storedSupplies[saleKind] ?? 0, stock[saleKind] - 1);
                assert.equal((await campText(page)).title, '交易完成');
                await image(page, 'keeper-sale');
                await page.reload();
                await native.idle();
                assert.deepEqual(await native.save(), sold);
                report.keeperSale = { kind: saleKind, price: sale.supplyValue, balance: sold.supplies, reloadPreserved: true };
            }
        }
        if (lane === 'A') {
            await native.click('camp-fire');
            assert.equal((await campText(page)).title, '沉灯熄灭之后');
            await native.click('camp-prev');
            assert.equal((await campText(page)).title, '灰里的门槛');
            await native.click('camp-next');
            assert.match((await campText(page)).context, /第 2 天/);
            await native.click('modal-close');
            await native.click('camp-skills');
            await native.click('camp-equipment');
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
            await native.click('camp-gate');
            assert.equal((await native.state()).overlay, 'entry');
            await native.click('modal-close');
            report.camp = { paintedHotspots: 5, keyboardActivation: true, canceledDeparturePreservedSave: true,
                journalsReopened: 2, nextDeparture: true, warehouseStock: returned.supplies - cost,
                repairChargedOnce: cost, persistedHealth: 10, viewports: ['1440x900', '1024x768'] };
            await native.depart('standard');
            const fresh = await native.save();
            assert.equal(fresh.day, 2);
            assert.notEqual(fresh.expeditionMap.seed, graph.seed);
            assert.notDeepEqual(fresh.expeditionMap.points, graph.points);
            assert.deepEqual(fresh.visited, []);
            nextDeparture = { day: fresh.day, seed: fresh.expeditionMap.seed };
        }
        return { lane, enemies, options, initialHealth: 10, finalHealth: returned.health,
            visited: returned.visited.length, crushed, nextHand, choiceReload, restoredReturn: true, normalEnemyTurns,
            map: { seed: graph.seed, availablePaths: paths.length, laterFork, forkReload, battleReload, nextDeparture } };
    } catch (error) {
        await image(page, 'failure-' + lane).catch(() => {});
        throw error;
    } finally {
        await page.close();
    }
}

async function fullSupplyBag(browser, url) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=17&save=on');
        await native.idle();
        await native.depart();
        await native.click('enter-threshold');
        await native.click('enter-serviceDuct');
        const checkpoint = await native.save(), kind = checkpoint.rewards?.cards[0];
        if (!kind) return { dropsEnabled: false };
        const { catalog } = await (await page.request.get(url + '/api/cards')).json();
        const item = catalog.cards.find(card => card.id === kind);
        const base = Math.floor(30 / item.weight), overflow = Math.floor(10 / item.weight);
        const packed = [];
        for (let i = 0; i < base + overflow; i++) {
            const card = { id: 'card-' + ++checkpoint.nextId, kind, selected: false, found: true,
                packedWeight: item.weight, zone: i < base ? 'base' : 'overflow' };
            checkpoint.cards.push(card);
            packed.push(card);
        }
        const from = require('./load-ts.cjs').createLoader();
        from(path.join(root, 'assets/game/core/content/CardCatalog.ts')).installCatalog(catalog);
        const { SaveRepository } = from(path.join(root, 'assets/game/infrastructure/SaveRepository.ts'));
        const disk = new Map();
        const repository = new SaveRepository({ getItem: id => disk.get(id) ?? null, setItem: (id, value) => disk.set(id, value) });
        repository.save(checkpoint);
        assert.ok(disk.get(repository.key));
        await page.evaluate(([id, value]) => localStorage.setItem(id, value), [repository.key, disk.get(repository.key)]);
        await page.reload();
        await native.idle();
        assert.deepEqual(await native.save(), checkpoint);
        await native.click('reward-select-0');
        assert.ok(!(await native.state()).hits.some(hit => hit.id === 'discover-confirm' && hit.enabled));
        await image(page, 'supply-full-bag');
        await native.click('reward-bag');
        assert.equal((await native.state()).inventoryFilter, 'supplies');
        await native.click('inspect-' + packed[0].id);
        await native.click('discard-' + packed[0].id);
        await native.click('modal-confirm');
        const freed = await native.save();
        assert.ok(!freed.cards.some(card => card.id === packed[0].id));
        if (overflow) assert.equal(freed.cards.find(card => card.id === packed[base].id).zone, 'base');
        await native.click('modal-close');
        await native.click('reward-select-0');
        await native.click('discover-confirm');
        const picked = (await native.save()).cards.at(-1);
        assert.equal(picked.kind, kind);
        assert.equal(picked.zone, overflow ? 'overflow' : 'base');
        return { kind, weight: item.weight, base, overflow, discarded: 1, pickedZone: picked.zone };
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
        const rewardLink = page.getByRole('link', { name: '奖励池', exact: true });
        const grid = page.locator('#reward-grid');
        const toggles = grid.getByRole('checkbox');
        const savePool = async () => {
            await page.getByRole('button', { name: /保存到项目/ }).click();
            await page.waitForFunction(() => document.querySelector('#save-state').textContent.startsWith('已保存'));
        };
        await page.locator('#preview-asset-note').waitFor();
        const live = await (await page.request.get(url + '/api/cards')).json();
        assert.equal(await page.locator('#preview-art .painted-tile').count(), 0);
        await rewardLink.click();
        assert.ok(await toggles.count() > 5);
        const fallbackArt = await grid.locator('.painted-tile').evaluateAll(tiles =>
            tiles.map(tile => tile.style.backgroundImage));
        assert.ok(fallbackArt.every(image => image.includes('/art/materials.png')),
            '章节图集不可用时，只有独立物资图集提供的插画可以显示');
        await page.getByRole('link', { name: '卡牌编辑', exact: true }).click();
        await page.unroute(oldAtlasUrl);
        await page.getByRole('button', { name: '重新载入', exact: true }).click();
        await page.locator('#preview-art .painted-tile').waitFor();
        assert.equal(await page.locator('#preview-asset-note').isVisible(), false);

        await page.getByRole('link', { name: '物资卡', exact: true }).click();
        assert.match(page.url(), /\/supplies$/);
        const goods = live.catalog.cards.filter(card => card.role === 'supply');
        assert.equal(await page.locator('#card-list [data-select]').count(), goods.length);
        const example = goods.find(card => card.art === 'rope' || card.art === 'battery') ?? goods[0];
        if (example) {
            await page.locator(`#card-list [data-select="${live.catalog.cards.indexOf(example)}"]`).click();
            assert.equal(await page.getByRole('spinbutton', { name: '物资卡重量' }).inputValue(), String(example.weight));
            assert.equal(await page.getByRole('spinbutton', { name: '兑换物资点' }).inputValue(), String(example.supplyValue));
            assert.equal(await page.locator('#preview-keywords').isVisible(), false);
            assert.equal(await page.locator('#preview-name').textContent(), example.name);
            assert.equal(await page.locator('#preview-supply-value').textContent(), `价值 ${example.supplyValue} 物资点`);
            assert.equal(await page.locator('#preview-weight-mark').getAttribute('aria-label'), `负重 ${example.weight}`);
            assert.equal(await page.locator('#preview-detail-toggle').isVisible(), false);
            if (example.art === 'rope' || example.art === 'battery')
                assert.match(await page.locator('#preview-art .painted-tile').getAttribute('style'), /materials\.png/);
        }
        await image(page, 'supply-editor');
        await page.getByRole('button', { name: '新增物资卡' }).click();
        await page.getByRole('textbox', { name: '卡牌名称' }).fill('备用线圈');
        const probeId = await page.getByRole('textbox', { name: '卡牌 ID' }).inputValue();
        await page.getByRole('spinbutton', { name: '兑换物资点' }).fill('8');
        await page.getByRole('spinbutton', { name: '物资卡重量' }).fill('0');
        assert.equal(await page.locator('#save').isDisabled(), true);
        await page.getByRole('spinbutton', { name: '物资卡重量' }).fill('3');
        await page.getByRole('spinbutton', { name: '奖励权重' }).fill('0.5');
        await page.getByRole('checkbox', { name: '加入随机奖励池' }).uncheck();
        await page.getByRole('link', { name: '配方编辑' }).click();
        await page.goBack();
        assert.equal(await page.getByRole('textbox', { name: '卡牌名称' }).inputValue(), '备用线圈');
        const written = page.waitForResponse(response => response.url().endsWith('/api/cards') && response.request().method() === 'PUT');
        await page.locator('#save').click();
        assert.equal((await written).status(), 200);
        await page.locator('#save-state').filter({ hasText: '已保存' }).waitFor();
        await page.reload();
        await page.getByRole('searchbox', { name: '搜索卡牌' }).fill(probeId);
        await page.getByRole('button', { name: '选择卡牌：备用线圈' }).click();
        assert.equal(await page.getByRole('spinbutton', { name: '物资卡重量' }).inputValue(), '3');
        assert.equal(await page.getByRole('spinbutton', { name: '兑换物资点' }).inputValue(), '8');
        assert.equal(await page.getByRole('spinbutton', { name: '奖励权重' }).inputValue(), '0.5');
        assert.equal(await page.getByRole('checkbox', { name: '加入随机奖励池' }).isChecked(), false);
        const search = page.getByRole('searchbox', { name: '搜索卡牌' });
        const drop = page.getByRole('checkbox', { name: '加入随机奖励池' });
        await search.fill('');
        for (const item of goods.filter(card => card.reward)) {
            await page.locator(`#card-list [data-select="${live.catalog.cards.indexOf(item)}"]`).click();
            await drop.uncheck();
        }
        await search.fill(probeId);
        await page.getByRole('button', { name: '选择卡牌：备用线圈' }).click();
        await drop.check();
        const updated = page.waitForResponse(r => r.url().endsWith('/api/cards') && r.request().method() === 'PUT');
        await page.locator('#save').click();
        assert.equal((await updated).status(), 200);
        await page.getByRole('button', { name: /试玩游戏/ }).click();
        await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow?.__emberUI?.snapshot().ready);
        const supplyTrial = input(page, page.frames().find(frame => frame.url().includes('/play/')));
        await supplyTrial.depart();
        await supplyTrial.click('enter-threshold');
        await supplyTrial.click('enter-serviceDuct');
        assert.deepEqual((await supplyTrial.save()).rewards.cards, [probeId]);
        await supplyTrial.click('reward-select-0');
        await supplyTrial.click('discover-confirm');
        const picked = (await supplyTrial.save()).cards.at(-1);
        assert.equal(picked.kind, probeId);
        assert.equal(picked.packedWeight, 3);
        await page.locator('#close-game').click();
        report.supplyEditor = { category: '/supplies', persisted: probeId, weight: 3, value: 8, dropWeight: 0.5,
            savedDisabled: true, enabledTrialPickup: picked.kind };
        await page.getByRole('link', { name: '卡牌编辑', exact: true }).click();

        await rewardLink.click();
        await image(page, '09-reward-pool');
        const selected = ['lab_bracelet', 'lab_calibration', 'lab_valve'];
        for (const toggle of await toggles.all()) {
            const id = await toggle.getAttribute('data-reward-card');
            if (await toggle.isChecked() !== selected.includes(id)) await toggle.click();
        }
        assert.match(await page.locator('#reward-pool-count').textContent(), /已加入 3 \/ /);
        await savePool();
        await page.reload();
        await toggles.first().waitFor();
        assert.deepEqual(await grid.locator('input:checked').evaluateAll(inputs =>
            inputs.map(input => input.dataset.rewardCard).sort()), selected);
        await page.getByRole('button', { name: /试玩游戏/ }).click();
        await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow?.__emberUI?.snapshot().ready);
        const frame = page.frames().find((f) => f.url().includes('/play/'));
        const native = input(page, frame);
        const visitDiscoverySite = async (view) => {
            await view.depart();
            await view.click('enter-threshold');
            await view.click('enter-serviceDuct');
            if ((await view.state()).phase === 'rewards') await view.click('rewards-done');
            const { expeditionMap } = await view.save();
            const [site] = expeditionMap.points.find(point => point.id === 'serviceDuct').next;
            await view.click('enter-' + site);
        };
        await visitDiscoverySite(native);
        const offered = (await native.save()).rewards.cards;
        assert.deepEqual(offered.slice().sort(), selected);
        await image(page, '10-filtered-test-run');
        await page.locator('#close-game').click();
        while (await grid.locator('input:checked').count()) await grid.locator('input:checked').first().click();
        await page.getByRole('combobox', { name: '加入状态' }).selectOption('included');
        assert.match(await page.locator('#reward-empty').textContent(), /奖励池为空/);
        await savePool();
        await page.getByRole('button', { name: /试玩游戏/ }).click();
        await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow?.__emberUI?.snapshot().ready);
        const empty = input(page, page.frames().find((f) => f.url().includes('/play/')));
        await visitDiscoverySite(empty);
        assert.equal((await empty.state()).phase, 'map');
        assert.equal((await empty.save()).rewards, null);
        return { mismatchedAtlasKeptControls: true, correctAtlasRecoveredOnReload: true,
            selectionPersistedAfterReload: true, selectedCards: offered, deselectAllSkippedOffer: true };
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

async function defeat(browser, url, reviewCamp = false) {
    const page = await browser.newPage({ viewport: reviewCamp ? { width: 1440, height: 900 } : { width: 1024, height: 768 },
        reducedMotion: reviewCamp ? 'no-preference' : 'reduce' });
    observe(page);
    const native = input(page);
    try {
        await page.goto(url + '/play/?cards=live&seed=19&save=off');
        await native.idle();
        if (reviewCamp) await visitCamp(page, native);
        await native.depart('standard');
        assert.equal(await page.evaluate(() => cc.director.getScene().getComponentInChildren('GameDirector').audio.fire), null);
        assert.ok(!(await native.state()).hits.some(hit => hit.id === 'settings'));
        const firstMap = (await native.save()).expeditionMap;
        await native.click('enter-threshold');
        const firstBattle = (await native.state()).routeMap.points.find(p => p.state === 'available' && p.icon === 'battle');
        await native.click('enter-' + firstBattle.id);
        if (reviewCamp) {
            await visitSettings(page, native);
            await image(page, 'battle-navigation');
        }
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
        const fallen = (await native.state()).heroRig;
        assert.equal(fallen.actor, 'ashen-lantern-keeper');
        assert.equal(fallen.motion, 'death');
        assert.equal(fallen.paused, true);
        const effectsCleared = await page.evaluate(() => {
            const effects = cc.director.getScene().getChildByName('Canvas').getChildByName('GameRoot').getChildByName('Effects');
            return effects.children.every((child) => !child.activeInHierarchy);
        });
        assert.equal(effectsCleared, true);
        await image(page, 'controls-zero-health');
        await native.click('journal-start');
        assert.equal((await native.save()).health, 10);
        assert.ok(!(await native.state()).hits.some(hit => hit.id === 'settings'));
        await page.waitForFunction(() => !!cc.director.getScene().getComponentInChildren('GameDirector').audio.fire);
        await native.depart('standard');
        const retry = await native.save();
        assert.notEqual(retry.expeditionMap.seed, firstMap.seed);
        assert.deepEqual(retry.visited, []);
        return { immediate: true, finalHealth: 0, nextDay: dead.day, recoveredHealth: 10, effectsCleared, newMap: true };
    } finally {
        await page.close();
    }
}

async function main() {
    const temporary = fs.mkdtempSync(path.join(root, 'temp/labyrinth-browser-'));
    const working = path.join(temporary, 'cards.json');
    const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
    catalog.labyrinth = {
        starter: catalog.labyrinth.starter,
        discoveryPool: ['lab_probe', 'lab_bypass', 'lab_bracelet', 'lab_calibration', 'lab_valve', 'lab_vent', 'lab_damper'],
    };
    fs.writeFileSync(working, JSON.stringify(catalog, null, 2) + '\n');
    const server = createEditorServer({ catalogFile: working, backupDirectory: path.join(temporary, 'backups'), buildDirectory: process.env.CARD_EDITOR_BUILD_DIR });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? undefined,
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
        const campOnly = process.argv.includes('--camp');
        report.campPurchases = await campPurchases(browser, url);
        if (!campOnly) {
            report.routes = [];
            for (const lane of ['A', 'B']) report.routes.push(await oneRoute(browser, url, lane));
            report.legacy = await legacy(browser, url);
            report.supplyBagCapacity = await fullSupplyBag(browser, url);
            report.editor = await editor(browser, url);
        }
        report.defeat = await defeat(browser, url, campOnly);
        assert.deepEqual(report.runtimeErrors, []);
        assert.deepEqual(report.consoleErrors, []);
        report.passed = true;
    } finally {
        try {
            await browser?.close();
        } finally {
            await new Promise((done) => server.close(done));
        }
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
