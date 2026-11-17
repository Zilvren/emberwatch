// Explicit native-asset authoring. Each phase runs after the previous assets were imported by Pink.
const fs = require('node:fs'),
    path = require('node:path');
const N = require('./native-assets.cjs');
const {
    root,
    read,
    copy,
    ref,
    vec,
    color,
    asset,
    uuid,
    script,
    Graph,
    cleanComponent,
    graphicTemplate,
    buttonTemplate,
} = N;
const { button, move } = require('./ui-authoring.cjs');
const mode = process.argv[2],
    version = 'deck-map-03';
const cardFile = 'assets/prefabs/cards/SelectableCard.prefab';
const pointFile = 'assets/prefabs/ui/RoutePoint.prefab';
const mapFile = 'assets/prefabs/ui/RouteMapPanel.prefab';
const mapPopupFile = 'assets/prefabs/ui/RouteMapPopup.prefab';
const fieldTheme = asset(uuid('assets/resources/ui/field-card-theme.json'), 'cc.JsonAsset');
function comp(g, node, type) {
    return (g.graph[node]._components ?? [])
        .map((r) => g.graph[r.__id__])
        .find((c) => c.__type__ === type);
}
function size(g, node, w, h) {
    comp(g, node, 'cc.UITransform')._contentSize = { __type__: 'cc.Size', width: w, height: h };
}
function pos(g, node, x, y) {
    g.graph[node]._lpos = vec(x - 720, 450 - y);
}
function label(
    g,
    name,
    text,
    x,
    y,
    w,
    h,
    font = 18,
    tint = 'eee7d8',
    bold = false,
    parent = g.root
) {
    const value = g.label(name, text, x - 720, 450 - y, w, h, font, tint);
    if (parent !== g.root) move(g, value.node, parent);
    Object.assign(g.graph[value.label], {
        _enableOutline: false,
        _enableShadow: false,
        _isBold: bold,
        _enableWrapText: true,
        _overflow: 2,
        _lineHeight: font + 7,
    });
    return value;
}
function action(
    g,
    id,
    text,
    x,
    y,
    w = 180,
    h = 44,
    variant = 'secondary',
    dark = false,
    parent = g.root
) {
    const node = button(g, id, text, x - 720, 450 - y, w, h, variant);
    if (parent !== g.root) move(g, node, parent);
    const presenter = comp(g, node, script('ButtonPresentation'));
    presenter.theme = fieldTheme;
    presenter.darkSurface = dark;
    return { node, action: g.graph.indexOf(comp(g, node, script('ButtonAction'))) };
}
function background(g, name, fill, alpha = 255, parent = g.root) {
    const node = g.node(name, parent, 0, 0, 1440, 900);
    g.component(node, 'cc.Graphics', cleanComponent(graphicTemplate));
    g.component(node, script('ShapeGraphic'), {
        shape: 0,
        fill: color(fill, alpha),
        outline: color(fill, 0),
        outlineWidth: 0,
        points: [],
        tiles: [],
        palette: [],
        tileColors: [],
    });
    return node;
}
function rawButton(g, node, id) {
    const handler = g.add({
        __type__: 'cc.ClickEvent',
        target: ref(node),
        component: 'ButtonAction',
        _componentId: script('ButtonAction'),
        handler: 'activate',
        customEventData: '',
    });
    g.component(node, 'cc.Button', {
        ...cleanComponent(buttonTemplate),
        _interactable: true,
        _transition: 0,
        _target: ref(node),
        clickEvents: [ref(handler)],
    });
    return g.component(node, script('ButtonAction'), {
        actionId: id,
        payload: '',
        caption: null,
        disabledOpacity: 255,
    });
}
function backup(file) {
    const target = path.join(root, 'temp/deck-map-before', file);
    if (!fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
    }
}
function blank(file, name, preserve = false) {
    const old = preserve ? read(file) : null;
    if (old) backup(file);
    const g = new Graph(file, name),
        node = g.node(name, null, 0, 0, 1440, 900);
    g.root = node;
    g.graph[0].data = ref(node);
    if (old) {
        const previous = old[old[0].data.__id__];
        g.graph[node]._id = previous._id;
        g.graph[g.graph[node]._prefab.__id__].fileId = old[previous._prefab.__id__].fileId;
    }
    g.graph[node].__editorExtras__ = { deckMapLayout: version };
    return g;
}
function linked(g, file, name, x, y, scale = 1, parent = g.root) {
    const node = g.linked(file, name, x - 720, 450 - y);
    if (parent !== g.root) move(g, node, parent);
    const info = g.graph[g.graph[node]._prefab.__id__],
        instance = g.graph[info.instance.__id__],
        target = g.graph[instance.propertyOverrides[0].__id__].targetInfo;
    instance.propertyOverrides.push(
        ref(
            g.add({
                __type__: 'CCPropertyOverrideInfo',
                targetInfo: copy(target),
                propertyPath: ['_lscale'],
                value: vec(scale, scale, 1),
            })
        )
    );
    return node;
}
function cardHost(g, name, x, y, scale = 1, parent = g.root) {
    const host = g.node(name + 'Host', parent, x - 720, 450 - y, 236 * scale, 388 * scale);
    linked(g, cardFile, name, 720, 450, scale, host);
    return host;
}
function viewport(g, name, x, y, w, h, parent = g.root) {
    const view = g.node(name, parent, x - 720, 450 - y, w, h);
    g.component(view, 'cc.Mask', { _type: 0, _inverted: false, _segments: 4 });
    const content = g.node(name + 'Content', view, 0, h / 2, w, h);
    comp(g, content, 'cc.UITransform')._anchorPoint = { __type__: 'cc.Vec2', x: 0.5, y: 1 };
    const scroll = g.component(view, 'cc.ScrollView', {
        _content: ref(content),
        horizontal: false,
        vertical: true,
        elastic: false,
        inertia: true,
        brake: 0.7,
        bounceDuration: 0,
        cancelInnerEvents: true,
        scrollEvents: [],
        _horizontalScrollBar: null,
        _verticalScrollBar: null,
    });
    return { view, content, scroll };
}
function modal(g, backdrop, buttons) {
    g.component(backdrop, 'cc.BlockInputEvents');
    g.component(g.root, script('ModalPanel'), {
        backdrop: ref(backdrop),
        closeAction: 'modal-close',
        closeOnBackdrop: false,
        closeOnEscape: true,
    });
    g.component(g.root, script('ButtonFocusGroup'), {
        buttons: buttons.map(ref),
        modal: true,
        initialButton: ref(buttons[0]),
    });
}
function save(g) {
    const owner = g.prefab
        ? g.graph[g.root]
        : g.graph.find((object) => object.__type__ === 'cc.Scene');
    const nested = [],
        visited = new Set();
    const visit = (index) => {
        if (visited.has(index)) return;
        visited.add(index);
        const node = g.graph[index];
        const info = node._prefab ? g.graph[node._prefab.__id__] : null;
        if (info?.instance) nested.push(ref(index));
        for (const child of node._children ?? []) visit(child.__id__);
    };
    visit(g.graph.indexOf(owner));
    if (!owner._prefab) throw Error('Native root has no prefab metadata: ' + g.file);
    g.graph[owner._prefab.__id__].nestedPrefabInstanceRoots = nested;
    g.save();
}
function current(file) {
    return (
        fs.existsSync(path.join(root, file)) &&
        read(file)[read(file)[0].data.__id__].__editorExtras__?.deckMapLayout === version
    );
}

