// Build native actor clips and the isolated motion review scene.
const fs=require('node:fs'),path=require('node:path');
const {root,read,copy,ref,vec,color,asset,identifier,ensureMeta,uuid,script,prune,write,Graph,cleanComponent,spriteTemplate}=require('./native-assets.cjs');
const manifest = read('assets/resources/actors/sketch08/motion-manifest.json');
const detailedAttack = path.join(root, 'assets/resources/actors/sketch08/survivor-attack-detail.json');
if (fs.existsSync(detailedAttack) && JSON.parse(fs.readFileSync(detailedAttack, 'utf8')).status === 'native-connected')
    throw Error('Detailed survivor attack is active. This legacy full-generation tool would replace it. Use prepare-attack-detail.py / Pink import / connect-attack-detail.cjs for that asset; npm run build:actors only builds the current native review scene.');
const clips = {};
fs.mkdirSync(path.join(root, 'assets/animations/sketch08'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets/prefabs/actors/sketch08'), { recursive: true });
for (const [actor, definition] of Object.entries(manifest.actors)) {
    clips[actor] = {};
    for (const [action, sheet] of Object.entries(definition.actions)) {
        const meta = read('assets/resources/actors/sketch08/' + sheet.atlas + '.meta');
        for (const frame of sheet.frames) {
            const entry = Object.values(meta.subMetas).find(value => value.name === frame.name);
            if (!entry) throw Error('Frame was not imported: ' + frame.name);
            frame.uuid = entry.uuid;
        }
        const graph = read('assets/animations/PlayerUnarmedAttack.anim');
        const curve = graph.find(object => object.__type__ === 'cc.ObjectCurve');
        curve._times = sheet.frames.map(frame => frame.time); curve._values = sheet.frames.map(frame => asset(frame.uuid, 'cc.SpriteFrame'));
        if (action === 'idle') {
            const masterMeta = read('assets/resources/actors/sketch08/master08-thin.png.meta');
            const master = Object.values(masterMeta.subMetas).find(value => value.importer === 'sprite-frame');
            if (!master) throw Error('Approved master drawing was not imported');
            curve._times = [0, 3]; curve._values = [asset(master.uuid, 'cc.SpriteFrame'), asset(master.uuid, 'cc.SpriteFrame')];
        }
        const name = 'Sketch08_' + actor + '_' + action;
        Object.assign(graph[0], { _name: name, sample: 24, speed: 1, wrapMode: sheet.loop ? 2 : 1, _duration: sheet.duration, _tracks: [graph[0]._tracks[0]], _events: action === 'attack' ? [{ frame: sheet.impactTime, func: 'notifyImpact', params: [] }] : [] });
        if (action === 'idle') {
            const add = object => { graph.push(object); return graph.length - 1; };
            const hierarchy = add({ __type__: 'cc.animation.HierarchyPath', path: 'Visual' });
            const component = add({ __type__: 'cc.animation.ComponentPath', component: 'StableActorSprite' });
            const trackPath = add({ __type__: 'cc.animation.TrackPath', _paths: [ref(hierarchy), ref(component), 'breath'] });
            const keyTemplate = read('assets/animations/PlayerUnarmedIdle.anim').find(object => object.__type__ === 'cc.RealCurve')._values[0];
            const motionCurve = add({ __type__: 'cc.RealCurve', _times: Array.from({ length: 24 }, (_, i) => 3 * i / 23), _values: Array.from({ length: 24 }, (_, i) => ({ ...copy(keyTemplate), value: (1 - Math.cos(Math.PI * 2 * i / 23)) / 2 })), preExtrapolation: 1, postExtrapolation: 1 });
            const channel = add({ __type__: 'cc.animation.Channel', _curve: ref(motionCurve) });
            const track = add({ __type__: 'cc.animation.RealTrack', _binding: { __type__: 'cc.animation.TrackBinding', path: ref(trackPath) }, _channel: ref(channel) });
            graph[0]._tracks.push(ref(track));
            graph[0].sample = 60;
        }
        const file = 'assets/animations/sketch08/' + name + '.anim';
        const clipUuid = ensureMeta(file, 'animation-clip'); write(file, graph);
        clips[actor][action] = asset(clipUuid, 'cc.AnimationClip');
    }
    const file = 'assets/prefabs/actors/sketch08/' + actor + '.prefab';
    ensureMeta(file, 'prefab');
    const graph = new Graph(file, 'Sketch08_' + actor), actorNode = graph.node('Sketch08_' + actor, null, 0, 0, 400, 460);
    const targetHeight = { survivor: 430, wanderer: 465, brute: 500 }[actor];
    graph.graph[actorNode]._lscale = vec(targetHeight / (definition.baseHeight * 2), targetHeight / (definition.baseHeight * 2), 1);
    const visual = graph.node('Visual', actorNode, 0, 224, 640, 256); graph.graph[visual]._lscale = vec(2, 2, 1);
    const master = Object.values(read('assets/resources/actors/sketch08/master08-thin.png.meta').subMetas).find(value => value.importer === 'sprite-frame');
    const sprite = graph.component(visual, script('StableActorSprite'), { ...cleanComponent(spriteTemplate), geometry: asset(uuid('assets/resources/actors/sketch08/' + actor + '-rig.json'), 'cc.JsonAsset'), _spriteFrame: asset(master.uuid, 'cc.SpriteFrame'), _sizeMode: 0, _isTrimmedMode: false });
    graph.component(actorNode, 'cc.Animation', { playOnLoad: false, _clips: Object.values(clips[actor]), _defaultClip: clips[actor].idle });
    graph.component(actorNode, script('SpriteActorMotion'), { artwork: ref(sprite), ...clips[actor] });
    graph.node('ImpactPoint', actorNode, 0, 250, 1, 1);
    graph.save();
}
fs.writeFileSync(path.join(root, 'assets/resources/actors/sketch08/motion-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const sceneFile = 'assets/ActorMotionReview.scene', sceneUuid = ensureMeta(sceneFile, 'scene');
const scene = new Graph(sceneFile, 'ActorMotionReview');
const sceneObject = scene.graph[scene.graph[0].scene.__id__]; scene.graph[0]._name = sceneObject._name = 'ActorMotionReview'; sceneObject._id = sceneUuid;
const canvas = scene.root;
scene.graph[canvas]._children = scene.graph[canvas]._children.filter(child => scene.graph[child.__id__]._name === 'Camera');
scene.root = scene.node('ActorMotionReview', canvas);
scene.shape('PaperBackground', 0, 0, 1440, 900, 'f3ede2');
scene.label('Heading', '08 版 · 细描边动作预览', 0, 393, 1300, 52, 29);
scene.label('Subheading', '08 原画 · 恢复原大小 · 局部呼吸　｜　攻击、受击、倒下各 8 帧', 0, 346, 1300, 38, 17, '8a7b64');
scene.shape('Floor', 0, -231, 1320, 2, 'aa997f', 180);
const actorNodes = [], captions = [];
Object.keys(manifest.actors).forEach((actor, index) => {
    actorNodes.push(ref(scene.linked('assets/prefabs/actors/sketch08/' + actor + '.prefab', actor, (index - 1) * 450, -230)));
    captions.push(ref(scene.label(actor + 'Status', manifest.actors[actor].name, (index - 1) * 450, -275, 420, 38, 19).label));
});
const status = scene.label('PlaybackStatus', '', 0, -316, 1320, 35, 16);
const controls = [
    ['idle', '待机', 'playIdle'], ['attack', '攻击', 'playAttack'], ['hurt', '受击', 'playHurt'], ['death', '倒下', 'playDeath'], ['sequence', '连续播放', 'playSequence'], ['speed', '速度 ×1', 'toggleSpeed'], ['pause', '暂停 / 继续', 'togglePause'],
].map(([name, caption, method], index) => scene.button(name, caption, (index - 3) * 184, -378, method));
scene.component(scene.root, script('ActorMotionReview'), { actorRoots: actorNodes, captions, status: ref(status.label), speedCaption: ref(controls[5].caption), buttons: controls.map(control => ref(control.node)) });
scene.graph[sceneObject._prefab.__id__].fileId = sceneUuid;
scene.graph[sceneObject._prefab.__id__].nestedPrefabInstanceRoots = scene.links;
scene.save();
const config = read('build-config.json');
Object.assign(config, { name: 'the-end-actor-review', outputName: 'actor-review', startScene: sceneUuid, scenes: [{ url: 'db://' + sceneFile, uuid: sceneUuid }] });
fs.writeFileSync(path.join(root, 'build-actor-review.json'), JSON.stringify(config, null, 2) + '\n');
console.log(JSON.stringify({ scene: sceneFile, sceneUuid, actors: 3, clips: 12, frames: 144 }));
