// Explicit, repeatable authoring of current native resources. Ordinary builds do not run this.
const fs = require('node:fs');
const path = require('node:path');
const N = require('./native-assets.cjs');
const { root, read, Graph, ref, vec, color, script, cleanComponent, graphicTemplate } = N;
function load(file) {
    const backup = path.join(root, 'temp/hand-shelter-before', file);
    if (!fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(path.join(root, file), backup);
    }
    const g = new Graph(file, path.basename(file));
    g.graph = read(file);
    g.root = g.graph[0].data.__id__;
    return g;
}
const node = (g, name) => {
    const id = g.graph.findIndex((n) => n.__type__ === 'cc.Node' && n._name === name);
    if (id < 0) throw Error('Missing native node: ' + name);
    return id;
};
const comp = (g, n, type) =>
    (g.graph[n]._components ?? []).map((r) => g.graph[r.__id__]).find((c) => c.__type__ === type);
function box(g, n, x, y, width, height) {
    g.graph[n]._lpos = vec(x, y);
    comp(g, n, 'cc.UITransform')._contentSize = { __type__: 'cc.Size', width, height };
}
function font(g, n, size, line = size + 4) {
    Object.assign(comp(g, n, 'cc.Label'), {
        _fontSize: size,
        _lineHeight: line,
        _enableWrapText: true,
        _overflow: 2,
    });
}
function resizeButton(g, n, x, y, width, height) {
    box(g, n, x - 720, 450 - y, width, height);
    const visit = (id) => {
        const item = g.graph[id];
        const label = comp(g, id, 'cc.Label');
        const focus = item._name === 'KeyboardFocus';
        if (comp(g, id, 'cc.UITransform'))
            box(
                g,
                id,
                0,
                0,
                label ? width - 32 : width + (focus ? 8 : 0),
                label ? height - 10 : height + (focus ? 8 : 0)
            );
        if (label) font(g, id, 18, 24);
        for (const child of item._children ?? []) visit(child.__id__);
    };
    for (const child of g.graph[n]._children ?? []) visit(child.__id__);
}

