// Author native COCOS resources for motion review; never rewrites the main game scene.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const engine = path.join(process.env.APPDATA, 'cocos-default/cocos-4.0.0-beta.1');
const { compressUUID } = require(path.join(engine, 'dist/core/base/utils/uuid.js'));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const ref = index => ({ __id__: index });
const vec = (x = 0, y = 0, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
const color = (hex, a = 255) => ({ __type__: 'cc.Color', r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a });
const asset = (uuid, type) => ({ __uuid__: uuid, __expectedType__: type });
function identifier(seed) {
    const hex = crypto.createHash('md5').update(seed).digest('hex');
    return compressUUID(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, false);
}
function ensureMeta(file, importer) {
    const meta = path.join(root, file + '.meta');
    if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ ver: importer === 'scene' ? '1.1.50' : importer === 'animation-clip' ? '2.0.3' : '1.1.50', importer, imported: false, uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {} }, null, 2) + '\n');
    return JSON.parse(fs.readFileSync(meta, 'utf8')).uuid;
}
const uuid = file => read(file + '.meta').uuid;
const script = name => compressUUID(uuid(require('./runtime-scripts.cjs').scriptFile(name)), false);
function traverse(value, callback) {
    if (!value || typeof value !== 'object') return;
    if ('__id__' in value) { callback(value); return; }
    for (const child of Object.values(value)) traverse(child, callback);
}
function prune(graph) {
    const order = [], visited = new Set();
    const visit = id => { if (visited.has(id)) return; if (!graph[id]) throw Error('Missing graph object ' + id); visited.add(id); order.push(id); traverse(graph[id], child => visit(child.__id__)); };
    visit(0);
    const positions = new Map(order.map((id, index) => [id, index]));
    return order.map(id => { const object = copy(graph[id]); traverse(object, child => { child.__id__ = positions.get(child.__id__); }); return object; });
}
function write(file, graph) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(prune(graph), null, 2) + '\n');
}
const actorTemplate = read('assets/prefabs/actors/PlayerActor.prefab');
const labelTemplate = read('assets/prefabs/effects/FloatingText.prefab').find(o => o.__type__ === 'cc.Label');
const spriteTemplate = actorTemplate.find(o => o.__type__ === 'cc.Sprite' || o.__type__ === script('StableActorSprite'));
const buttonTemplate = read('assets/prefabs/ui/HUD.prefab').find(o => o.__type__ === 'cc.Button');
const graphicTemplate = read('assets/prefabs/ui/HUD.prefab').find(o => o.__type__ === 'cc.Graphics' && o._enabled);
const cleanComponent = template => { const result = copy(template); delete result.__type__; delete result.node; delete result.__prefab; delete result._id; return result; };

