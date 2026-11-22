// Explicit authoring of the two native camp prefabs and their main-scene instances.
const fs = require('node:fs');
const path = require('node:path');
const N = require('./native-assets.cjs');
const U = require('./ui-authoring.cjs');

const screenFile = 'assets/prefabs/screens/GateCampScreen.prefab';
const popupFile = 'assets/prefabs/ui/CampStationPopup.prefab';
const sceneFile = 'assets/TheEnd.scene';
const theme = N.asset(N.uuid('assets/ashen-labyrinth/interface/theme.json'), 'cc.JsonAsset');
const imageMeta = N.read('assets/ashen-labyrinth/interface/gate-camp.jpg.meta');
const frame = Object.values(imageMeta.subMetas).find(item => item.importer === 'sprite-frame');
if (!frame) throw new Error('Import gate-camp.jpg as a native SpriteFrame before authoring.');

function prefab(file, name, key) {
    const g = new N.Graph(file, name);
    g.root = g.node(name, null);
    g.component(g.root, N.script('GameView'), { key });
    return g;
}
function component(g, node, type) {
    return g.graph[node]._components.map(r => g.graph[r.__id__]).find(item => item.__type__ === type);
}
function position(g, node, parent, x, y) {
    U.move(g, node, parent);
    g.graph[node]._lpos = N.vec(x, y);
}
function label(g, parent, name, value, x, y, width, height, font, hex, options = {}) {
    const result = g.label(name, value, 0, 0, width, height, font, hex);
    position(g, result.node, parent, x, y);
    Object.assign(g.graph[result.label], {
        _font: null, _isSystemFontUsed: true, _fontFamily: 'Microsoft YaHei',
        _isBold: !!options.bold, _horizontalAlign: options.align ?? 0,
        _verticalAlign: 1, _overflow: 2, _enableWrapText: !!options.wrap,
        _enableOutline: !!options.outline, _outlineWidth: 1.3, _outlineColor: N.color('2a202f', 205),
        _lineHeight: options.lineHeight ?? font + 6,
    });
    if (options.key) g.component(result.node, N.script('UIValue'), { key: options.key, format: '{value}' });
    return result;
}
function shape(g, parent, name, x, y, w, h, hex, opacity = 255) {
    const node = g.shape(name, 0, 0, w, h, hex, opacity);
    position(g, node, parent, x, y);
    return node;
}
function button(g, parent, id, caption, x, y, w, h, variant) {
    const node = U.button(g, id, caption, 0, 0, w, h, variant);
    position(g, node, parent, x, y);
    const presentation = component(g, node, N.script('ButtonPresentation'));
    Object.assign(presentation, { theme, darkSurface: true });
    return { node, presentation, action: g.graph[node]._components.find(r =>
        g.graph[r.__id__].__type__ === N.script('ButtonAction')) };
}

// Hit areas include the painted object and its marker. Coordinates are in
// the registered 1440 x 900 plate, measured from its upper left.
function station(g, parent, id, caption, hit, tag, below = true) {
    const [x, y, w, h] = hit, [tx, ty, tagWidth] = tag;
    const item = button(g, parent, id, caption, x - 720, 450 - y, tagWidth, 39, 'secondary');
    item.presentation.transparentSurface = true;
    const dx = tx - x, dy = y - ty;
    const size = component(g, item.node, 'cc.UITransform')._contentSize;
    Object.assign(size, { width: w, height: h });
    const surface = g.graph[item.presentation.surface.__id__];
    const ringNode = g.graph[item.presentation.focusRing.__id__].node.__id__;
    surface._lpos = N.vec(dx, dy);
    g.graph[ringNode]._lpos = N.vec(dx, dy);
    const card = g.graph[item.presentation.panel.__id__];
    Object.assign(card, { corner: 5, lineWidth: 1 });
    const name = g.graph[item.presentation.caption.__id__];
    Object.assign(name, { _fontSize: 18, _lineHeight: 23, _isBold: false });
    const direction = below ? 1 : -1;
    shape(g, item.node, id + '-leader', dx, dy + direction * 27, 1.3, 14, 'e7c992', 220);
    const pin = shape(g, item.node, id + '-pin', dx, dy + direction * 35, 5.8, 5.8, 'f1d59d');
    g.graph[pin]._lrot = { __type__: 'cc.Quat', x: 0, y: 0, z: 0.38268343, w: 0.92387953 };
    g.graph[pin]._euler = N.vec(0, 0, 45);
}