if (mode === '--templates') {
    if (!current(cardFile)) {
        const g = new Graph(cardFile, 'SelectableCard');
        const previous = fs.existsSync(path.join(root, cardFile)) ? read(cardFile) : null;
        g.graph = copy(read('assets/prefabs/cards/RewardCard.prefab'));
        g.root = g.graph[0].data.__id__;
        if (previous) {
            const old = previous[previous[0].data.__id__];
            g.graph[g.graph[g.root]._prefab.__id__].fileId = previous[old._prefab.__id__].fileId;
            g.graph[g.root]._id = old._id;
        }
        g.graph[0]._name = 'SelectableCard';
        g.graph[g.root]._name = 'SelectableCard';
        g.graph[g.root].__editorExtras__ = { deckMapLayout: version };
        g.graph[g.root]._components = g.graph[g.root]._components.filter(
            (r) => g.graph[r.__id__].__type__ !== script('CardInteraction')
        );
        size(g, g.root, 236, 388);
        const card = g.graph.findIndex((c) => c.__type__ === script('CardPresentation'));
        const badge = label(g, 'CollectionStatus', '', 720, 634, 236, 24, 15, 'ded8c6');
        const input = rawButton(g, g.root, 'inspect-card');
        g.component(g.root, script('SelectableCard'), {
            card: ref(card),
            action: ref(input),
            badge: ref(badge.label),
        });
        save(g);
    }
    if (!current(pointFile)) {
        const g = blank(pointFile, 'RoutePoint');
        size(g, g.root, 148, 170);
        g.component(g.root, 'cc.Graphics', cleanComponent(graphicTemplate));
        const title = label(g, 'PointTitle', '', 720, 510, 180, 26, 18, '434b3c', true),
            status = label(g, 'PointStatus', '', 720, 535, 180, 22, 14, '59614f');
        g.graph[title.node]._active = false;
        g.graph[status.node]._active = false;
        const input = rawButton(g, g.root, 'map-node');
        g.component(g.root, script('RoutePoint'), {
            action: ref(input),
            title: ref(title.label),
            status: ref(status.label),
        });
        save(g);
    }
    console.log('SelectableCard and RoutePoint templates ready; import them through Pink.');
    process.exit(0);
}

