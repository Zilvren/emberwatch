// Run only after Pink has imported both new atlases. Existing clip/meta identities stay intact.
const fs = require('node:fs'),
    path = require('node:path');
const N = require('./native-assets.cjs'),
    { root, read, asset } = N;
const file = 'assets/resources/actors/sketch08/survivor-attack-detail.json',
    data = read(file);
for (const frame of data.frames) {
    const atlas = frame.image.replace('.png', '.plist'),
        meta = read('assets/resources/actors/sketch08/' + atlas + '.meta');
    const imported = Object.values(meta.subMetas ?? {}).find((m) => m.name === frame.name);
    if (!meta.imported || !imported?.uuid)
        throw Error('Import through Pink before connecting: ' + frame.name);
    frame.uuid = imported.uuid;
}
const clipFile = 'assets/animations/sketch08/Sketch08_survivor_attack.anim';
const backup = path.join(root, 'temp/quality-fixes-before', clipFile);
if (!fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(path.join(root, clipFile), backup);
}
const clip = read(clipFile),
    curve = clip.find((o) => o.__type__ === 'cc.ObjectCurve');
curve._times = data.frames.map((f) => f.time);
curve._values = data.frames.map((f) => asset(f.uuid, 'cc.SpriteFrame'));
if (clip[0]._duration !== 0.56 || clip[0]._events.length !== 1 || clip[0]._events[0].frame !== 0.28)
    throw Error('Attack timing unexpectedly changed');
fs.writeFileSync(path.join(root, clipFile), JSON.stringify(clip, null, 2) + '\n');
data.status = 'native-connected';
fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
console.log(
    JSON.stringify({
        connectedFrames: data.frames.length,
        drawings: data.uniqueDrawings,
        duration: clip[0]._duration,
        impact: clip[0]._events[0].frame,
    })
);
