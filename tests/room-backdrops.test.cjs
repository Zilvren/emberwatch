const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { ts } = require('../tools/load-ts.cjs');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'assets/game/presentation/effects/SceneAtmosphere.ts');

// Deliver the native load callbacks in a chosen order, including after the component is disabled.
function fixture() {
    const requests = [], cached = new Map();
    const noop = () => {};
    const engine = {
        _decorator: { ccclass: () => target => target, property: () => noop },
        Component: class {}, Vec3: class {}, Sprite: class {}, Tween: { stopAllByTarget: noop }, warn: noop,
        resources: { get: key => cached.get(key), load: (key, type, done) => requests.push({ key, done }) },
    };
    const mod = new Module(file, module);
    mod.require = name => { assert.equal(name, 'cc'); return engine; };
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
    } }).outputText, file);
    const scene = new mod.exports.SceneAtmosphere();
    const sprite = { spriteFrame: 'legacy', isValid: true };
    scene.node = { setPosition: noop };
    scene.backdrop = { getComponent: () => sprite, setPosition: noop };
    scene.labyrinthBackdrop = 'passage';
    scene.labyrinthCourt = 'court';
    return { scene, sprite, requests, cached };
}

function frame() {
    return { refs: 0, addRef() { this.refs++; }, decRef() { assert.ok(this.refs > 0); this.refs--; } };
}

test('each mythic room resolves to a distinct imported full-size painting, including the two bird encounters', () => {
    const { scene, requests } = fixture();
    const expected = {
        hornCourt: 'horn-court', quarryHall: 'broken-column-quarry', floodedVault: 'flooded-vault',
        windPerch: 'windworn-perch', galeRoost: 'twin-wind-gallery', ebbWell: 'ebb-well', clashingPass: 'clashing-pass',
    };
    const ids = new Set();
    for (const [room, name] of Object.entries(expected)) {
        scene.setRoom(room);
        assert.equal(requests.at(-1).key, 'art/battle-rooms/' + name + '/spriteFrame');
        const jpg = path.join(root, 'assets/resources/art/battle-rooms', name + '.jpg');
        const meta = JSON.parse(fs.readFileSync(jpg + '.meta'));
        const native = meta.subMetas.f9941;
        const master = fs.readFileSync(path.join(root, 'art-source/ashen-labyrinth/battle-bestiary/backgrounds/rooms', name + '.png'));
        assert.equal(meta.userData.type, 'sprite-frame');
        assert.equal(meta.userData.hasAlpha, false);
        assert.ok(meta.imported && fs.statSync(jpg).size > 0);
        assert.equal(native.userData.width, master.readUInt32BE(16));
        assert.equal(native.userData.height, master.readUInt32BE(20));
        ids.add(native.uuid);
    }
    assert.equal(ids.size, 7);
});

test('superseded, duplicate and post-disable loads cannot replace the current room or leak a reference', () => {
    const { scene, sprite, requests, cached } = fixture();
    const perch = frame(), gallery = frame();
    scene.setRoom('windPerch');
    scene.setRoom('windPerch');
    assert.equal(requests.length, 1);
    scene.setRoom('galeRoost');
    scene.setRoom('windPerch');
    requests[2].done(null, perch);
    requests[0].done(null, perch);
    requests[1].done(null, gallery);
    assert.equal(sprite.spriteFrame, perch);
    assert.equal(perch.refs, 1);
    assert.equal(gallery.refs, 0);
    scene.setRoom('lampCourt', 'court');
    assert.equal(sprite.spriteFrame, 'court');
    assert.equal(perch.refs, 0);

    scene.setRoom('galeRoost');
    scene.onDisable();
    requests[3].done(null, gallery);
    assert.equal(sprite.spriteFrame, 'passage');
    assert.equal(gallery.refs, 0);
    scene.setRoom('galeRoost');
    requests[4].done(new Error('read failed'));
    cached.set(requests[4].key, gallery);
    scene.setRoom('galeRoost');
    assert.equal(requests.length, 5);
    assert.equal(sprite.spriteFrame, gallery);
    scene.setLook('legacy');
    assert.equal(sprite.spriteFrame, 'legacy');
    assert.equal(gallery.refs, 0);
});
