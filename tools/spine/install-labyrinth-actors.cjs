// Explicit authoring step for the main game's native actors and battle backdrop.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { root, read, ref, vec, asset, script, uuid, ensureMeta, Graph, cleanComponent } = require('../native-assets.cjs');
const { duration } = require('./bestiary-author.cjs');
const { PNG } = require('./bestiary-assets.cjs');

const art = 'art-source/ashen-labyrinth/battle-bestiary';
const playerArt = 'assets/ashen-survivor-flick-golden';
const output = 'assets/ashen-labyrinth';
const interfaceFolder = output + '/interface';
const legacy = read('assets/prefabs/actors/PlayerActor.prefab');
const sharedSkeleton = cleanComponent(legacy.find((item) => item.__type__ === 'sp.Skeleton'));
const motionNames = ['idle', 'prepare', 'attack', 'hurt', 'death'];
const enemies = {
    'ash-moth': { aim: 'thorax', contact: 'head', localTip: 23, x: 310, y: -119, scale: 1.02 },
    'stone-claw': { aim: 'hull', contact: 'palm', localTip: 95, x: 324, y: -182, scale: .91 },
    'veil-idol': { aim: 'robe', aimShift: 92, contact: 'left-hand', localTip: 49, x: 336, y: -189, scale: 1.05, flight: .17 },
};
const absolute = (file) => path.join(root, file);
const save = (file, value) => fs.writeFileSync(absolute(file), JSON.stringify(value, null, 2) + '\n');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(absolute(file))).digest('hex');
const copy = (from, to) => fs.copyFileSync(absolute(from), absolute(to));

function importMeta(file, template, data) {
    if (!fs.existsSync(absolute(file + '.meta'))) {
        const shape = read(template + '.meta');
        save(file + '.meta', { ver: shape.ver, importer: shape.importer, imported: false,
            uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: data });
    }
    return uuid(file);
}

function importSkeleton(source, name, target, doc) {
    const atlas = readAtlas(source + '/' + name + '.atlas');
    const atlasFile = target + '/' + name + '.atlas';
    copy(source + '/' + name + '.atlas', atlasFile);
    const atlasId = importMeta(atlasFile, playerArt + '/survivor-flick.atlas', {});
    for (const page of atlas.match(/^.+\.png$/gm)) {
        copy(source + '/' + page, target + '/' + page);
        importMeta(target + '/' + page, playerArt + '/survivor-flick-parts.png', {
            type: 'texture', hasAlpha: true, fixAlphaTransparencyArtifacts: false,
        });
    }
    const file = target + '/' + name + '.json';
    delete doc.skeleton.audio;
    save(file, doc);
    return importMeta(file, playerArt + '/survivor-flick.json', { atlasUuid: atlasId });
}

function readAtlas(file) {
    return fs.readFileSync(absolute(file), 'utf8').replaceAll('\r', '');
}

function markersAtImpact(doc, contact, tip, now) {
    const frames = new Map();
    const tracks = doc.animations.attack.bones;
    for (const bone of doc.bones) {
        const parent = frames.get(bone.parent) ?? { a: 0, x: 0, y: 0 };
        const data = tracks?.[bone.name];
        function value(channel, key) {
            const k = data?.[channel]?.filter((pose) => (pose.time ?? 0) <= now).at(-1);
            return k?.[key] ?? 0;
        }
        const x = (bone.x ?? 0) + value('translate', 'x'), y = (bone.y ?? 0) + value('translate', 'y');
        const cos = Math.cos(parent.a), sin = Math.sin(parent.a);
        frames.set(bone.name, { a: parent.a + ((bone.rotation ?? 0) + value('rotate', 'angle')) * Math.PI / 180,
            x: parent.x + cos * x - sin * y, y: parent.y + sin * x + cos * y });
    }
    const f = frames.get(contact);
    return [f.x + tip * Math.cos(f.a), f.y + tip * Math.sin(f.a)];
}

