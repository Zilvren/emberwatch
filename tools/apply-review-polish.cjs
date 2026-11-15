// Explicit, idempotent polish on the CURRENT native assets. Never reloads an older baseline.
// Ordinary game builds do not run this authoring tool.
const fs = require('node:fs');
const path = require('node:path');
const N = require('./native-assets.cjs');
const { root, read, ref, vec, color, asset, uuid, script, Graph, cleanComponent, graphicTemplate } = N;
function load(file) {
    const g = new Graph(file, path.basename(file));
    g.graph = read(file);
    g.root = g.graph[0].data.__id__;
    return g;
}
const components = (g, node) => (g.graph[node]._components ?? []).map(r => g.graph[r.__id__]);
const comp = (g, node, type) => components(g, node).find(c => c.__type__ === type);
function size(g, node, width, height) {
    comp(g, node, 'cc.UITransform')._contentSize = { __type__: 'cc.Size', width, height };
}
function label(g, id, x, y, width, height, fontSize, bold = false) {
    const l = g.graph[id], node = l.node.__id__;
    g.graph[node]._lpos = vec(x, y);
    size(g, node, width, height);
    Object.assign(l, { _fontSize: fontSize, _lineHeight: fontSize + 5, _isBold: bold,
        _enableOutline: false, _enableShadow: false, _overflow: 2, _enableWrapText: false,
        _color: color('454637') });
}
function paper(g, node, fill = 'e6dcc6') {
    if (!comp(g, node, 'cc.Graphics')) g.component(node, 'cc.Graphics', cleanComponent(graphicTemplate));
    const old = comp(g, node, script('ShapeGraphic'));
    if (old) g.graph[node]._components = g.graph[node]._components.filter(r => g.graph[r.__id__] !== old);
    const panel = comp(g, node, script('PaperPanel')) ?? g.graph[g.component(node, script('PaperPanel'))];
    Object.assign(panel, { fill: color(fill), line: color('8b816b'), innerLine: color('b0a68b', 65), lineWidth: 1.1, corner: 4 });
}
function button(g, id, x, y, width, height) {
    const a = typeof id === 'object' ? id : g.graph.find(o => o.__type__ === script('ButtonAction') && o.actionId === id);
    if (!a) return;
    const node = a.node.__id__, p = comp(g, node, script('ButtonPresentation'));
    g.graph[node]._lpos = vec(x, y);
    size(g, node, width, height);
    if (p) {
        size(g, p.surface.__id__, width, height);
        size(g, g.graph[p.focusRing.__id__].node.__id__, width + 8, height + 8);
    }
    label(g, a.caption.__id__, 0, 0, width - 20, height - 8, 16);
}
function save(g) {
    // Keep existing serialized indices, fileIds, UUIDs and overrides intact.
    fs.writeFileSync(path.join(root, g.file), JSON.stringify(g.graph, null, 2) + '\n');
}

{
    const g = load('assets/prefabs/ui/InventoryPopup.prefab');
    const backdrop = g.graph.find(o => o.__type__ === 'cc.BlockInputEvents').node.__id__;
    const main = g.graph[g.root]._children.map(r => r.__id__).find(n => {
        const c = comp(g, n, 'cc.UITransform');
        return g.graph[n]._name === 'Panel' && c?._contentSize.width === 1040 && g.graph[n]._lpos.x === 0;
    });
    if (main === undefined) throw Error('Current inventory paper surface not found');
    const shade = comp(g, backdrop, script('ShapeGraphic'));
    if (shade) Object.assign(shade, { fill: color('282b25', 180), outlineWidth: 0 });
    paper(g, main, 'ded2b6');
    g.graph[g.root]._children = g.graph[g.root]._children.filter(r =>
        r.__id__ === backdrop || r.__id__ === main || g.graph[r.__id__]._name !== 'Panel');
    for (const l of g.graph.filter(o => o.__type__ === 'cc.Label'))
        Object.assign(l, { _enableOutline: false, _enableShadow: false, _color: color('454637') });
    for (const value of g.graph.filter(o => o.__type__ === script('UIValue')))
        Object.assign(value, { normalColor: color('454637'), alertColor: color('8c5547') });
    for (const b of g.graph.filter(o => o.__type__ === script('ButtonPresentation'))) {
        b.theme = asset(uuid('assets/resources/ui/field-card-theme.json'), 'cc.JsonAsset');
        b.darkSurface = false;
    }
    const title = g.graph.find(o => o.__type__ === script('UIValue') && o.key === 'bag/text0');
    const titleLabel = comp(g, title.node.__id__, 'cc.Label');
    titleLabel._string = '行囊 / 本次探索';
    titleLabel._fontSize = 28;
    for (const row of g.graph.filter(o => o.__type__ === script('InventoryRowPresentation'))) {
        const node = row.node.__id__;
        g.graph[node]._children = g.graph[node]._children.filter(r => g.graph[r.__id__]._name !== 'Panel');
        size(g, node, 975, 62);
        paper(g, node);
        label(g, row.nameLabel.__id__, -302, 12, 230, 26, 19, true);
        label(g, row.weightLabel.__id__, -141, 0, 78, 28, 16);
        label(g, row.statusLabel.__id__, -23, 0, 150, 28, 16);
        if (!row.detailLabel) {
            const detail = g.label('ItemEffect', '', 0, 0, 230, 22, 13);
            g.graph[g.root]._children = g.graph[g.root]._children.filter(r => r.__id__ !== detail.node);
            g.graph[detail.node]._parent = ref(node);
            g.graph[node]._children.push(ref(detail.node));
            row.detailLabel = ref(detail.label);
        }
        label(g, row.detailLabel.__id__, -302, -14, 230, 22, 14);
        Object.assign(g.graph[row.detailLabel.__id__], { _color: color('535b43'), _horizontalAlign: 0 });
        button(g, g.graph[row.toggle.__id__], 164, 0, 178, 40);
        button(g, g.graph[row.discard.__id__], 385.5, 0, 178, 40);
    }
    button(g, 'bag-prev', -412, -256.5, 150, 42);
    button(g, 'bag-next', -132, -256.5, 150, 42);
    button(g, 'discard-supply', 356, -256.5, 264, 42);
    button(g, 'modal-close', 447, 279, 82, 42);
    save(g);
}

