// Add a data binding to the existing editable hint; its authored layout stays intact.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'assets/prefabs/screens/MapScreen.prefab');
const graph = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!graph.some(component => component.key === 'map/fixedReward')) {
    const label = graph.find(component => component.__type__ === 'cc.Label' && component._string.includes('支付 2 物资'));
    if (!label) throw new Error('The authored fixed-scavenge hint was not found.');
    const prototype = graph.find(component => component.key === 'map/text1');
    const binding = { ...prototype, node: { ...label.node }, __prefab: { __id__: graph.length + 1 }, key: 'map/fixedReward', _id: '' };
    graph[label.node.__id__]._components.push({ __id__: graph.length });
    graph.push(binding, { __type__: 'cc.CompPrefabInfo', fileId: randomUUID() });
    fs.writeFileSync(file, JSON.stringify(graph, null, 2) + '\n');
}
