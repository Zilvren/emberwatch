// Explicit authoring of the gate camp, its full-screen rooms, and the keeper dialogue.
const fs = require('node:fs');
const path = require('node:path');
const N = require('./native-assets.cjs');
const U = require('./ui-authoring.cjs');

const screenFile = 'assets/prefabs/screens/GateCampScreen.prefab';
const campPages = {
    'camp-skills': 'CampSkillsScreen', 'camp-warehouse': 'CampWarehouseScreen', 'camp-journal': 'CampTaskJournalScreen',
    'camp-keeper': 'CampRelicShopScreen',
};
const pageFile = name => 'assets/prefabs/screens/' + name + '.prefab';
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
    const file = path.extname(image) ? image : image + '.png';
    const propFrame = Object.values(N.read('assets/ashen-labyrinth/interface/' + file + '.meta').subMetas)
        .find(item => item.importer === 'sprite-frame');
    const node = g.node(name, parent, x - 720, 450 - y, w, h);
    g.component(node, 'cc.Sprite', { ...N.cleanComponent(N.spriteTemplate), _customMaterial: null,
        _spriteFrame: N.asset(propFrame.uuid, 'cc.SpriteFrame'), _sizeMode: 0, _type: 0, _trim: false, _color: N.color(tint) });
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
    if (id !== 'camp-journal' && id !== 'camp-keeper') {
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
    const atmosphere = g.component(embers, N.script('CampAtmosphere'), { painting: N.ref(painting),
        journalArt: N.ref(g.graph[book]._components.find(r => g.graph[r.__id__].__type__ === 'cc.Sprite').__id__) });
    const shade = g.node('EdgeLight', g.root, paintingOffset);
    g.component(shade, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(shade, N.script('SceneShade'), { top: 52, bottom: 66, right: 0, tint: N.color('211c2b') });

    const controls = g.node('CampControls', g.root, paintingOffset);
    Object.assign(g.graph[atmosphere], {
        gate: station(g, controls, markings, 'camp-gate', [gateAxis, gateCenterY, 176, 304], '进入　　迷宫',
            [gateAxis, gateCenterY, 173, 25, 'f3d6a7', 0]),
        bench: station(g, controls, markings, 'camp-skills', [240, 598, 340, 209], '技能树',
            [251, 676, 78, 24, 'eccca4', 1.5]),
        keeper: station(g, controls, markings, 'camp-keeper', [896, 553, 154, 156], '遗物商店',
            [864, 577, 90, 19, 'f2d9b2', -1]),
        warehouse: station(g, controls, markings, 'camp-warehouse', [1220, 646, 268, 176], '仓库',
            [1151, 656, 75, 26, 'f0cea0', -2]),
        journal: station(g, controls, markings, 'camp-journal', [527, 681, 122, 72], '日志',
            [505, 680, 44, 20, '35242a', 2]),
    });
    saveCampPrefab(g);
}

function pageInk(g, parent, name, text, x, y, w, h, font, hex, options = {}) {
    const result = label(g, parent, name, text, x, y, w, h, font, hex, options);
    g.graph[result.label]._fontFamily = 'KaiTi, "Kaiti SC", STKaiti, "Noto Serif CJK SC", serif';
    return result.label;
}

function campPage(key, roomImage) {
    const name = campPages[key];
    const g = prefab(pageFile(name), name, key);
    const room = g.node('Room', g.root);
    paintedProp(g, room, 'Setting', roomImage, 720, 450, 1440, 900, 'ffffff');
    const content = g.node('PageContent', g.root);
    return { g, room, content };
}

function pageBack(g, content, initialButton) {
    const back = button(g, content, 'camp-back', '返回营地', 511, 324, 156, 55, 'quiet');
    g.component(g.root, N.script('ButtonFocusGroup'), { backAction: 'camp-back', initialButton: N.ref(initialButton ?? back.node) });
    return back;
}

function roomButton(g, parent, id, caption, w, h, variant = 'quiet') {
    const item = button(g, parent, id, caption, 0, 0, w, h, variant);
    const ink = g.graph[item.presentation.caption.__id__];
    Object.assign(ink, {_fontFamily:'KaiTi, "Kaiti SC", STKaiti, serif', _fontSize:23, _lineHeight:29});
    return item;
}

function roomChrome(g, content, title, withFooter = true) {
    const light = g.node('RimLight', content);
    g.component(light, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(light, N.script('SceneShade'), {top:219, topDepth:335, bottom:205, right:0, tint:N.color('21191d')});
    const header = g.node('Header', content, 0, 414, 1300, 58);
    pageInk(g, header, 'Title', title, -330, -25, 640, 56, 44, 'ffe5b8', {outline:true});
    const back = roomButton(g, header, 'camp-back', '‹  返回营地', 144, 60);
    const footer = withFooter ? g.node('Footer', content, 0, -390, 1300, 54) : null;
    return {footer, back};
}

function roomDetail(g, content, icon, action) {
    const desk = g.node('Detail', content, 435, -20, 390, 472);
    g.component(desk, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(desk, N.script('PaperPanel'), {fill:N.color('302326', 236), line:N.color('ab8858', 195),
        innerLine:N.color('d8ae75', 120), lineWidth:1.5, corner:10});
    paintedProp(g, desk, 'Emblem', icon, 720, 290, 96, 96, 'fff5dc');
    const meta = pageInk(g, desk, 'DetailMeta', '', 0, 65, 340, 34, 22, 'e2bd83');
    const name = pageInk(g, desk, 'DetailName', '', 0, 18, 340, 61, 43, 'ffe5b9');
    shape(g, desk, 'Rule', 0, -24, 334, 1, 'ae8a5b', 180);
    const effect = label(g, desk, 'DetailEffect', '', 0, -70, 340, 80, 24, 'f1e1c8', {wrap:true, lineHeight:34});
    g.graph[effect.label]._verticalAlign = 0;
    const primary = action ? roomButton(g, desk, action, '', 224, 54, 'primary') : null;
    return {meta:N.ref(meta), name:N.ref(name), effect:N.ref(effect.label), primary:primary?.action};
}

function roomPager(g, footer, prefix) {
    const prev = roomButton(g, footer, prefix + '-prev', '‹', 64, 54);
    const next = roomButton(g, footer, prefix + '-next', '›', 64, 54);
    g.graph[prev.node]._name = 'Previous';
    g.graph[next.node]._name = 'Next';
    const folio = pageInk(g, footer, 'PageNumber', '', 0, 0, 102, 45, 24, 'f3dab2', {align:1,outline:true});
    return { previous:prev.action, next:next.action, folio:N.ref(folio) };
}

function focusRoom(g, initial) {
    g.component(g.root, N.script('ButtonFocusGroup'), {backAction:'camp-back', initialButton:N.ref(initial)});
}

function displayLedges(g, content) {
    const ledges = g.node('Ledges', content, 0, 0, 1, 1);
    for (let row = 0; row < 3; row++)
        paintedProp(g, ledges, 'Shelf' + row, 'camp-shelf-lip', 720, 450, 700, 15, 'ddbc9a');
}

function engraving(g, parent, name, points, fill, stroke, width, closed = false) {
    const node = g.node(name, parent, 0, 0, 2, 2);
    g.component(node, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    return g.component(node, N.script('ShapeGraphic'), {shape:closed ? 2 : 3,
        points:points.map(([x,y]) => ({__type__:'cc.Vec2', x, y})),
        fill:N.color(fill), outline:N.color(stroke), outlineWidth:width});
}

function octagon(radius) {
    return Array.from({length:8}, (_, i) => {
        const angle = (i + .5) * Math.PI / 4;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
}

function skillSeal(g, chart, id, x, y, glyph) {
    const item = roomButton(g, chart, 'camp-select-' + id, '', 134, 98);
    position(g, item.node, chart, x, y);
    g.graph[item.action.__id__].payload = id;
    item.presentation.transparentSurface = true;
    const surface = item.presentation.surface.__id__;
    const seal = g.node('Seal', surface, 0, 15, 65, 65);
    engraving(g, seal, 'Socket', octagon(31), '33252a', 'd6ac73', 2.7, true);
    engraving(g, seal, 'Die', octagon(25), '49352d', '9f7544', 1, true);
    glyph.forEach((line, i) => engraving(g, seal, 'Cut' + i, line, '38282c', 'ffe0a0', 2.4));
    const selected = g.node('Selected', surface, 0, 15, 75, 75);
    engraving(g, selected, 'Bezel', [...octagon(37), octagon(37)[0]], '302126', 'ffe3a7', 3);
    const learned = g.node('Learned', surface, 23, 39, 26, 26);
    engraving(g, learned, 'Wax', octagon(11), 'dcb270', '483125', 1.3, true);
    engraving(g, learned, 'Incision', [[-6,0],[-2,-4],[6,5]], '392829', '493124', 2);
    const inscriptionWidth = id === 'footing' ? 120 : 78;
    shape(g, surface, 'Inscription', 0, -26, inscriptionWidth, 31, '302327', 230);
    const caption = g.graph[item.presentation.caption.__id__], title = caption.node.__id__;
    position(g, title, surface, 0, -26);
    Object.assign(caption, {_fontSize:23, _lineHeight:27});
    component(g, title, 'cc.UITransform')._contentSize = {__type__:'cc.Size', width:inscriptionWidth, height:29};
    return item;
}

function skillTree() {
    const {g, content} = campPage('camp-skills', 'skill-workbench.jpg');
    const {back} = roomChrome(g, content, '技能树', false);
    const chart = g.node('LabyrinthChart', content, -196, -18, 810, 540);
    paintedProp(g, chart, 'EngravedPlan', 'skill-labyrinth.jpg', 720, 450, 810, 540, 'f3ddc3');
    const paths = [
        ['footing', [[0,-249],[0,-180]]],
        ['guard', [[0,-157],[0,-86],[-48,-86],[-83,-58],[-83,-24],[-121,-24],[-140,-8],[-140,21],[-183,47]]],
        ['initiative', [[0,-157],[0,-52],[48,-52],[80,-26],[80,3],[126,3],[152,27],[152,57],[184,75]]],
    ];
    const routes = paths.map(([id, points]) => {
        engraving(g, chart, id+'-recess', points, '352329', '392821', 8);
        return N.ref(engraving(g, chart, id, points, '352329', 'd7ad77', 3.6));
    });
    const nodes = [
        skillSeal(g, chart, 'footing', 0, -160, [
            [[-15,-10],[-4,-10],[2,-4],[3,5],[10,9]], [[-13,-5],[-5,-5],[-2,0],[-1,8],[5,12]], [[5,-11],[13,-11]]]),
        skillSeal(g, chart, 'guard', -183, 48, [
            [[0,-14],[-10,-5],[-12,9],[0,13],[12,9],[10,-5],[0,-14]], [[0,-8],[0,7]]]),
        skillSeal(g, chart, 'initiative', 184, 76, [
            [[-15,0],[-8,6],[0,9],[8,6],[15,0],[8,-6],[0,-9],[-8,-6],[-15,0]], [[0,4],[4,0],[0,-4],[-4,0],[0,4]]]),
    ];
    const note = g.node('Detail', content, 485, 0, 260, 210);
    g.component(note, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(note, N.script('PaperPanel'), {fill:N.color('322524',241), line:N.color('ad8752',196),
        innerLine:N.color('e4ba85',88), lineWidth:1.2, corner:7});
    const fee = pageInk(g, note, 'Fee', '', 0, 75, 224, 33, 23, 'ecc383');
    const effect = pageInk(g, note, 'DetailEffect', '', 0, 8, 224, 86, 24, 'f4e4c8', {wrap:true, lineHeight:31});
    const learn = roomButton(g, note, 'camp-learn', '学习', 168, 50, 'primary');
    g.graph[note]._active = false;
    g.component(content, N.script('CampSkillTree'), {nodes:nodes.map(n=>n.action), routes, chart:N.ref(chart),
        note:N.ref(note), fee:N.ref(fee), effect:N.ref(effect), learn:learn.action});
    focusRoom(g, back.node);
    saveCampPrefab(g);
}

function warehouse() {
    const {g, content} = campPage('camp-warehouse', 'camp-storehouse.jpg');
    const {footer, back} = roomChrome(g, content, '物资仓库');
    displayLedges(g, content);
    const shelf = g.node('SupplyCards', content, 0, 0, 1, 1);
    const ticket = g.node('ShelfTag', content, 0, 0, 180, 31);
    g.component(ticket, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
    g.component(ticket, N.script('PaperPanel'), {fill:N.color('35262a',238), line:N.color('a17a50',160),
        innerLine:N.color('dbb88a',55), lineWidth:1, corner:4});
    g.graph[ticket]._active = false;
    const empty = g.node('EmptyShelf', content, 0, -20, 550, 260);
    paintedProp(g, empty, 'Satchel', 'supply-satchel', 720, 395, 142, 122, 'ebd1ad');
    shape(g, empty, 'InventoryTag', 0, -40, 300, 54, '2b2126', 210);
    pageInk(g, empty, 'EmptyTitle', '尚未存入物资卡', 0, -40, 285, 48, 30, 'f6dfb5', {align:1});
    const detail = roomDetail(g, content, 'supply-satchel', 'camp-stock-sell');
    const pager = roomPager(g, footer, 'camp-stock');
    g.component(content, N.script('CampWarehouse'), {
        cardPrefab:N.asset(N.uuid('assets/prefabs/cards/SelectableCard.prefab'),'cc.Prefab'),
        shelf:N.ref(shelf), ticketTemplate:N.ref(ticket), empty:N.ref(empty), sell:detail.primary, nameLabel:detail.name,
        description:detail.effect, value:detail.meta, ...pager});
    focusRoom(g, back.node);
    saveCampPrefab(g);
}

function taskJournal() {
    const {g, room, content} = campPage('camp-journal', 'skill-workbench.jpg');
    shape(g, room, 'LowLamplight', 0, 0, 1440, 900, '251c23', 107);
    const spread = g.node('BookSpread', content, 0, -8, 1120, 654);
    paintedProp(g, spread, 'BoundLeft', 'journal-left', 440, 450, 560, 654, 'ffffff');
    paintedProp(g, spread, 'BoundRight', 'journal-right', 1000, 450, 560, 654, 'ffffff');
    const hinge = g.node('PageTurn', spread, 0, 0);
    const leaf = paintedProp(g, hinge, 'Leaf', 'journal-leaf', 1000, 450, 560, 654, 'ffffff');
    const leafSprite = g.graph[leaf]._components.find(r => g.graph[r.__id__].__type__ === 'cc.Sprite');
    const text = g.node('Writing', spread);
    const opacity = g.component(text, 'cc.UIOpacity', {_opacity:255});
    pageInk(g, text, 'Day', '', -285, 178, 345, 50, 26, '775541', {align:1, key:'camp-journal/day'});
    pageInk(g, text, 'BookTitle', '篝火日志', -280, 86, 425, 96, 68, '50382d', {align:1});
    shape(g, text, 'TitleRule', -283, 13, 170, 2, 'aa8254', 180);
    pageInk(g, text, 'Heading', '当前任务', 281, 164, 350, 76, 43, '50382d');
    shape(g, text, 'WritingRule', 285, 112, 354, 2, '94744e', 180);
    pageInk(g, text, 'EmptyTasks', '暂无进行中的任务。', 292, 43, 369, 75, 30, '69503d');
    g.component(content, N.script('CampTaskJournal'), {spread:N.ref(spread), hinge:N.ref(hinge), turningLeaf:leafSprite, writing:N.ref(opacity)});
    button(g, content, 'camp-audio', '声音开启', -554, 324, 64, 55, 'quiet');
    pageBack(g, content);
    saveCampPrefab(g);
}

function relicShop() {
    const {g, content} = campPage('camp-keeper', 'keeper-stall.jpg');
    const {footer} = roomChrome(g, content, '守门人商店');
    const trays = g.node('DisplayTrays', content, 0, 0, 1, 1);
    for (let row = 0; row < 3; row++) {
        const tray = g.node('VelvetTray' + row, trays, 0, 0, 700, 180);
        g.component(tray, 'cc.Graphics', N.cleanComponent(N.graphicTemplate));
        g.component(tray, N.script('PaperPanel'), {fill:N.color('422c29'), line:N.color('b78c58',210),
            innerLine:N.color('d9ac74',125), lineWidth:1.5, corner:5});
        paintedProp(g, tray, 'Velvet', 'relic-display-velvet.jpg', 720, 450, 690, 168, 'c4a9a5');
    }
    displayLedges(g, content);
    const shelf = g.node('RelicDisplay', content, 0, 0, 1, 1);
    const lot = roomButton(g, shelf, 'Exhibit', '', 194, 184);
    lot.presentation.transparentSurface = true;
    const surface = lot.presentation.surface.__id__;
    const shadow = g.shape('ContactShadow', 0, 0, 108, 13, '1f171b', 104, true);
    position(g, shadow, surface, 0, -28);
    const object = paintedProp(g, surface, 'Object', 'supply-satchel', 720, 427, 117, 117, 'fff5df');
    lot.presentation.paintedIcon = g.graph[object]._components.find(r=>g.graph[r.__id__].__type__==='cc.Sprite');
    shape(g, surface, 'InventoryTag', 0, -59, 176, 62, '342429', 224);
    shape(g, surface, 'EtchedEdge', 0, -28, 169, 1, 'ba955f', 200);
    const ink = g.graph[lot.presentation.caption.__id__], heading = ink.node.__id__;
    position(g, heading, surface, 0, -45);
    component(g, heading, 'cc.UITransform')._contentSize = {__type__:'cc.Size', width:171, height:33};
    Object.assign(ink, {_fontSize:25, _lineHeight:30});
    pageInk(g, surface, 'Price', '', 0, -74, 166, 27, 19, 'f1cd94', {align:1});
    const mark = g.node('SelectionMark', surface, 0, -86, 120, 9);
    shape(g, mark, 'Rule', 0, 0, 100, 2, 'f4c478');
    engraving(g, mark, 'Diamond', [[-5,0],[0,4],[5,0],[0,-4]], 'ffe3a3', 'ffe3a3', 0, true);
    const detail = roomDetail(g, content, 'supply-satchel', 'camp-buy-relic');
    roomButton(g, footer, 'camp-talk', '交谈', 138, 54);
    const pager = roomPager(g, footer, 'camp-relic');
    const fallback = Object.values(N.read('assets/ashen-labyrinth/interface/supply-satchel.png.meta').subMetas).find(m=>m.importer==='sprite-frame');
    g.component(content, N.script('CampRelicShop'), {exhibit:lot.action,
        artwork:N.asset(N.uuid('assets/ashen-labyrinth/interface/relic-objects.plist'),'cc.SpriteAtlas'),
        fallbackArt:N.asset(fallback.uuid,'cc.SpriteFrame'), nameLabel:detail.name, effect:detail.effect, exchange:detail.primary, ...pager});
    focusRoom(g, lot.node);
    saveCampPrefab(g);
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
    label(g, panel, 'StationTitle', '守门人', -151, 56, 726, 55, 34, 'f3e6d5', {bold:true});
    const body = label(g, panel, 'StationBody', '', -151, -36, 726, 112, 21, 'dacbd5', {wrap:true, lineHeight:31});
    shape(g, panel, 'ActionDivider', 277, 0, 1, 153, '766271', 155);
    const primary = button(g, panel, 'camp-talk-next', '', 408, 33, 208, 47, 'primary');
    const close = button(g, panel, 'modal-close', '回到柜台', 408, -34, 208, 42, 'quiet');
    g.component(panel, N.script('CampStationPanel'), {body:N.ref(body.label), primary:primary.action});
    g.component(g.root, N.script('ModalPanel'), { backdrop: N.ref(backdrop), closeAction: 'modal-close', closeOnBackdrop: true, closeOnEscape: true });
    g.component(g.root, N.script('ButtonFocusGroup'), {modal:true, buttons:[primary.node, close.node].map(N.ref), initialButton:N.ref(close.node)});
    saveCampPrefab(g);
}

function bindMainScene() {
    const g = new N.Graph(sceneFile, 'TheEnd');
    const director = g.graph.find(o => o.__type__ === N.script('GameDirector'));
    const prefabInfo = g.graph.find(o => Array.isArray(o.nestedPrefabInstanceRoots));
    let added = false;
    for (const [file, name, parent, roots] of [
        [screenFile, 'GateCampScreen', director.screensRoot, director.screenRoots],
        ...Object.values(campPages).map(name => [pageFile(name), name, director.screensRoot, director.screenRoots]),
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

const authors = {camp:campScreen, 'camp-station':stationPopup, 'camp-skills':skillTree,
    'camp-warehouse':warehouse, 'camp-journal':taskJournal, 'camp-keeper':relicShop};
const requested = process.argv.slice(2);
for (const key of requested.length ? requested : Object.keys(authors)) {
    if (!authors[key]) throw Error('Unknown camp screen: ' + key);
    authors[key]();
}
for (const f of [screenFile, popupFile, ...Object.values(campPages).map(pageFile)]) N.ensureMeta(f, 'prefab');
bindMainScene();
