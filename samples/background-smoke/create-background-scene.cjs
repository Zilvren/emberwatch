const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(project, '.pink/settings.json'), 'utf8'));
const engineRoot = path.join(process.env.APPDATA, 'cocos-default',
    `cocos-${settings['cocos.engine.version']}`);
const { compressUUID } = require(path.join(engineRoot, 'dist/core/base/utils/uuid.js'));
const template = path.join(engineRoot, 'packages/engine/editor/assets/default_file_content/scene/2d.scene');
const scene = JSON.parse(fs.readFileSync(template, 'utf8'));
const sceneUuid = '98d78611-47b2-4bbc-938a-f363f54caa4d';
scene[0]._name = 'BackgroundTest';
scene[1]._name = 'BackgroundTest';
scene[1]._id = sceneUuid;
scene[2]._lpos = { __type__: 'cc.Vec3', x: 640, y: 360, z: 0 };
scene[3]._lpos.z = 1000;
scene[4]._orthoHeight = 360;
scene[4]._color = { __type__: 'cc.Color', r: 191, g: 233, b: 242, a: 255 };
scene[5]._contentSize = { __type__: 'cc.Size', width: 1280, height: 720 };
const nodeId = scene.length;
const transformId = nodeId + 1;
const componentId = nodeId + 2;
scene[2]._children.push({ __id__: nodeId });
scene.push({
    __type__: 'cc.Node', _name: 'Background', _objFlags: 0,
    _parent: { __id__: 2 }, _children: [], _active: true,
    _components: [{ __id__: transformId }, { __id__: componentId }], _prefab: null,
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
    _layer: 33554432,
    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _id: 'pink-background-root',
}, {
    __type__: 'cc.UITransform', _name: '', _objFlags: 0,
    node: { __id__: nodeId }, _enabled: true, __prefab: null,
    _contentSize: { __type__: 'cc.Size', width: 1280, height: 720 },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
    _id: 'pink-background-transform',
}, {
    __type__: compressUUID('fc60d5d3-92d9-4afd-9615-ddbdddf82d7a', false),
    _name: '', _objFlags: 0, node: { __id__: nodeId },
    _enabled: true, __prefab: null, _id: 'pink-background-component',
});
const target = path.join(project, 'assets/BackgroundTest.scene');
if (fs.existsSync(target)) throw new Error('BackgroundTest.scene already exists; refusing to overwrite it.');
fs.writeFileSync(target, JSON.stringify(scene, null, 2) + '\n');
fs.writeFileSync(target + '.meta', JSON.stringify({
    ver: '1.1.50', importer: 'scene', imported: true, uuid: sceneUuid,
    files: ['.json'], subMetas: {}, userData: {},
}, null, 2) + '\n');
console.log('Created assets/BackgroundTest.scene');