class Graph {
    constructor(file, name) {
        this.file = file; this.prefab = file.endsWith('.prefab'); this.links = [];
        this.graph = this.prefab ? [{ __type__: 'cc.Prefab', _name: name, _objFlags: 0, __editorExtras__: {}, _native: '', data: ref(1), optimizationPolicy: 0, persistent: false }] : read('assets/TheEnd.scene');
        this.root = this.prefab ? 1 : this.graph.findIndex(o => o.__type__ === 'cc.Node' && o._name === 'Canvas');
    }
    add(value) { this.graph.push(value); return this.graph.length - 1; }
    component(node, type, fields = {}) {
        const index = this.add({ __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: ref(node), _enabled: true, __prefab: null, ...fields, _id: identifier(this.file + ':' + node + ':' + type) });
        if (this.prefab) this.graph[index].__prefab = ref(this.add({ __type__: 'cc.CompPrefabInfo', fileId: identifier(this.file + ':component:' + index) }));
        this.graph[node]._components.push(ref(index));
        return index;
    }
    node(name, parent = this.root, x = 0, y = 0, width = 1440, height = 900) {
        const index = this.add({ __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {}, _parent: parent === null ? null : ref(parent), _children: [], _active: true, _components: [], _prefab: null, _lpos: vec(x, y), _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: vec(1, 1, 1), _mobility: 0, _layer: 33554432, _euler: vec(), _id: identifier(this.file + ':node:' + name + ':' + this.graph.length) });
        if (parent !== null) this.graph[parent]._children.push(ref(index));
        this.component(index, 'cc.UITransform', { _contentSize: { __type__: 'cc.Size', width, height }, _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 } });
        if (this.prefab) this.graph[index]._prefab = ref(this.add({ __type__: 'cc.PrefabInfo', root: ref(this.root), asset: ref(0), fileId: identifier(this.file + ':prefab-node:' + name) }));
        return index;
    }
    label(name, text, x, y, width, height, fontSize = 20, tint = '4d4537') {
        const node = this.node(name, this.root, x, y, width, height);
        const label = this.component(node, 'cc.Label', { ...cleanComponent(labelTemplate), _string: text, _fontSize: fontSize, _lineHeight: fontSize + 7, _horizontalAlign: 1, _verticalAlign: 1, _color: color(tint), _overflow: 2, _fontFamily: 'Microsoft YaHei' });
        return { node, label };
    }
    shape(name, x, y, width, height, tint, alpha = 255, ellipse = false) {
        const node = this.node(name, this.root, x, y, width, height);
        this.component(node, 'cc.Graphics', cleanComponent(graphicTemplate));
        this.component(node, script('PixelGraphic'), { shape: ellipse ? 1 : 0, fill: color(tint, alpha), outline: color(tint), outlineWidth: 0, points: [], tiles: [], palette: [], tileColors: [] });
        return node;
    }
    button(name, text, x, y, method, componentName = 'ActorMotionReview') {
        const node = this.shape(name, x, y, 160, 48, 'd9c09a');
        const caption = this.label(name + 'Caption', text, x, y, 152, 42, 18);
        this.graph[this.root]._children = this.graph[this.root]._children.filter(child => child.__id__ !== caption.node);
        this.graph[caption.node]._parent = ref(node); this.graph[caption.node]._lpos = vec(); this.graph[node]._children.push(ref(caption.node));
        const handler = this.add({ __type__: 'cc.ClickEvent', target: ref(this.root), component: componentName, _componentId: script(componentName), handler: method, customEventData: '' });
        this.component(node, 'cc.Button', { ...cleanComponent(buttonTemplate), _interactable: true, _target: ref(node), clickEvents: [ref(handler)] });
        return { node, caption: caption.label };
    }
    linked(file, name, x, y) {
        const data = read(file), rootNode = data[data[0].data.__id__], fileId = data[rootNode._prefab.__id__].fileId;
        const node = this.add({ __type__: 'cc.Node', _objFlags: 0, _parent: ref(this.root), _prefab: ref(this.graph.length + 1), __editorExtras__: {} });
        this.add({ __type__: 'cc.PrefabInfo', root: ref(node), asset: asset(uuid(file), 'cc.Prefab'), fileId, instance: ref(this.graph.length + 1) });
        const instance = this.add({ __type__: 'cc.PrefabInstance', fileId: identifier(this.file + ':instance:' + name), mountedChildren: [], mountedComponents: [], propertyOverrides: [], removedComponents: [] });
        const target = this.add({ __type__: 'cc.TargetInfo', localID: [fileId] });
        for (const [key, value] of Object.entries({ _name: name, _lpos: vec(x, y), _active: true })) this.graph[instance].propertyOverrides.push(ref(this.add({ __type__: 'CCPropertyOverrideInfo', targetInfo: ref(target), propertyPath: [key], value })));
        this.graph[this.root]._children.push(ref(node)); this.links.push(ref(node));
        return node;
    }
    save() { write(this.file, this.graph); }
}


module.exports={root,read,copy,ref,vec,color,asset,identifier,ensureMeta,uuid,script,prune,write,Graph,cleanComponent,spriteTemplate,labelTemplate,buttonTemplate,graphicTemplate};