{
    const g = load('assets/prefabs/screens/MapScreen.prefab');
    for (const point of g.graph.filter(o => o.__type__ === script('MapPointPresentation'))) {
        const node = point.node.__id__, plateNode = g.graph[point.plate.__id__].node.__id__;
        // Retain the state-driven plate, replace the old pixel border fragments.
        g.graph[node]._children = g.graph[node]._children.filter(r =>
            g.graph[r.__id__]._name !== 'Panel' || r.__id__ === plateNode);
        const plate = g.graph[point.plate.__id__];
        plate.outlineWidth = 1.4;
    }
    const graph = g.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === 'RouteGraph');
    if (!g.graph.some(o => o.__type__ === 'cc.Node' && o._name === 'RouteConnections')) {
        const node = g.node('RouteConnections', graph, 0, 0, 1440, 900);
        const segments = [
            [[876,389],[876,409],[608,409],[608,489]],
            [[876,409],[1139,409],[1139,489]],
            [[608,558],[608,583]], [[1139,558],[1139,583]],
            [[608,652],[608,672],[876,672],[876,692]],
            [[1139,652],[1139,672],[876,672]],
            [[876,761],[876,775]],
        ];
        for (const [index, points] of segments.entries()) {
            const line = g.node('RoutePath' + index, node, 0, 0, 1440, 900);
            g.component(line, 'cc.Graphics', cleanComponent(graphicTemplate));
            g.component(line, script('ShapeGraphic'), {
                shape: 3, fill: color('000000', 0), outline: color('e0c99c', 220), outlineWidth: 2,
                points: points.map(([x,y]) => ({__type__:'cc.Vec2',x:x-720,y:450-y})),
                tiles: [], palette: [], tileColors: [],
            });
        }
        g.graph[graph]._children = [ref(node), ...g.graph[graph]._children.filter(r => r.__id__ !== node)];
    }
    const connections = g.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === 'RouteConnections');
    for (const pathRef of [...g.graph[connections]._children]) {
        const line = g.graph[pathRef.__id__], shape = comp(g, pathRef.__id__, script('ShapeGraphic'));
        if (!shape || line._name.endsWith('Shadow') || g.graph.some(o => o.__type__ === 'cc.Node' && o._name === line._name + 'Shadow')) continue;
        const shadow = g.node(line._name + 'Shadow', connections, 0, 0, 1440, 900);
        g.component(shadow, 'cc.Graphics', cleanComponent(graphicTemplate));
        g.component(shadow, script('ShapeGraphic'), { ...cleanComponent(shape), outline: color('343b2b', 210), outlineWidth: 4.5 });
        g.graph[connections]._children = [ref(shadow), ...g.graph[connections]._children.filter(r => r.__id__ !== shadow)];
    }
    save(g);
}

{
    const g = load('assets/prefabs/ui/ConfirmPopup.prefab');
    const panel = g.graph.find(o => o.__type__ === script('CommonPanel'));
    const closeNode = panel.closeButton.__id__, close = comp(g, closeNode, script('ButtonAction'));
    // The icon is independent of the contextual footer cancel caption.
    close.actionId = 'modal-close';
    g.graph[closeNode]._name = 'modal-close';
    g.graph[close.caption.__id__]._string = '×';
    save(g);
}

for (const [name, updates] of [
    ['DayTwoScreen', {'journal/text0':'第一次探索 / 教学已完成', 'journal/text6':'正式多日流程尚未开放 · 可重玩第 1 天'}],
    ['ShelterScreen', {'shelter/text0':'01  本次带回已清点'}],
]) {
    const g = load('assets/prefabs/screens/' + name + '.prefab');
    for (const [key,text] of Object.entries(updates)) {
        const binding = g.graph.find(o => o.__type__ === script('UIValue') && o.key === key);
        if (binding) comp(g, binding.node.__id__, 'cc.Label')._string = text;
    }
    if (name === 'DayTwoScreen') {
        const action = g.graph.find(o => o.__type__ === script('ButtonAction') && o.actionId === 'journal-start');
        g.graph[action.caption.__id__]._string = '重玩第 1 天';
    }
    save(g);
}
console.log('Applied current-asset inventory, route and completion polish. Actor resources unchanged.');
