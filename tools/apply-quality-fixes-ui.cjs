// Author current native UI resources explicitly; never part of a normal build.
const fs = require('node:fs'),
    path = require('node:path');
const N = require('./native-assets.cjs');
const { Graph, read, ref, vec, color, asset, uuid, script, root } = N;
const { button } = require('./ui-authoring.cjs');
function load(file) {
    const backup = path.join(root, 'temp/quality-fixes-before', file);
    if (!fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(path.join(root, file), backup);
    }
    const g = new Graph(file, path.basename(file));
    g.graph = read(file);
    g.root = g.graph[0].data.__id__;
    return g;
}
{
    const g = load('assets/prefabs/ui/HUD.prefab'),
        status = g.graph.find((c) => c.__type__ === script('StatusBar'));
    let action = g.graph.find(
        (c) => c.__type__ === script('ButtonAction') && c.actionId === 'rules-help'
    );
    if (!action) {
        const node = button(
            g,
            'RulesNotice',
            '旧规则探索 · 查看规则说明',
            -495,
            -66,
            390,
            32,
            'quiet'
        );
        action =
            g.graph[
                g.graph[node]._components.find(
                    (r) => g.graph[r.__id__].__type__ === script('ButtonAction')
                ).__id__
            ];
        action.actionId = 'rules-help';
        const presentation =
            g.graph[
                g.graph[node]._components.find(
                    (r) => g.graph[r.__id__].__type__ === script('ButtonPresentation')
                ).__id__
            ];
        presentation.theme = asset(
            uuid('assets/resources/ui/immersive-theme.json'),
            'cc.JsonAsset'
        );
        presentation.darkSurface = false;
        const label = g.graph[action.caption.__id__];
        Object.assign(label, { _fontSize: 16, _lineHeight: 21, _enableWrapText: false });
        for (const group of g.graph.filter(
            (c) => c.__type__ === script('ButtonFocusGroup') && c.buttons?.length
        ))
            group.buttons.push(ref(node));
    }
    status.rulesNotice = ref(g.graph.indexOf(action));
    const presentation =
        g.graph[
            g.graph[action.node.__id__]._components.find(
                (r) => g.graph[r.__id__].__type__ === script('ButtonPresentation')
            ).__id__
        ];
    presentation.darkSurface = false;
    Object.assign(g.graph[action.caption.__id__], {
        _enableOutline: true,
        _outlineColor: color('182219', 210),
        _outlineWidth: 1.25,
    });
    // Below the header hints, above the route paper's top edge.
    g.graph[action.node.__id__]._lpos = vec(-495, -44);
    g.graph[action.node.__id__]._active = false;
    g.save();
}
{
    const g = load('assets/prefabs/ui/InventoryPopup.prefab'),
        grid = g.graph.find((c) => c.__type__ === script('InventoryGrid'));
    let node = g.graph.findIndex(
        (n) => n.__type__ === 'cc.Node' && n._name === 'InventoryEmptyState'
    );
    let label;
    if (node < 0) {
        const created = g.label('InventoryEmptyState', '', 0, -8, 1000, 110, 23, 'ded9c9');
        node = created.node;
        label = created.label;
    } else
        label = g.graph[node]._components.find(
            (r) => g.graph[r.__id__].__type__ === 'cc.Label'
        ).__id__;
    Object.assign(g.graph[label], {
        _fontSize: 23,
        _lineHeight: 36,
        _enableWrapText: true,
        _enableOutline: false,
    });
    grid.emptyLabel = ref(label);
    g.graph[node]._active = false;
    g.save();
}
console.log('Connected persistent rules notice and inventory empty-state label.');