function contractFile(target, name, doc, source, contact, tip, flight, parts, surface) {
    const motions = Object.fromEntries(motionNames.map((kind) => [kind, {
        duration: duration(doc.animations[kind]), loop: kind === 'idle',
        ...(kind === 'attack' ? { contact: doc.animations.attack.events.find((event) => event.name === 'impact').time } : {}),
    }]));
    const names = doc.bones.map((bone) => bone.name);
    const influences = [], triangles = [];
    for (const shape of surface) {
        const offset = influences.length;
        const vertices = shape.vertices;
        for (let i = 0; i < vertices.length;) {
            const count = vertices[i++], weights = [];
            for (let j = 0; j < count; j++, i += 4) weights.push(vertices.slice(i, i + 4));
            influences.push(weights);
        }
        triangles.push(...shape.triangles.map((index) => index + offset));
    }
    const file = target + '/' + name + '.contract.json';
    save(file, {
        schemaVersion: 1, actor: name === 'survivor-flick' ? 'ashen-survivor' : 'ashen-' + name,
        sourceSha256: hash(source), baseline: 0, boneNames: names, influences, triangles,
        neutralVertices: [], motions, contactBone: contact, contactTip: tip, approachBone: 'Approach',
        ...(flight ? { flight } : {}), parts: parts.map((n) => ({ name: n })),
    });
    return ensureMeta(file, 'json');
}

function protagonist() {
    const model = output + '/lantern-keeper/lantern-keeper';
    const rig = legacy.find((item) => item.__type__ === script('SpineActorRig'));
    rig.labyrinthSkeleton = asset(uuid(model + '.json'), 'sp.SkeletonData');
    rig.labyrinthContract = asset(uuid(model + '.contract.json'), 'cc.JsonAsset');
    rig.thrownCard = asset(uuid(output + '/paper-back.png') + '@f9941', 'cc.SpriteFrame');
    const visual = legacy[legacy[rig.node.__id__]._parent.__id__];
    rig.labyrinthScale = 1 / visual._lscale.y;
    rig.labyrinthOffset = vec(0, -visual._lpos.y / visual._lscale.y, 0);
    save('assets/prefabs/actors/PlayerActor.prefab', legacy);
}

function enemy(id, spec) {
    const sourceFolder = art + '/' + id + '/runtime';
    const source = sourceFolder + '/' + id + '.json', doc = read(source);
    const attack = doc.animations.attack, hit = attack.events.find((event) => event.name === 'impact').time;
    const tip = markersAtImpact(doc, spec.contact, spec.localTip, hit);
    doc.bones.push({ name: 'PoseRoot', parent: 'root' },
        { name: 'Aim', parent: spec.aim, x: spec.aimShift ?? 0 },
        { name: 'ContactTip', parent: spec.contact, x: spec.localTip },
        { name: 'Approach', parent: 'root' });
    if (spec.flight) {
        doc.events.release ??= {};
        attack.events.unshift({ time: +(hit - spec.flight).toFixed(3), name: 'release' });
        attack.events.sort((a, b) => a.time - b.time);
    } else {
        attack.bones.Approach = { translate: [
            { x: 0 }, { time: hit * .29, x: 0 }, { time: hit * .67, x: .48 },
            { time: hit, x: 1 }, { time: hit + .08, x: .96 }, { time: duration(attack), x: 0 },
        ] };
    }
    const folder = output + '/' + id;
    fs.mkdirSync(absolute(folder), { recursive: true });
    const skeleton = importSkeleton(sourceFolder, id, folder, doc);
    const contract = contractFile(folder, id, doc, source, 'ContactTip', tip, spec.flight,
        Object.keys(doc.skins[0].attachments), []);
    const file = 'assets/prefabs/actors/' + id + '.prefab';
    const graph = new Graph(file, id);
    const actor = graph.node(id, null, 0, 0, 440, 440);
    const shadow = graph.shape('ContactShadow', 0, id === 'ash-moth' ? -51 : 3, id === 'stone-claw' ? 240 : 163, 16, '302635', 108, true);
    assert.ok(shadow);
    const ink = graph.node('Spine', actor, 0, 0, 450, 450);
    graph.graph[ink]._lscale = vec(spec.scale, spec.scale, 1);
    const skull = graph.component(ink, 'sp.Skeleton', { ...sharedSkeleton, _skeletonData: asset(skeleton, 'sp.SkeletonData') });
    const rig = graph.component(ink, script('SpineActorRig'), { skeleton: ref(skull), contract: asset(contract, 'cc.JsonAsset') });
    const anchor = graph.node('ImpactPoint', actor, 0, 150, 1, 1);
    graph.component(actor, 'cc.Animation', { _clips: [], _defaultClip: null, playOnLoad: false });
    graph.component(actor, script('ActorPresentation'), { actorId: id, spineRig: ref(rig), impactAnchor: ref(anchor) });
    graph.save();
    ensureMeta(file, 'prefab');
    return file;
}

