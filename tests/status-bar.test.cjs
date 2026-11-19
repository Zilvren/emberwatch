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
        armor: 0,
        critical: true,
        carried: 30,
        overflow: 8,
    });
    const view = statusBarView(source);
    assert.equal(view.actionsEnabled, true);
    assert.equal(view.suppliesHint, '补给用尽');
    assert.match(view.armorTitle, /感染临界/);
    assert.equal(view.armorRatio, 0);
    assert.equal(view.carryHint, '暂存 8 / 10');
    assert.equal(source.supplies, 0);
});
test('zero armor does not invent death or defeat text', () => {
    const view = statusBarView({ ...defaultStatus, armor: 0, critical: true });
    assert.doesNotMatch(JSON.stringify(view), /死亡|失败|结束/);
    assert.equal(view.armor, '0 / 10');
});
test('full carrying space and overflow are distinct display states', () => {
    const full = statusBarView({ ...defaultStatus, carried: 30 });
    assert.equal(full.carryHint, '携带已满');
    assert.equal(
        statusBarView({ ...defaultStatus, carried: 30, overflow: 4 }).carryHint,
        '暂存 4 / 10'
    );
    assert.equal(statusBarView({ ...defaultStatus, carried: 27 }).carryHint, '剩余 3 负重');
});
test('save failure, protected saves and recovered backups remain visible', () => {
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '保存失败，请勿关闭' }).saveTone,
        'danger'
    );
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '原存档已保留' }).save,
        '原存档已保留'
    );
    assert.equal(statusBarView({ ...defaultStatus, saveStatus: '已恢复备份' }).saveTone, 'warning');
    assert.equal(
        statusBarView({ ...defaultStatus, saveStatus: '调试模式 · 不存档' }).save,
        '本次测试不保存'
    );
});
test('large resource values remain exact instead of silently rounding', () => {
    assert.equal(statusBarView({ ...defaultStatus, supplies: 12345678 }).supplies, '12345678');
    assert.equal(statusBarView({ ...defaultStatus, day: 123 }).day, '第 123 天');
});
test('container widths select readable layouts without overlapping actionable controls', () => {
    const intersects = (a, b) =>
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6 &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-6;
    for (const recipesVisible of [false, true]) {
        for (const width of [360, 408, 719, 720, 960, 1179, 1180, 1320, 1440]) {
            const grid = statusBarLayout(width, 'strip', recipesVisible);
            assert.equal(grid.sections.length, 5);
            assert.equal(grid.utilities.length, recipesVisible ? 5 : 4);
            const bag = {
                ...grid.sections[4],
                width: Math.min(224, grid.sections[4].width),
                height: 40,
                y: grid.sections[4].y + 5,
            };
            const controls = [bag, ...grid.utilities];
            for (const [index, control] of controls.entries()) {
                assert.equal(control.height, 40);
                assert.ok(control.x - control.width / 2 >= -width / 2 + grid.padding - 1e-6);
                assert.ok(control.x + control.width / 2 <= width / 2 - grid.padding + 1e-6);
                assert.ok(control.y - control.height / 2 >= -grid.height / 2);
                assert.ok(control.y + control.height / 2 <= grid.height / 2);
                for (const next of controls.slice(index + 1)) assert.ok(!intersects(control, next));
            }
        }
    }
    assert.equal(statusBarLayout(1440).height, 80);
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
        ['audio', 'bag', 'help', 'log', 'map', 'recipe-open', 'restart', 'rules-help']
    );
    for (const control of a.filter((o) => o.__type__ === 'cc.Button')) {
        const click = a[control.clickEvents[0].__id__];
        assert.equal(click.handler, 'activate');
        assert.equal(click.component, 'ButtonAction');
    }
});
