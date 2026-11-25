const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path');
const root = path.resolve(__dirname, '..'),
    load = require('../tools/load-ts.cjs').createLoader();
const { statusBarView, defaultStatus } = load(
    path.join(root, 'assets/game/presentation/ui/StatusBarModel.ts')
);
const { statusBarLayout } = load(path.join(root, 'assets/game/presentation/ui/StatusBarLayout.ts'));
test('status warnings never disable actions or mutate their source state', () => {
    const source = Object.freeze({
        ...defaultStatus,
        supplies: 0,
        health: 0,
    });
    const view = statusBarView(source);
    assert.equal(view.actionsEnabled, true);
    assert.equal(view.suppliesTone, 'warning');
    assert.equal(view.healthTone, 'danger');
    assert.equal(view.healthRatio, 0);
    assert.equal(source.supplies, 0);
});
test('zero health does not invent death or defeat text', () => {
    const view = statusBarView({ ...defaultStatus, health: 0 });
    assert.doesNotMatch(JSON.stringify(view), /死亡|失败|结束/);
    assert.equal(view.health, '0 / 10');
});
test('the top row exposes deck size and has no weight readout', () => {
    const view = statusBarView({ ...defaultStatus, deckCount: 16 });
    assert.equal(view.bag, '牌组 · 16 张');
    assert.doesNotMatch(JSON.stringify(view), /负重|暂存|容量/);
});
test('save failure, protected saves and recovered backups remain visible', () => {
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '保存失败，请勿关闭' }).saveTone,
        'danger'
    );
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '原存档已保留' }).saveSymbol,
        'warning'
    );
    assert.equal(statusBarView({ ...defaultStatus, saveStatus: '已恢复备份' }).saveTone, 'warning');
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '调试模式 · 不存档' }).saveSymbol,
        'unsaved'
    );
});
test('large resource values remain exact instead of silently rounding', () => {
    assert.equal(statusBarView({ ...defaultStatus, supplies: 12345678 }).supplies, '12345678');
    assert.equal(statusBarView({ ...defaultStatus, day: 123 }).day, '123');
});
test('container widths select readable layouts without overlapping actionable controls', () => {
    const intersects = (a, b) =>
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6 &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-6;
    for (const recipesVisible of [false, true]) {
        for (const width of [360, 408, 719, 720, 960, 1179, 1180, 1320, 1440]) {
            const grid = statusBarLayout(width, 'strip', recipesVisible);
            assert.equal(grid.sections.length, 5);
            assert.equal(grid.utilities.length, recipesVisible ? 4 : 3);
            const bag = {
                ...grid.sections[4],
                height: 42,
            };
            const controls = [bag, ...grid.utilities];
            for (const [index, control] of controls.entries()) {
                assert.equal(control.height, 42);
                assert.ok(control.x - control.width / 2 >= -width / 2 + grid.padding - 1e-6);
                assert.ok(control.x + control.width / 2 <= width / 2 - grid.padding + 1e-6);
                assert.ok(control.y - control.height / 2 >= -grid.height / 2);
                assert.ok(control.y + control.height / 2 <= grid.height / 2);
                for (const next of controls.slice(index + 1)) assert.ok(!intersects(control, next));
            }
        }
    }
    assert.equal(statusBarLayout(1440).height, 76);
    assert.equal(statusBarLayout(960).mode, 'compact');
    assert.equal(statusBarLayout(408).mode, 'narrow');
});
test('native HUD keeps status bindings and exposes both map and recipe entries', () => {
    const { read, script } = require('../tools/native-assets.cjs'),
        a = read('assets/prefabs/ui/HUD.prefab');
    const statusBar = a.find((o) => o.__type__ === script('StatusBar'));
    assert.equal(a[statusBar.recipeButton.__id__]._name, 'recipe-open');
    assert.ok(!a.some((o) => o.__type__ === script('UIValue') && o.key.startsWith('header/')));
    assert.deepEqual(
        a
            .filter((o) => o.__type__ === script('ButtonAction'))
            .map((o) => o.actionId)
            .sort(),
        ['bag', 'log', 'map', 'recipe-open', 'rules-help', 'settings']
    );
    for (const control of a.filter((o) => o.__type__ === 'cc.Button')) {
        const click = a[control.clickEvents[0].__id__];
        assert.equal(click.handler, 'activate');
        assert.equal(click.component, 'ButtonAction');
    }
});
