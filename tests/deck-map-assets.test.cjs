const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read, script } = require('../tools/native-assets.cjs');

test('reward selection has one controller and stable holders for all candidate prefabs', () => {
    const graph = read('assets/prefabs/screens/RewardScreen.prefab'),
        root = graph[graph[0].data.__id__];
    const controllers = root._components
        .map((ref) => graph[ref.__id__])
        .filter((c) => c.__type__ === script('RewardSelection'));
    assert.equal(controllers.length, 1);
    assert.equal(controllers[0].cardHolders.length, 3);
    for (const ref of controllers[0].cardHolders) {
        const holder = graph[ref.__id__];
        assert.ok(holder._components.length > 0);
        assert.equal(holder._children.length, 1);
        const nested = graph[holder._children[0].__id__];
        assert.ok(graph[nested._prefab.__id__].instance);
    }
});
test('native collection card is readable at full size and has no battle drag handler', () => {
    const graph = read('assets/prefabs/cards/SelectableCard.prefab');
    assert.equal(graph.filter((c) => c.__type__ === script('CardPresentation')).length, 1);
    assert.equal(graph.filter((c) => c.__type__ === script('SelectableCard')).length, 1);
    assert.ok(!graph.some((c) => c.__type__ === script('CardInteraction')));
    const card = graph.find((c) => c.__type__ === script('CardPresentation'));
    assert.ok(graph[card.effectLabel.__id__]._fontSize >= 16);
    assert.ok(graph[card.titleLabel.__id__]._fontSize >= 20);
});
test('all serialized nested roots in the changed panels are registered for native expansion', () => {
    for (const file of [
        'assets/prefabs/ui/InventoryPopup.prefab',
        'assets/prefabs/screens/RewardScreen.prefab',
        'assets/prefabs/screens/MapScreen.prefab',
    ]) {
        const graph = read(file),
            root = graph[graph[0].data.__id__],
            info = graph[root._prefab.__id__];
        const registered = new Set((info.nestedPrefabInstanceRoots ?? []).map((ref) => ref.__id__));
        const visit = (id) => {
            const node = graph[id],
                prefab = node._prefab ? graph[node._prefab.__id__] : null;
            if (prefab?.instance)
                assert.ok(registered.has(id), file + ': nested prefab was left as an empty node');
            for (const child of node._children ?? []) visit(child.__id__);
        };
        visit(graph[0].data.__id__);
    }
});