{
    const g = load('assets/prefabs/cards/HandCard.prefab');
    g.graph.find((c) => c.__type__ === script('CardPresentation')).compact = true;
    for (const name of ['HandCard', 'Motion', 'Visual']) box(g, node(g, name), 0, 0, 174, 258);
    box(g, node(g, 'Paper'), 0, 0, 174, 258);
    box(g, node(g, 'SelectedOutline'), 0, 0, 178, 262);
    box(g, node(g, 'Title'), -17, 103, 112, 40);
    font(g, node(g, 'Title'), 22, 24);
    box(g, node(g, 'CostBadge'), 65, 102, 32, 42);
    box(g, node(g, 'Cost'), 0, 7, 30, 28);
    font(g, node(g, 'Cost'), 26, 28);
    box(g, node(g, 'CostUnit'), 0, -12, 30, 15);
    font(g, node(g, 'CostUnit'), 11, 14);
    box(g, node(g, 'FrontContent'), 0, 0, 174, 200);
    box(g, node(g, 'Artwork'), 0, 44, 70, 70);
    box(g, node(g, 'UnavailableArtWash'), 0, 44, 72, 72);
    box(g, node(g, 'EffectRule'), 0, 2, 152, 0.8);
    box(g, node(g, 'Effect'), 0, -24, 154, 42);
    font(g, node(g, 'Effect'), 20, 23);
    box(g, node(g, 'Description'), 0, -74, 154, 48);
    font(g, node(g, 'Description'), 14, 18);
    box(g, node(g, 'FooterRule'), 0, -101, 152, 0.8);
    box(g, node(g, 'Status'), 0, -114, 154, 22);
    font(g, node(g, 'Status'), 14, 18);
    box(g, node(g, 'DetailsViewport'), 0, -10, 150, 176);
    box(g, node(g, 'FullDescription'), 0, 88, 150, 176);
    font(g, node(g, 'FullDescription'), 16, 22);
    g.save();
}
{
    const g = load('assets/prefabs/screens/BattleScreen.prefab');
    const hand = g.graph.find((c) => c.__type__ === script('HandPresentation'));
    Object.assign(hand, {
        spacing: 5,
        fanCurve: 6,
        fanAngle: 2.2,
        hoverLift: 28,
        hoverScale: 1.08,
    });
    box(g, hand.node.__id__, -15, 450 - 735, 1120, 258);
    const hint = g.graph.find((c) => c.__type__ === script('UIValue') && c.key === 'battle/text9');
    box(g, hint.node.__id__, 0, 450 - 582, 480, 38);
    font(g, hint.node.__id__, 15, 18);
    g.save();
}
{
    const g = load('assets/prefabs/screens/ShelterScreen.prefab');
    const texts = [
        ['shelter/text0', 'shelter/loot-title', '本次带回', 610, 276, 720, 26, 18, 'd0cdbf'],
        ['shelter/text1', 'shelter/returned', '', 610, 321, 720, 42, 30, 'eee7d8'],
        ['shelter/text2', 'shelter/losses', '', 610, 367, 720, 38, 16, 'd0cdbf'],
        [
            'shelter/text3',
            'shelter/repair-title',
            '血量维护 · 可选',
            610,
            439,
            720,
            26,
            18,
            'd0cdbf',
        ],
        ['shelter/text4', 'shelter/health', '', 610, 485, 300, 42, 30, 'eee7d8'],
        ['shelter/text8', 'shelter/repair-hint', '', 610, 535, 720, 42, 16, 'd0cdbf'],
        ['shelter/text5', 'shelter/daily-title', '今晚的生存消耗', 610, 628, 720, 26, 18, 'd0cdbf'],
        ['shelter/text6', 'shelter/daily-summary', '', 610, 675, 720, 42, 28, 'eee7d8'],
        ['shelter/text7', 'shelter/daily-hint', '', 610, 721, 720, 32, 16, 'd0cdbf'],
    ];
    for (const [oldKey, key, text, left, y, width, height, size, tint] of texts) {
        const binding = g.graph.find(
            (c) => c.__type__ === script('UIValue') && (c.key === key || c.key === oldKey)
        );
        if (!binding) throw Error('Missing shelter binding: ' + oldKey);
        binding.key = key;
        binding.normalColor = color(tint);
        binding.alertColor = color('dfad83');
        const n = binding.node.__id__;
        g.graph[n]._name = key.split('/')[1];
        box(g, n, left + width / 2 - 720, 450 - y, width, height);
        font(g, n, size);
        Object.assign(comp(g, n, 'cc.Label'), {
            _string: text,
            _horizontalAlign: 0,
            _color: color(tint),
            _isBold: size >= 28,
            _outlineWidth: 1.25,
        });
    }
    const subtitle = g.graph.find(
        (c) => c.__type__ === script('UIValue') && c.key === 'banner/text2'
    );
    comp(g, subtitle.node.__id__, 'cc.Label')._string = '修复可选。每日消耗在结束结算时支付。';
    for (const [id, x, y, w, h] of [
        ['shelter-repair', 1180, 485, 300, 48],
        ['shelter-done', 1145, 816, 370, 56],
    ]) {
        const a = g.graph.find((c) => c.__type__ === script('ButtonAction') && c.actionId === id);
        resizeButton(g, a.node.__id__, x, y, w, h);
    }
    for (const [name, y] of [
        ['ReturnDivider', 405],
        ['MaintenanceDivider', 585],
    ]) {
        let n = g.graph.findIndex((o) => o.__type__ === 'cc.Node' && o._name === name);
        if (n < 0) {
            n = g.node(name, g.root, 250, 450 - y, 720, 1);
            g.component(n, 'cc.Graphics', cleanComponent(graphicTemplate));
            g.component(n, script('ShapeGraphic'), {
                shape: 0,
                fill: color('b3b09a', 90),
                outline: color('b3b09a', 0),
                outlineWidth: 0,
                points: [],
                tiles: [],
                palette: [],
                tileColors: [],
            });
        }
    }
    const shade = g.graph.find((c) => c.__type__ === script('SceneShade'));
    if (shade) shade.right = 185;
    g.save();
}
console.log(
    JSON.stringify({
        authored: ['HandCard', 'BattleScreen', 'ShelterScreen'],
        characterChanges: 0,
        ordinaryBuildGeneration: false,
    })
);
