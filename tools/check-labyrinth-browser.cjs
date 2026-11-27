const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createEditorServer } = require('./card-editor-server.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright/ashen-character-and-map');
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
        await click('camp-keeper');
        await click('camp-depart');
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
    await native.click('map');
    assert.equal((await native.state()).overlay, 'map');
    const overview = await page.evaluate(() => {
        const scene = cc.director.getScene();
        const map = scene.getComponentsInChildren('RouteMap')
            .find(view => view.node.activeInHierarchy && view.close?.node.activeInHierarchy);
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
    assert.ok(overview.readOnlyTarget);
    const hit = overview.readOnlyTarget, scale = Math.min(rect.width / 1440, rect.height / 900);
    await page.mouse.click(rect.x + (rect.width - 1440 * scale) / 2 + (hit.x + hit.width / 2) * scale,
        rect.y + (rect.height - 900 * scale) / 2 + (hit.y + hit.height / 2) * scale);
    await native.idle();
    assert.equal((await native.state()).overlay, 'map');
    assert.deepEqual(await native.save(), before);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const offset = overview.scrollOffset.y;
    await page.mouse.wheel(0, Math.abs(offset) > overview.verticalScrollRange / 2 ? -520 : 520);
    await page.waitForFunction(initial => {
        const map = cc.director.getScene().getComponentsInChildren('RouteMap')
            .find(view => view.node.activeInHierarchy && view.close?.node.activeInHierarchy);
        return Math.abs(map.inspect().scrollOffset.y - initial) > 5;
    }, offset, { timeout: 5000 });
    await page.keyboard.press('Escape');
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
        const enemies = [], options = [];
        let flew = false, choiceReload = false, battleReload = false, forkReload = false;
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
            assert.equal(snap.heroRig.actor, 'ashen-lantern-keeper');
            assert.equal(snap.enemyRig.actor, 'ashen-' + b.enemy);
            assert.equal(b.discovery, undefined);
            if (lane === 'A' && !battleReload) {
                await page.reload();
                await native.idle();
                assert.deepEqual(await native.save(), save);
                if ((await native.state()).hits.some(hit => hit.id === 'map' && hit.enabled)) {
                    await visitScrollableMap(page, native, '05-map-during-combat');
                }
                battleReload = true;
            }
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
                const [flight] = await Promise.all([
                    page.waitForFunction(() => {
                        const state = globalThis.__emberUI.snapshot();
                        return state.flyingCard && { motion: state.heroMotion, rig: state.heroRig.motion };
                    }),
                    native.click('enemy-target', false),
                ]);
                assert.deepEqual(await flight.jsonValue(), { motion: 'attack', rig: 'attack' });
                await flight.dispose();
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
        assert.deepEqual(beforeReturn.visited, plan);
        assert.equal(beforeReturn.settlement.discoveredCards, lane === 'A' ? 1 : 0);
        if (lane === 'A') {
            assert.ok(flew && choiceReload && nextHand && battleReload && forkReload);
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
            await native.depart('standard');
            const fresh = await native.save();
            assert.equal(fresh.day, 2);
            assert.notEqual(fresh.expeditionMap.seed, graph.seed);
            assert.notDeepEqual(fresh.expeditionMap.points, graph.points);
            assert.deepEqual(fresh.visited, []);
            nextDeparture = { day: fresh.day, seed: fresh.expeditionMap.seed };
        }
        return { lane, enemies, options, initialHealth: 10, finalHealth: returned.health,
            visited: returned.visited.length, flew, nextHand, choiceReload, restoredReturn: true, normalEnemyTurns,
            map: { seed: graph.seed, availablePaths: paths.length, laterFork, forkReload, battleReload, nextDeparture } };
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
        const visitDiscoverySite = async (view) => {
            await view.depart();
            await view.click('enter-threshold');
            await view.click('enter-serviceDuct');
            const { expeditionMap } = await view.save();
            const [site] = expeditionMap.points.find(point => point.id === 'serviceDuct').next;
            await view.click('enter-' + site);
        };
        await visitDiscoverySite(native);
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
        await visitDiscoverySite(empty);
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
        await native.depart('standard');
        const firstMap = (await native.save()).expeditionMap;
        await native.click('enter-threshold');
        const firstBattle = (await native.state()).routeMap.points.find(p => p.state === 'available' && p.icon === 'battle');
        await native.click('enter-' + firstBattle.id);
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
    fs.copyFileSync(source, working);
    const server = createEditorServer({ catalogFile: working, backupDirectory: path.join(temporary, 'backups') });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? undefined,
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
        report.routes = [];
        for (const lane of ['A', 'B']) report.routes.push(await oneRoute(browser, url, lane));
        report.legacy = await legacy(browser, url);
        report.editor = await editor(browser, url);
        report.defeat = await defeat(browser, url);
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