function image(source, filename) {
    const target = filename ? output + '/' + filename : source;
    if (filename) copy(source, target);
    const version = 'assets/ashen-survivor/light-cut-passage.png';
    const frame = importMeta(target, version, { type: 'sprite-frame', hasAlpha: target.endsWith('card-back.png'), fixAlphaTransparencyArtifacts: false });
    return asset(frame + '@f9941', 'cc.SpriteFrame');
}

function battle(prefabs, backgrounds) {
    const file = 'assets/prefabs/screens/BattleScreen.prefab';
    const graph = new Graph(file, 'BattleScreen');
    graph.graph = read(file);
    const rootNode = graph.graph[graph.graph[0].data.__id__];
    graph.root = graph.graph.findIndex((item) => item.__type__ === 'cc.Node' && item._name === 'World');
    const world = graph.graph[graph.root];
    const info = graph.graph[rootNode._prefab.__id__];
    for (const [id, prefab] of Object.entries(prefabs)) {
        const prefabId = uuid(prefab);
        if (info.nestedPrefabInstanceRoots.some((link) => {
            const node = graph.graph[link.__id__];
            return graph.graph[node._prefab.__id__].asset?.__uuid__ === prefabId;
        })) continue;
        const spec = enemies[id];
        const index = graph.linked(prefab, id, spec.x, spec.y);
        const linked = graph.graph[graph.graph[index]._prefab.__id__];
        const overrides = graph.graph[linked.instance.__id__].propertyOverrides;
        graph.graph[overrides.at(-1).__id__].value = false;
        info.nestedPrefabInstanceRoots.push(ref(index));
    }
    const atmosphere = world._components.map((link) => graph.graph[link.__id__]).find((c) => c.__type__ === script('SceneAtmosphere'));
    atmosphere.labyrinthBackdrop = backgrounds.passage;
    atmosphere.labyrinthCourt = backgrounds.court;
    save(file, graph.graph);
}

fs.mkdirSync(absolute(output), { recursive: true });
protagonist();
const prefabs = Object.fromEntries(Object.entries(enemies).map(([id, spec]) => [id, enemy(id, spec)]));
const paper = image(interfaceFolder + '/card-back.png');
const shelter = image(interfaceFolder + '/shelter.jpg');
const texture = importMeta(interfaceFolder + '/illustrations.png', 'assets/resources/tide/field-items.png', { type: 'texture', hasAlpha: false });
const illustrations = importMeta(interfaceFolder + '/illustrations.plist', 'assets/resources/tide/field-items.plist', {
    atlasTextureName: 'illustrations.png', format: 2, textureUuid: texture + '@6c48a',
});
const theme = ensureMeta(interfaceFolder + '/theme.json', 'json');
for (const name of fs.readdirSync(absolute('assets/prefabs/cards')).filter((n) => n.endsWith('.prefab'))) {
    const file = 'assets/prefabs/cards/' + name;
    const data = read(file);
    let changed = false;
    for (const card of data.filter((entry) => entry.__type__ === script('CardPresentation'))) {
        card.labyrinthArt = asset(illustrations, 'cc.SpriteAtlas');
        card.labyrinthTheme = asset(theme, 'cc.JsonAsset');
        changed = true;
    }
    if (changed) save(file, data);
}
battle(prefabs, {
    passage: asset(uuid('assets/ashen-survivor/light-cut-passage.png') + '@f9941', 'cc.SpriteFrame'),
    court: image(art + '/backgrounds/sunken-lamp-court.png', 'sunken-lamp-court.png'),
});
const scene = read('assets/TheEnd.scene');
const director = scene.find((entry) => entry.__type__ === script('GameDirector'));
director.labyrinthPaper = paper;
director.interfaceTheme = asset(theme, 'cc.JsonAsset');
director.shelterArtwork = shelter;
save('assets/TheEnd.scene', scene);
console.log('Registered four native Spine actors, two labyrinth backdrops and the flying card.');
