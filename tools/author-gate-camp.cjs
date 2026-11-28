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
// Midpoint of the illuminated opening on the original 1440 px painting.
const gateAxis = 777;
const gateCenterY = 450;
const paintingOffset = 720 - gateAxis;

function prefab(file, name, key) {
    const g = new N.Graph(file, name);
    g.root = g.node(name, null);
    g.component(g.root, N.script('GameView'), { key });
    return g;
}
function saveCampPrefab(g) {
    function fileIds(graph) {
        const ids = new Map();
        function visit(index, parent) {
            const node = graph[index], key = parent + '/' + node._name;
            ids.set(key, graph[node._prefab.__id__]);
            for (const ref of node._components) {
                const item = graph[ref.__id__];
                ids.set(key + '/@' + item.__type__, graph[item.__prefab.__id__]);
            }
            for (const child of node._children) visit(child.__id__, key);
        }
        visit(graph[0].data.__id__, '');
        return ids;
    }
    const previous = fs.existsSync(g.file) ? fileIds(N.read(g.file)) : new Map();
    const taken = new Set();
    for (const [key, info] of fileIds(g.graph)) {
        const formerSignPath = key.replace(/\/CampPainting\/Inscriptions\/(camp-[a-z]+)-sign/, '/CampControls/$1/$1-sign');
        const old = previous.get(key) ?? previous.get(formerSignPath) ?? previous.get(key.replace('/camp-skills', '/camp-bench'));
        info.fileId = old && !taken.has(old.fileId) ? old.fileId : N.identifier(g.file + ':' + key);
        taken.add(info.fileId);
    }
    g.save();
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

function paintedProp(g, parent, name, image, x, y, w, h, tint) {
    const propFrame = Object.values(N.read('assets/ashen-labyrinth/interface/' + image + '.png.meta').subMetas)
        .find(item => item.importer === 'sprite-frame');
    const node = g.node(name, parent, x - 720, 450 - y, w, h);
    g.component(node, 'cc.Sprite', { ...N.cleanComponent(N.spriteTemplate), _customMaterial: null,
        _spriteFrame: N.asset(propFrame.uuid, 'cc.SpriteFrame'), _sizeMode: 0, _type: 0, _color: N.color(tint) });
    return node;
}

// Ink and props are children of the painting. The separate, larger input areas follow the same coordinates.
function station(g, controls, markings, id, [x, y, w, h], caption, [inkX, inkY, width, font, color, angle]) {
    const node = g.node(id, controls, x - 720, 450 - y, w, h);
    const actionType = N.script('ButtonAction');
    const handler = g.add({ __type__: 'cc.ClickEvent', target: N.ref(node), component: 'ButtonAction',
        _componentId: actionType, handler: 'activate', customEventData: '' });
    g.component(node, 'cc.Button', { ...N.cleanComponent(N.buttonTemplate),
        _interactable: true, _transition: 0, _target: N.ref(node), clickEvents: [N.ref(handler)] });
    const action = g.component(node, actionType, { actionId: id });
    const presentation = g.component(node, N.script('ButtonPresentation'));
    const tag = g.node(id + '-sign', markings, inkX - 720, 450 - inkY, width, font + 9);
    if (angle) {
        const half = angle * Math.PI / 360;
        Object.assign(g.graph[tag]._lrot, { z: Math.sin(half), w: Math.cos(half) });
        g.graph[tag]._euler.z = angle;
    }
    const text = label(g, tag, id + '-caption', caption, 0, 0, width, font + 9, font, color, { align: 1 });
    const ink = g.graph[text.label];
    ink._fontFamily = 'KaiTi, "Kaiti SC", STKaiti, "Noto Serif CJK SC", serif';
    if (id !== 'camp-fire' && id !== 'camp-keeper') {
        ink._enableOutline = true;
        ink._outlineColor = N.color('47343e', 170);
        ink._outlineWidth = 0.65;
    }
    g.graph[action].caption = N.ref(text.label);
    return N.ref(presentation);
}

function campScreen() {
    const g = prefab(screenFile, 'GateCampScreen', 'camp');
    component(g, g.root, 'cc.UITransform')._contentSize.width = 2 * (1440 - gateAxis);
    g.component(g.root, 'cc.Mask', { _type: 0, _inverted: false });
    const art = g.node('CampPainting', g.root, paintingOffset);
    const painting = g.component(art, 'cc.Sprite', { ...N.cleanComponent(N.spriteTemplate),
        _spriteFrame: N.asset(frame.uuid, 'cc.SpriteFrame'), _sizeMode: 0, _type: 0,
        _color: N.color('ffffff'), _customMaterial: N.asset(N.uuid('assets/ashen-labyrinth/interface/gate-camp.mtl'), 'cc.Material') });
    const markings = g.node('Inscriptions', art);
    const book = paintedProp(g, markings, 'OpenJournal', 'camp-journal', 527, 681, 90, 35, 'f2ded4');
    // The book rests on the left stool, with its warm page edge toward the fire.
    g.graph[book]._lscale.x = -1;
    paintedProp(g, markings, 'CounterCloth', 'camp-countercloth', 864, 577, 102, 34, 'eee1dc');
    const embers = g.node('Embers', g.root, paintingOffset - 76, -190, 160, 170);
    g.component(embers, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    const atmosphere = g.component(embers, N.script('CampAtmosphere'), { painting: N.ref(painting) });
    const shade = g.node('EdgeLight', g.root, paintingOffset);
    g.component(shade, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(shade, N.script('SceneShade'), { top: 52, bottom: 66, right: 0, tint: N.color('211c2b') });

    const controls = g.node('CampControls', g.root, paintingOffset);
    Object.assign(g.graph[atmosphere], {
        gate: station(g, controls, markings, 'camp-gate', [gateAxis, gateCenterY, 176, 304], '进入　　迷宫',
            [gateAxis, gateCenterY, 173, 25, 'f3d6a7', 0]),
        bench: station(g, controls, markings, 'camp-skills', [240, 598, 340, 209], '技能树',
            [251, 676, 78, 24, 'eccca4', 1.5]),
        keeper: station(g, controls, markings, 'camp-keeper', [896, 553, 154, 156], '交谈 · 交易',
            [864, 577, 90, 19, 'f2d9b2', -1]),
        warehouse: station(g, controls, markings, 'camp-warehouse', [1220, 646, 268, 176], '仓库',
            [1151, 656, 75, 26, 'f0cea0', -2]),
        brazier: station(g, controls, markings, 'camp-fire', [591, 660, 233, 266], '日志',
            [505, 680, 44, 20, '35242a', 2]),
    });
    saveCampPrefab(g);
}

function skillTree(g) {
    const panel = g.node('SkillTreePanel', g.root, 0, -72, 1080, 412);
    g.component(panel, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(panel, N.script('PaperPanel'), { fill: N.color('2d2631', 248), line: N.color('ae9074'),
        innerLine: N.color('79646a', 145), corner: 10, lineWidth: 1.5 });
    g.component(panel, 'cc.BlockInputEvents');
    label(g, panel, 'SkillTreeTitle', '技能树', -340, 152, 300, 55, 38, 'f5e6d1', { bold: true });
    label(g, panel, 'SkillTreeLifetime', '学会的技能在每次探索中生效', -245, 105, 490, 34, 22, 'cfbda9');
    const balance = label(g, panel, 'SkillBalance', '', 304, 155, 238, 44, 25, 'ead0a8', { align: 2 });
    const close = button(g, panel, 'skill-close', '回到营地', 478, 156, 62, 54, 'quiet');
    g.graph[close.action.__id__].actionId = 'modal-close';
    shape(g, panel, 'SkillHeaderRule', 0, 76, 980, 1.5, '8c7373', 190);
    shape(g, panel, 'SkillDetailRule', 12, -45, 1.5, 194, '8c7373', 175);
    shape(g, panel, 'SkillTrunk', -275, -14, 60, 3, 'b39a77');
    shape(g, panel, 'SkillFork', -246, -14, 3, 108, 'b39a77');
    for (const [key, y] of [['Guard', 40], ['Initiative', -68]])
        shape(g, panel, key + 'Link', -225, y, 45, 3, 'b39a77');
    const nodes = [
        ['footing', -391, -14], ['guard', -119, 40], ['initiative', -119, -68],
    ].map(([key, x, y]) => {
        const choice = button(g, panel, 'camp-select-' + key, '', x, y, 172, 76, 'secondary');
        g.graph[choice.action.__id__].payload = key;
        return choice;
    });
    const requirement = label(g, panel, 'SkillRequirement', '', 275, 43, 438, 35, 21, 'd8b58b');
    const name = label(g, panel, 'SkillName', '', 275, -9, 438, 55, 34, 'f5e6d1', { bold: true });
    const effect = label(g, panel, 'SkillEffect', '', 275, -72, 438, 78, 23, 'e2d2c9', { wrap: true, lineHeight: 32 });
    const learn = button(g, panel, 'camp-learn', '学习', 259, -151, 302, 57, 'primary');
    const equipment = button(g, panel, 'camp-equipment', '整备与牌册', -255, -155, 202, 49, 'secondary');
    g.component(panel, N.script('CampSkillTree'), { nodes: nodes.map(n => n.action), balance: N.ref(balance.label),
        nameLabel: N.ref(name.label), effect: N.ref(effect.label), requirement: N.ref(requirement.label), learn: learn.action });
    g.graph[panel]._active = false;
    return [...nodes, learn, equipment, close].map(button => N.ref(button.node));
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
    const focus = g.component(g.root, N.script('ButtonFocusGroup'), { modal: true, buttons: [primary.node, secondary.node, close.node].map(N.ref), initialButton: N.ref(close.node) });
    const sound = button(g, panel, 'camp-audio', '声音开启', 228, 78, 54, 44, 'quiet');
    component(g, panel, N.script('CampStationPanel')).sound = sound.action;
    g.graph[focus].buttons.splice(2, 0, N.ref(sound.node));
    g.graph[focus].buttons.push(...skillTree(g));
    saveCampPrefab(g);
}

function bindMainScene() {
    const g = new N.Graph(sceneFile, 'TheEnd');
    const director = g.graph.find(o => o.__type__ === N.script('GameDirector'));
    const prefabInfo = g.graph.find(o => Array.isArray(o.nestedPrefabInstanceRoots));
    let added = false;
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
        added = true;
    }
    // Append new instances without changing existing scene object IDs.
    if (added) fs.writeFileSync(path.join(N.root, sceneFile), JSON.stringify(g.graph, null, 2) + '\n');
}

campScreen();
stationPopup();
for (const f of [screenFile, popupFile]) N.ensureMeta(f, 'prefab');
bindMainScene();
