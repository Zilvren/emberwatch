const { test } = require('node:test'),
    assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path');
const root = path.resolve(__dirname, '..'),
    read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
test('retained sprite-review attack keeps one scale, registered feet, stable endpoint and original impact timing', () => {
    const data = read('assets/resources/actors/sketch08/survivor-attack-detail.json');
    assert.equal(data.status, 'native-connected');
    assert.equal(data.frames.length, 8);
    assert.equal(data.uniqueDrawings, 7);
    assert.equal(data.neutralEndpointReusesStart, true);
    assert.ok(
        data.frames[0].bodyHeight >= 450,
        'Source needs enough actual drawn pixels for native display'
    );
    assert.equal(new Set(data.frames.map((f) => f.scale)).size, 1);
    assert.equal(data.frames[0].contentHash, data.frames[7].contentHash);
    const feet = data.frames.map((f) => ({
        x: ((f.offset[0] + f.feet.left - f.rect[0] - f.rect[2] / 2) * 640) / f.sourceSize[0],
        y: ((f.offset[1] - (f.feet.y - f.rect[1] - f.rect[3] / 2)) * 256) / f.sourceSize[1],
    }));
    assert.ok(feet.every((f) => Math.abs(f.y + 112) < 0.001));
    assert.ok(feet.every((f) => Math.abs(f.x - feet[0].x) < 0.001));
    assert.ok(
        Math.abs(
            (data.frames[0].bodyHeight * 256) / data.frames[0].sourceSize[1] - data.referenceHeight
        ) < 0.6
    );
    const clip = read('assets/animations/sketch08/Sketch08_survivor_attack.anim'),
        curve = clip.find((c) => c.__type__ === 'cc.ObjectCurve');
    assert.deepEqual(
        curve._values.map((v) => v.__uuid__),
        data.frames.map((f) => f.uuid)
    );
    assert.deepEqual(
        curve._times,
        data.frames.map((f) => f.time)
    );
    assert.equal(clip[0]._duration, 0.56);
    assert.equal(clip[0]._events.length, 1);
    assert.equal(clip[0]._events[0].frame, 0.28);
    for (const frame of data.frames) {
        const atlas = read(
            'assets/resources/actors/sketch08/' + frame.image.replace('.png', '.plist') + '.meta'
        );
        assert.ok(Object.values(atlas.subMetas).some((m) => m.uuid === frame.uuid));
    }
});