function makeMap(file, popup) {
    if (current(file)) return;
    const g = blank(file, popup ? 'RouteMapPopup' : 'RouteMapPanel');
    const shade = background(g, 'MapScrim', '1f261f', 175);
    const paper = g.node('RoutePaper', g.root, 0, -22, 1240, 740);
    g.component(paper, 'cc.Graphics', cleanComponent(graphicTemplate));
    g.component(paper, script('PaperPanel'), {
        fill: color('e2dac7', 250),
        line: color('737663'),
        innerLine: color('a1a88c', 90),
        lineWidth: 1.2,
        corner: 14,
    });
    const heading = label(g, 'RouteTitle', '探索路线', 720, 128, 800, 40, 28, '3e4237', true);
    const v = viewport(g, 'RouteViewport', 720, 471, 1100, 580);
    const paths = g.node('RoutePaths', v.content, 0, 0, 1100, 1540);
    comp(g, paths, 'cc.UITransform')._anchorPoint = { __type__: 'cc.Vec2', x: 0.5, y: 1 };
    const drawing = g.component(paths, 'cc.Graphics', cleanComponent(graphicTemplate));
    const hint = label(g, 'RouteHint', '仅显示当前层与下一层', 560, 785, 800, 28, 16, '59614f');
    label(
        g,
        'RouteLegend',
        '战斗　·　搜刮　·　营地　·　强敌　·　避难所',
        560,
        815,
        800,
        22,
        14,
        '59614f'
    );
    const close = action(g, 'modal-close', '×', 1280, 128, 54, 44, 'quiet');
    const enter = action(g, 'map-enter', '前往地点', 1150, 806, 245, 48, 'primary');
    g.component(g.root, script('RouteMap'), {
        pointPrefab: asset(uuid(pointFile), 'cc.Prefab'),
        content: ref(v.content),
        paths: ref(drawing),
        scroll: ref(v.scroll),
        title: ref(heading.label),
        hint: ref(hint.label),
        close: ref(close.action),
        enter: ref(enter.action),
    });
    if (popup) modal(g, shade, [close.node]);
    save(g);
}
if (mode === '--map-panels') {
    makeMap(mapFile, false);
    makeMap(mapPopupFile, true);
    console.log('Shared map panels ready; import them through Pink.');
    process.exit(0);
}
if (mode === '--entry-popup') {
    const file = 'assets/prefabs/ui/EntryTierPopup.prefab';
    if (!fs.existsSync(path.join(root, file))) {
        const g = blank(file, 'EntryTierPopup'),
            shade = background(g, 'EntryBackdrop', '20271f', 246);
        label(g, 'EntryTitle', '选择进入档位', 720, 218, 1050, 48, 32, 'eee7d8', true);
        const summary = label(g, 'EntrySummary', '', 720, 270, 1100, 30, 20, 'd0cdbf');
        const choices = ['emergency', 'low', 'standard', 'high'].map((id, i) =>
            action(g, 'entry-tier-' + id, id, 330 + i * 260, 406, 230, 130, 'secondary')
        );
        const detail = label(g, 'EntryDetail', '', 720, 535, 1100, 74, 20, 'ded9c9');
        const confirm = action(g, 'entry-confirm', '确认出发', 720, 638, 460, 54, 'primary'),
            close = action(g, 'modal-close', '返回', 720, 714, 200, 44, 'secondary');
        g.component(g.root, script('EntrySelection'), {
            choices: choices.map((c) => ref(c.action)),
            confirm: ref(confirm.action),
            summary: ref(summary.label),
            detail: ref(detail.label),
        });
        modal(g, shade, [...choices.map((c) => c.node), confirm.node, close.node]);
        save(g);
    }
    console.log('Entry tier popup prepared; import through Pink.');
    process.exit(0);
}
if (mode === '--connect-stamina') {
    const file = 'assets/TheEnd.scene',
        g = new Graph(file, 'TheEnd'),
        director = g.graph.find((c) => c.__type__ === script('GameDirector'));
    if (director.popups.length === 5) {
        const previousRoot = g.root,
            popupRoot = director.popupRoot.__id__,
            host = g.node('EntryTierPopupHost', popupRoot, 0, 0, 1440, 900);
        g.graph[host]._active = false;
        g.root = host;
        g.linked('assets/prefabs/ui/EntryTierPopup.prefab', 'EntryTierPopup', 0, 0);
        g.root = previousRoot;
        director.popups.push(ref(host));
        save(g);
    }
    const battle = load('assets/prefabs/screens/BattleScreen.prefab');
    if (!battle.graph.some((n) => n.__type__ === 'cc.Node' && n._name === 'StaminaGauge')) {
        const circle = battle.node('StaminaGauge', battle.root, 110 - 720, 450 - 665, 96, 96);
        battle.component(circle, 'cc.Graphics', cleanComponent(graphicTemplate));
        battle.component(circle, script('ShapeGraphic'), {
            shape: 1,
            fill: color('ded8c4'),
            outline: color('7c8468'),
            outlineWidth: 1.8,
            points: [],
            tiles: [],
            palette: [],
            tileColors: [],
        });
        label(battle, 'StaminaTitle', '体力', 720, 425, 82, 24, 15, '434b3c', true, circle);
        const value = label(
                battle,
                'StaminaValue',
                '3/3',
                720,
                452,
                86,
                32,
                26,
                '3e4237',
                true,
                circle
            ),
            hint = label(
                battle,
                'StaminaHint',
                '每回合 3',
                720,
                477,
                86,
                20,
                12,
                '59614f',
                false,
                circle
            );
        battle.component(value.node, script('UIValue'), {
            key: 'battle/stamina-value',
            format: '{value}',
            normalColor: color('3e4237'),
        });
        battle.component(hint.node, script('UIValue'), {
            key: 'battle/stamina-hint',
            format: '{value}',
            normalColor: color('59614f'),
        });
        save(battle);
    }
    console.log('Entry tiers and stamina gauge connected.');
    process.exit(0);
}
if (mode !== '--apply') throw Error('Use --templates, import, --map-panels, import, then --apply.');
for (const file of [cardFile, pointFile, mapFile, mapPopupFile]) uuid(file);

