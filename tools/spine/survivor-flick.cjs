// Export the current editable three-quarter rig and its native Cocos review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { packParts } = require('./pack-parts.cjs');
const { servePreview } = require('../serve-preview.cjs');
const {
    root, read, ref, vec, asset, script, ensureMeta, Graph, cleanComponent, spriteTemplate,
} = require('../native-assets.cjs');

const name = 'survivor-flick';
const art = process.argv[2] === 'export' && process.argv[3] ? path.resolve(process.argv[3])
    : path.join(root, 'art-source/ashen-labyrinth/battle-survivor/spine-flick-golden');
const gameFolder = 'assets/ashen-survivor-flick-golden';
const sceneFile = 'assets/SurvivorFlickSpineReview.scene';
const controller = 'SurvivorFlickSpineReview';
const build = 'survivor-flick-golden';
const configFile = 'build-survivor-flick-spine.json';

function save(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function spineCommand(executable, args, log) {
    const result = spawnSync(executable, args, {
        cwd: art, windowsHide: true, timeout: 90000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    const output = (String(result.stdout ?? '') + '\n' + String(result.stderr ?? ''))
        .replace(/^.*Licensed to:.*$/gmi, '[Spine Professional]');
    fs.writeFileSync(log, output);
    if (result.error) throw result.error;
    if (result.status !== 0 || !output.includes('Complete.')) throw Error(output.slice(-1400));
}

function publishRig() {
    const executable = process.env.SPINE_EXE;
    if (!executable || !fs.existsSync(executable)) throw Error('Set SPINE_EXE to Spine.com 3.8.75.');
    const project = path.join(art, name + '.spine');
    if (fs.existsSync(project)) throw Error('The editable Spine project already exists.');
    const scratchRoot = path.join(root, 'temp');
    fs.mkdirSync(scratchRoot, { recursive: true });
    const scratch = fs.mkdtempSync(path.join(scratchRoot, 'survivor-flick-spine-'));
    const output = path.join(scratch, 'runtime');
    fs.mkdirSync(output);
    const authoring = path.join(art, name + '.authoring.json');
    const source = JSON.parse(fs.readFileSync(authoring, 'utf8'));
    const candidate = path.join(art, '.' + path.basename(scratch) + '.spine');
    const settings = path.join(scratch, 'export.json');
    save(settings, {
        class: 'export-json', extension: '.json', format: 'JSON', prettyPrint: true,
        nonessential: true, cleanUp: false, packAtlas: null, packSource: 'attachments',
        packTarget: 'single', warnings: true, version: null, output: '', input: '', open: false,
    });

    spineCommand(executable, ['-i', authoring, '-o', candidate, '-r', name], path.join(scratch, 'import.log'));
    spineCommand(executable, ['-i', candidate, '-o', output, '-e', settings], path.join(scratch, 'export.log'));
    const exported = JSON.parse(fs.readFileSync(path.join(output, name + '.json'), 'utf8'));
    assert.equal(exported.skeleton.spine, '3.8.75');
    assert.equal(exported.skeleton.images.replaceAll('\\', '/'), './parts/');
    assert.deepEqual(Object.fromEntries(exported.bones.map(b => [b.name, b.parent])),
        Object.fromEntries(source.bones.map(b => [b.name, b.parent])));
    assert.deepEqual(exported.slots.map(s => s.name), source.slots.map(s => s.name));
    assert.deepEqual(Object.keys(exported.animations).sort(), Object.keys(source.animations).sort());
    assert.deepEqual(exported.ik?.map(rule => rule.target).sort(), ['far-plant', 'near-plant']);
    const rigKeyTracks = ['hips','chest','head','near-sleeve','near-bracer','near-hand',
        'cast-sleeve','cast-bracer','cast-palm','coat-skirt-tip'];
    for (const card of ['lantern','guard','repel']) {
        const flick = exported.animations[card + '-flick'];
        assert.equal(flick.events.length, 1);
        assert.equal(flick.events[0].name, 'release');
        assert.equal(flick.events[0].string ?? exported.events.release.string, card);
        assert.ok(Math.abs(flick.events[0].time - .44) < .002);
        for (const key of rigKeyTracks) assert.ok(flick.bones[key].rotate.length >= 4,key);
        assert.equal(flick.slots['float-'+card].attachment.at(-1).name ?? null,null);
        assert.ok(flick.deform?.default?.['q-near-fist-art']?.['quarter-flick-palm']?.length >= 4);
        assert.deepEqual(Object.keys(exported.skins[0].attachments['float-'+card]), ['paper-back']);
        for (const clip of Object.values(exported.animations)) {
            for (const key of clip.slots?.['float-'+card]?.attachment ?? []) {
                assert.ok(key.name == null || key.name === 'paper-back');
            }
        }
    }
    const flick = exported.animations['guard-flick'];

    const parts = fs.readdirSync(path.join(art, 'parts'))
        .filter(file => file.endsWith('.png')).map(file => ({ name: path.basename(file, '.png') }));
    const packed = packParts({ actor: name, partFolder: path.join(art, 'parts'), parts }, output, scratch, executable);
    const atlas = fs.readFileSync(path.join(output, name + '.atlas'), 'utf8');
    for (const part of parts) assert.ok(atlas.split(/\r?\n/).includes(part.name), part.name);
    fs.renameSync(output, path.join(art, 'runtime'));
    fs.renameSync(candidate, project);
    const report = {
        engine:exported.skeleton.spine, bones:exported.bones.length, images:parts.length,
        handedness:'the anatomical right palm leaves the near cheek to flick the selected back; the left palm supports the right elbow',
        playableClips: Object.keys(exported.animations), release: flick.events[0].time,
        editableRotationKeys: Object.fromEntries(rigKeyTracks.map(key => [key, flick.bones[key].rotate.length])),
        atlasPages: packed.pages,
        projectSha256: crypto.createHash('sha256').update(fs.readFileSync(project)).digest('hex'),
    };
    save(path.join(art, 'export-check.json'), report);
    console.log(JSON.stringify(report));
}

function seed(file, template, userData = {}) {
    const meta = path.join(root, file + '.meta');
    if (!fs.existsSync(meta)) {
        const source = read(template + '.meta');
        save(meta, {
            ver: source.ver, importer: source.importer, imported: false, uuid: crypto.randomUUID(),
            files: [], subMetas: {}, userData,
        });
    }
    return read(file + '.meta').uuid;
}

function authorScene() {
    const report = JSON.parse(fs.readFileSync(path.join(art, 'export-check.json'), 'utf8'));
    fs.mkdirSync(path.join(root, gameFolder), { recursive: true });
    for (const file of [name + '.json', name + '.atlas', ...report.atlasPages]) {
        fs.copyFileSync(path.join(art, 'runtime', file), path.join(root, gameFolder, file));
    }
    const atlas = seed(gameFolder + '/' + name + '.atlas', 'assets/ashen-survivor/survivor.atlas');
    const skin = seed(gameFolder + '/' + name + '.json', 'assets/ashen-survivor/survivor.json', { atlasUuid: atlas });
    for (const page of report.atlasPages) {
        seed(gameFolder + '/' + page, 'assets/ashen-survivor/survivor-parts.png', {
            type: 'texture', hasAlpha: true, fixAlphaTransparencyArtifacts: false,
        });
    }
    const controllerPath = 'assets/game/presentation/actors/' + controller + '.ts';
    seed(controllerPath, 'assets/game/presentation/actors/SurvivorSpineReview.ts');

    const sceneId = ensureMeta(sceneFile, 'scene');
    const graph = new Graph(sceneFile, controller);
    const nativeScene = graph.graph[graph.graph[0].scene.__id__];
    graph.graph[0]._name = nativeScene._name = controller;
    nativeScene._id = sceneId;
    const canvas = graph.root;
    graph.graph[canvas]._children = graph.graph[canvas]._children
        .filter(child => graph.graph[child.__id__]._name === 'Camera');
    graph.root = graph.node(controller, canvas);
    const stage = graph.root;
    const backdrop = graph.node('LabyrinthPassage', stage, 0, 0, 1440, 900);
    const meta = read('assets/ashen-survivor/light-cut-passage.png.meta');
    const sprite = Object.values(meta.subMetas).find(m => m.importer === 'sprite-frame');
    assert.ok(sprite);
    graph.component(backdrop, 'cc.Sprite', {
        ...cleanComponent(spriteTemplate), _spriteFrame: asset(sprite.uuid, 'cc.SpriteFrame'),
        _sizeMode: 0, _type: 0, _isTrimmedMode: false,
    });

    const ground = -300;
    graph.shape('FootShadow', -119, ground+9, 171, 24, '322c3b', 22, true);
    graph.shape('NearFootShadow', -161, ground+2, 52, 7, '322c3b', 57, true);
    graph.shape('FarFootShadow', -74, ground+18, 76, 7, '322c3b', 48, true);
    const mount = graph.node('Survivor', stage, -133, ground, 576, 944);
    graph.graph[mount]._lscale = vec(1.51, 1.51, 1);
    const template = read('assets/prefabs/actors/PlayerActor.prefab').find(c => c.__type__ === 'sp.Skeleton');
    const skeleton = graph.component(mount, 'sp.Skeleton', {
        ...cleanComponent(template), _skeletonData: asset(skin, 'sp.SkeletonData'),
        defaultSkin: 'default', defaultAnimation: 'think', loop: false,
        _premultipliedAlpha: false, _cacheMode: 0,
    });
    graph.shape('ControlsBackground', 0, -388, 1440, 124, '2a2530', 232);
    const status = graph.label('CurrentMotion', '青年求生者  ·  已选中间  ·  按「出牌」', 0, -351, 970, 44, 24, 'eee0d0');
    graph.button('Think', '重新展牌', -366, -411, 'think', controller);
    graph.button('Flick', '出牌', -183, -411, 'playSelected', controller);
    const framing = graph.button('Framing', '看手势', 0, -411, 'toggleFraming', controller);
    const speed = graph.button('Speed', '速度 ×1', 183, -411, 'toggleSpeed', controller);
    const pause = graph.button('Pause', '暂停', 366, -411, 'togglePause', controller);
    graph.component(stage, script(controller), {
        skeleton: ref(skeleton), status: ref(status.label),
        speedCaption:ref(speed.caption), pauseCaption:ref(pause.caption), framingCaption:ref(framing.caption),
    });
    const info = graph.graph[nativeScene._prefab.__id__];
    info.fileId = sceneId;
    info.nestedPrefabInstanceRoots = graph.links;
    graph.save();

    const config = read('build-survivor-review.json');
    Object.assign(config, {
        name: 'the-end-' + build, outputName: build, startScene: sceneId,
        scenes: [{ url: 'db://' + sceneFile, uuid: sceneId }],
    });
    save(path.join(root, configFile), config);
    console.log(JSON.stringify({ scene: sceneFile, config: configFile, skeleton: skin }));
}

switch (process.argv[2]) {
    case 'export':
        publishRig();
        break;
    case 'scene':
        authorScene();
        break;
    case 'serve':
        servePreview({ directory: path.join(root, 'build', build), port: Number(process.env.PORT || 7494),
            label: '主角托腮弹牌 · Spine' });
        break;
    default:
        throw Error('Use export, scene, or serve.');
}
