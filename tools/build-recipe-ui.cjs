const { Graph, read, ref, ensureMeta, script } = require('./native-assets.cjs');
const { button, move } = require('./ui-authoring.cjs');

const popupFile = 'assets/prefabs/ui/RecipePopup.prefab';
const hudFile = 'assets/prefabs/ui/HUD.prefab';
const restFile = 'assets/prefabs/screens/RestScreen.prefab';
const actionType = script('ButtonAction');

function component(graph, node, type) {
    return graph.graph[node]._components.map((item) => item.__id__)
        .find((index) => graph.graph[index].__type__ === type);
}

function control(graph, id, caption, x, y, width, height, variant, payload = '') {
    const node = button(graph, id, caption, x, y, width, height, variant);
    const action = component(graph, node, actionType);
    graph.graph[action].payload = payload;
    return { node, action };
}

function label(graph, name, value, x, y, width, height, fontSize, align = 0, bold = false) {
    const result = graph.label(name, value, x, y, width, height, fontSize, '45483a');
    Object.assign(graph.graph[result.label], { _horizontalAlign: align, _isBold: bold, _enableOutline: false });
    return result;
}

function viewport(graph, name, x, y, width, height) {
    const view = graph.node(name, graph.root, x, y, width, height);
    graph.component(view, 'cc.Mask', { _type: 0, _inverted: false, _segments: 4 });
    const content = graph.node(`${name}Content`, view, 0, height / 2, width, height);
    graph.graph[component(graph, content, 'cc.UITransform')]._anchorPoint = { __type__: 'cc.Vec2', x: 0.5, y: 1 };
    return graph.component(view, 'cc.ScrollView', {
        _content: ref(content), horizontal: false, vertical: true, elastic: false,
        inertia: true, brake: 0.7, bounceDuration: 0, cancelInnerEvents: true,
        scrollEvents: [], _horizontalScrollBar: null, _verticalScrollBar: null,
    });
}

function template(graph, name, width) {
    const row = control(graph, name, '', 0, 0, width, 67, 'secondary');
    graph.graph[row.node]._active = false;
    const label = graph.graph[graph.graph[row.action].caption.__id__];
    Object.assign(label, { _fontSize: 16, _lineHeight: 17 });
    return row.node;
}

function prefabWithName(file, name) {
    const graph = new Graph(file, name);
    graph.graph = read(file);
    graph.root = graph.graph[0].data.__id__;
    return graph;
}

ensureMeta(popupFile, 'prefab');
const graph = new Graph(popupFile, 'RecipePopup');
graph.root = graph.node('RecipePopup', null, 0, 0, 1440, 900);
const backdrop = graph.shape('RecipeBackdrop', 0, 0, 1440, 900, '1d281f', 232);
graph.component(backdrop, 'cc.BlockInputEvents');
graph.shape('RecipeFrameEdge', 0, 0, 1332, 766, '768067');
graph.shape('RecipePaper', 0, 0, 1324, 758, 'eee6d4');
graph.shape('RecipeListGround', -459, -30, 358, 535, 'e1dbc9');
graph.shape('RecipeDetailGround', -68, -36, 407, 508, 'e5dfce');
graph.shape('RecipeRelationsGround', 383, -36, 474, 508, 'e5dfce');
label(graph, 'RecipeTitle', '配方表', -460, 320, 347, 54, 38, 0, true);
const status = label(graph, 'RecipePermissions', '', -111, 268, 1050, 40, 22);
const close = control(graph, 'modal-close', '×', 606, 326, 56, 46, 'secondary');
const filters = [['all', '全部'], ['ready', '材料齐全'], ['partial', '缺部分']].map(([filter, name], index) =>
    control(graph, 'recipe-filter', name, -575 + index * 116, 204, 110, 43, 'secondary', filter));