{
    const file = 'assets/prefabs/ui/InventoryPopup.prefab';
    if (!current(file)) {
        const g = blank(file, 'InventoryPopup', true),
            shade = background(g, 'InventoryScrim', '20271f', 242);
        label(g, 'InventoryTitle', '行囊 / 本次探索', 720, 106, 900, 44, 30, 'eee7d8', true);
        const summary = label(g, 'InventorySummary', '', 720, 143, 1100, 28, 18, 'd0cdbf');
        const filters = [
            ['all', '全部卡牌'],
            ['deck', '出战牌组'],
            ['overflow', '暂存'],
        ].map(([key, text], i) =>
            action(g, 'bag-filter-' + key, text, 300 + i * 176, 184, 164, 38, 'quiet', true)
        );
        const sort = action(g, 'bag-sort', '排序：获得顺序', 1110, 184, 220, 38, 'secondary');
        const close = action(g, 'modal-close', '×', 1320, 106, 54, 44, 'quiet', true);
        const v = viewport(g, 'CardGridViewport', 720, 490, 1240, 570);
        const hint = label(g, 'GridHint', '', 720, 802, 1100, 26, 16, 'd0cdbf');
        const edit = action(g, 'bag-mode', '整理出战牌', 1035, 852, 210, 44, 'primary');
        const supply = action(g, 'discard-supply', '丢弃 1 物资', 420, 852, 200, 44, 'secondary');
        action(g, 'modal-close', '返回游戏', 1260, 852, 180, 44, 'secondary');
        const reader = g.node('CardReader', g.root, 0, 0, 1440, 900);
        const readerShade = background(g, 'ReaderScrim', '151d17', 245, reader);
        g.component(readerShade, 'cc.BlockInputEvents');
        const readerCard = cardHost(g, 'InspectedCard', 500, 450, 1.3, reader);
        const readerTitle = label(
            g,
            'ReaderTitle',
            '',
            975,
            238,
            460,
            48,
            30,
            'eee7d8',
            true,
            reader
        );
        const readerBody = label(
            g,
            'ReaderBody',
            '',
            975,
            410,
            460,
            250,
            20,
            'ded9c9',
            false,
            reader
        );
        const toggle = action(
            g,
            'toggle-inspected',
            '加入出战牌组',
            975,
            602,
            320,
            48,
            'primary',
            false,
            reader
        );
        const discard = action(
            g,
            'discard-inspected',
            '永久丢弃',
            975,
            666,
            320,
            44,
            'danger',
            false,
            reader
        );
        const detail = action(
            g,
            'bag-details',
            '完整说明',
            500,
            720,
            220,
            44,
            'secondary',
            false,
            reader
        );
        const readerClose = action(
            g,
            'bag-reader-close',
            '返回行囊',
            975,
            744,
            320,
            44,
            'secondary',
            false,
            reader
        );
        g.component(reader, script('ModalPanel'), {
            backdrop: ref(readerShade),
            closeAction: 'bag-reader-close',
            closeOnBackdrop: false,
            closeOnEscape: true,
        });
        g.component(reader, script('ButtonFocusGroup'), {
            buttons: [readerClose.node, detail.node, toggle.node, discard.node].map(ref),
            modal: true,
            initialButton: ref(readerClose.node),
        });
        g.graph[reader]._active = false;
        g.component(g.root, script('InventoryGrid'), {
            cardPrefab: asset(uuid(cardFile), 'cc.Prefab'),
            content: ref(v.content),
            scroll: ref(v.scroll),
            reader: ref(reader),
            readerCardHost: ref(readerCard),
            summary: ref(summary.label),
            readerTitle: ref(readerTitle.label),
            readerBody: ref(readerBody.label),
            hint: ref(hint.label),
            toggle: ref(toggle.action),
            discard: ref(discard.action),
            modeButton: ref(edit.action),
            sortButton: ref(sort.action),
            detailsButton: ref(detail.action),
            filters: filters.map((value) => ref(value.action)),
        });
        modal(g, shade, [
            close.node,
            ...filters.map((value) => value.node),
            sort.node,
            edit.node,
            supply.node,
        ]);
        save(g);
    }
}
function load(file) {
    const g = new Graph(file, path.basename(file));
    g.graph = read(file);
    g.root = g.graph[0].data.__id__;
    return g;
}
{
    const file = 'assets/prefabs/screens/MapScreen.prefab';
    if (!current(file)) {
        backup(file);
        const g = load(file);
        g.graph[g.root]._children = g.graph[g.root]._children.filter((r) =>
            ['World', 'SceneEdgeShade'].includes(g.graph[r.__id__]._name)
        );
        linked(g, mapFile, 'ExpeditionMap', 720, 450);
        g.graph[g.root].__editorExtras__ = { deckMapLayout: version };
        save(g);
    }
}
{
    const file = 'assets/prefabs/screens/RewardScreen.prefab';
    if (!current(file)) {
        backup(file);
        const g = load(file);
        g.graph[g.root]._components = g.graph[g.root]._components.filter(
            (r) => g.graph[r.__id__].__type__ !== script('RewardSelection')
        );
        g.graph[g.root]._children = g.graph[g.root]._children.filter((r) =>
            ['World', 'SceneEdgeShade'].includes(g.graph[r.__id__]._name)
        );
        background(g, 'RewardScrim', '20271f', 210);
        const heading = label(
            g,
            'RewardHeading',
            '选择一张卡牌',
            720,
            150,
            1000,
            44,
            32,
            'eee7d8',
            true
        );
        const sub = label(g, 'RewardCapacity', '', 720, 196, 1000, 26, 18, 'd0cdbf');
        g.component(sub.node, script('UIValue'), {
            key: 'rewards/text0',
            format: '{value}',
            normalColor: color('d0cdbf'),
        });
        const nodes = [0, 1, 2].map((i) =>
            cardHost(g, 'RewardCandidate' + i, 350 + i * 370, 445, 1.18)
        );
        const hint = label(
            g,
            'RewardSelectionHint',
            '选择候选卡只作比较，确认后才领取',
            720,
            686,
            1100,
            28,
            17,
            'd0cdbf'
        );
        const confirm = action(g, 'reward-confirm', '先选择一张卡', 720, 739, 370, 50, 'primary');
        const supplies = action(g, 'claim-supplies', '领取物资', 350, 820, 250, 46, 'secondary');
        const bag = action(g, 'reward-bag', '查看行囊', 720, 820, 250, 46, 'secondary');
        const done = action(g, 'rewards-done', '继续探索', 1090, 820, 280, 46, 'secondary');
        const supplyLabel = label(g, 'RewardSupplyAmount', '', 350, 778, 280, 22, 16, 'd0cdbf');
        g.component(supplyLabel.node, script('UIValue'), {
            key: 'rewards/text2',
            format: '{value}',
            normalColor: color('d0cdbf'),
        });
        g.component(g.root, script('RewardSelection'), {
            cardHolders: nodes.map(ref),
            confirm: ref(confirm.action),
            hint: ref(hint.label),
        });
        g.graph[g.root].__editorExtras__ = { deckMapLayout: version };
        save(g);
    }
}
{
    const file = 'assets/prefabs/ui/HUD.prefab';
    const g = load(file);
    if (!g.graph.some((c) => c.__type__ === script('ButtonAction') && c.actionId === 'map')) {
        backup(file);
        action(g, 'map', '地图', 948, 450, 76, 38, 'quiet', true);
        save(g);
    } else {
        const control = g.graph.find(
            (c) => c.__type__ === script('ButtonAction') && c.actionId === 'map'
        );
        pos(g, control.node.__id__, 948, 450);
        save(g);
    }
}
{
    const file = 'assets/TheEnd.scene';
    const g = new Graph(file, 'TheEnd'),
        director = g.graph.find((c) => c.__type__ === script('GameDirector'));
    const oldMap = director.popups[4]?.__id__;
    if (oldMap === undefined || g.graph[oldMap]._name !== 'RouteMapPopupHost') {
        backup(file);
        const previousRoot = g.root,
            popupRoot = director.popupRoot.__id__;
        if (oldMap !== undefined)
            g.graph[popupRoot]._children = g.graph[popupRoot]._children.filter(
                (r) => r.__id__ !== oldMap
            );
        const host = g.node('RouteMapPopupHost', popupRoot, 0, 0, 1440, 900);
        g.graph[host]._active = false;
        g.root = host;
        g.linked(mapPopupFile, 'RouteMapPopup', 0, 0);
        g.root = previousRoot;
        director.popups[4] = ref(host);
    }
    save(g);
}
console.log(
    'Native inventory grid, card selection and route map are connected to the existing game.'
);