function campScreen() {
    const g = prefab(screenFile, 'GateCampScreen', 'camp');
    const art = g.node('CampPainting', g.root);
    g.component(art, 'cc.Sprite', { ...N.cleanComponent(N.spriteTemplate),
        _spriteFrame: N.asset(frame.uuid, 'cc.SpriteFrame'), _sizeMode: 0, _type: 0,
        _color: N.color('ffffff'), _customMaterial: null });
    const embers = g.node('Embers', g.root, -76, -190, 160, 170);
    g.component(embers, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(embers, N.script('CampEmbers'));
    const shade = g.node('EdgeLight', g.root);
    g.component(shade, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(shade, N.script('SceneShade'), { top: 139, bottom: 122, right: 0, tint: N.color('211c2b') });

    const controls = g.node('CampControls', g.root);
    station(g, controls, 'camp-keeper', '守门人', [844, 391, 305, 464], [951, 451, 114], false);
    station(g, controls, 'camp-bench', '整备台', [247, 561, 360, 252], [241, 661, 114]);
    station(g, controls, 'camp-warehouse', '仓库', [1212, 578, 348, 268], [1222, 687, 102]);
    station(g, controls, 'camp-fire', '篝火', [642, 694, 194, 262], [643, 796, 102]);
    g.save();
}

function stationPopup() {
    const g = prefab(popupFile, 'CampStationPopup', 'camp-station');
    const backdrop = shape(g, g.root, 'DismissBackdrop', 0, 0, 1440, 900, '231c29', 88);
    g.component(backdrop, 'cc.BlockInputEvents');
    const panel = g.node('StationPanel', g.root, 0, -275, 1120, 245);
    g.component(panel, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(panel, N.script('PaperPanel'), { fill: N.color('2c2533', 249),
        line: N.color('a38b7b'), innerLine: N.color('655664', 140), corner: 9, lineWidth: 1.2 });
    g.component(panel, 'cc.BlockInputEvents');
    shape(g, panel, 'ContextRule', -497, 85, 36, 2, 'd1ac77');
    const context = label(g, panel, 'StationContext', '', -262, 85, 407, 28, 16, 'd5b58e');
    const title = label(g, panel, 'StationTitle', '', -151, 40, 726, 55, 34, 'f3e6d5', { bold: true });
    const body = label(g, panel, 'StationBody', '', -151, -48, 726, 112, 21, 'dacbd5', { wrap: true, lineHeight: 31 });
    shape(g, panel, 'ActionDivider', 277, 0, 1, 153, '766271', 155);
    const primary = button(g, panel, 'camp-primary', '选择入场补给', 408, 46, 208, 47, 'primary');
    const secondary = button(g, panel, 'camp-secondary', '', 408, -11, 208, 46, 'secondary');
    const close = button(g, panel, 'modal-close', '回到营地', 408, -70, 208, 42, 'quiet');
    g.component(panel, N.script('CampStationPanel'), { context: N.ref(context.label),
        title: N.ref(title.label), body: N.ref(body.label), primary: primary.action, secondary: secondary.action });
    g.component(g.root, N.script('ModalPanel'), { backdrop: N.ref(backdrop), closeAction: 'modal-close', closeOnBackdrop: true, closeOnEscape: true });
    g.component(g.root, N.script('ButtonFocusGroup'), { modal: true, buttons: [primary.node, secondary.node, close.node].map(N.ref), initialButton: N.ref(close.node) });
    g.save();
}

function bindMainScene() {
    const g = new N.Graph(sceneFile, 'TheEnd');
    const director = g.graph.find(o => o.__type__ === N.script('GameDirector'));
    const prefabInfo = g.graph.find(o => Array.isArray(o.nestedPrefabInstanceRoots));
    for (const [file, name, parent, roots] of [
        [screenFile, 'GateCampScreen', director.screensRoot, director.screenRoots],
        [popupFile, 'CampStationPopup', director.popupRoot, director.popupRoots],
    ]) {
        const existing = roots.some(ref => g.graph[g.graph[ref.__id__]._prefab?.__id__]?.asset?.__uuid__ === N.uuid(file));
        if (existing) continue;
        g.root = parent.__id__;
        const node = g.linked(file, name, 0, 0);
        const info = g.graph[g.graph[node]._prefab.__id__];
        const props = g.graph[info.instance.__id__].propertyOverrides.map(ref => g.graph[ref.__id__]);
        props.find(p => p.propertyPath[0] === '_active').value = false;
        roots.push(N.ref(node));
        prefabInfo.nestedPrefabInstanceRoots.push(N.ref(node));
    }
    // Append new instances without changing existing scene object IDs.
    fs.writeFileSync(path.join(N.root, sceneFile), JSON.stringify(g.graph, null, 2) + '\n');
}

campScreen();
stationPopup();
for (const f of [screenFile, popupFile]) N.ensureMeta(f, 'prefab');
bindMainScene();