const category = control(graph, 'recipe-category', '所有分类', -547, 151, 168, 41, 'quiet');
const sort = control(graph, 'recipe-sort', '按配方顺序', -371, 151, 168, 41, 'quiet');
const choices = Array.from({ length: 5 }, (_, index) => {
    const row = control(graph, 'recipe-pick', '', -459, 92 - index * 70, 330, 60, 'secondary');
    const label = graph.graph[graph.graph[row.action].caption.__id__];
    Object.assign(label, { _fontSize: 16, _lineHeight: 16 });
    return row;
});
const empty = label(graph, 'RecipeEmpty', '', -459, -35, 312, 80, 22, 1);
const prev = control(graph, 'recipe-prev', '上一页', -565, -279, 107, 44, 'quiet');
const page = label(graph, 'RecipePage', '', -459, -279, 89, 38, 18, 1);
const next = control(graph, 'recipe-next', '下一页', -353, -279, 107, 44, 'quiet');
label(graph, 'RecipeDetailTitle', '当前配方', -68, 211, 400, 34, 21, 1, true);
const relationTitle = label(graph, 'RecipeRelationTitle', '合成关系', 383, 211, 462, 34, 21, 1, true);
const detail = viewport(graph, 'RecipeDetail', -68, -49, 402, 459);
const tree = viewport(graph, 'RecipeRelations', 383, -49, 467, 459);
const detailTemplate = template(graph, 'RecipeDetailRow', 374);
const treeTemplate = template(graph, 'RecipeRelationRow', 439);
const craft = control(graph, 'recipe-craft', '合成', 293, -329, 238, 55, 'primary');
const undo = control(graph, 'recipe-undo', '撤销上一步', 523, -329, 192, 55, 'secondary');
graph.component(graph.root, script('RecipePanel'), {
    status: ref(status.label), page: ref(page.label), relationTitle: ref(relationTitle.label), empty: ref(empty.label),
    craft: ref(craft.action), undo: ref(undo.action), prev: ref(prev.action), next: ref(next.action),
    category: ref(category.action), sort: ref(sort.action), filters: filters.map(({ action }) => ref(action)),
    choices: choices.map(({ action }) => ref(action)), detail: ref(detail), tree: ref(tree),
    detailTemplate: ref(detailTemplate), treeTemplate: ref(treeTemplate),
});
graph.component(graph.root, script('ModalPanel'), {
    backdrop: ref(backdrop), closeAction: 'modal-close', closeOnBackdrop: false, closeOnEscape: true,
});
graph.component(graph.root, script('ButtonFocusGroup'), { buttons: [], modal: true, initialButton: ref(close.node) });
graph.save();

const hud = prefabWithName(hudFile, 'HUD');
const statusBar = hud.graph.find((object) => object.__type__ === script('StatusBar'));
if (!statusBar.recipeButton) {
    const entry = control(hud, 'recipe-open', '配方表', 650, 0, 94, 40, 'secondary');
    hud.graph[entry.node]._active = false;
    statusBar.recipeButton = ref(entry.node);
    hud.save();
}

const rest = prefabWithName(restFile, 'RestScreen');
if (!rest.graph.some((object) => object.__type__ === actionType && object.actionId === 'rest-synthesis')) {
    const entry = control(rest, 'rest-synthesis', '打开合成', 100, 20, 330, 54, 'primary');
    rest.graph[entry.node]._active = false;
    rest.save();
}

const scene = new Graph('assets/TheEnd.scene', 'TheEnd');
const director = scene.graph.find((object) => object.__type__ === script('GameDirector'));
const gameViewType = script('GameView');
const hasRecipeView = director.popupRoots.some(({ __id__ }) =>
    scene.graph[__id__]._components?.some((reference) =>
        scene.graph[reference.__id__].__type__ === gameViewType &&
        scene.graph[reference.__id__].key === 'recipes'
    )
);
if (!hasRecipeView) {
    const host = scene.node('RecipePopupHost', director.popupRoot.__id__, 0, 0, 1440, 900);
    scene.graph[host]._active = false;
    scene.component(host, gameViewType, { key: 'recipes' });
    scene.root = host;
    const linked = scene.linked(popupFile, 'RecipePopup', 0, 0);
    const sceneRoot = scene.graph[scene.graph[0].scene.__id__];
    scene.graph[sceneRoot._prefab.__id__].nestedPrefabInstanceRoots.push(ref(linked));
    director.popupRoots.push(ref(host));
    scene.save();
}
