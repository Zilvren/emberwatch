// Explicit art build. Source registration is in pixels of the original 1536 × 1024 lineup.
// Runtime uses native Spine 3.8 meshes and the same clip events as the legacy actors.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const version = require('../.pink/settings.json')['cocos.engine.version'];
const sdk = path.join(process.env.APPDATA, 'cocos-default', 'cocos-' + version);
const { PNG } = require(require.resolve('pngjs', { paths: [sdk] }));
const { poseMatrices, point } = require('./spine/rig-authoring.cjs');
const source = path.join(root, 'art-source/tide');
const dest = path.join(root, 'assets/resources/tide');
const sheet = PNG.sync.read(fs.readFileSync(path.join(source, 'actors.png')));
const round = (n) => Math.round(n * 10000) / 10000;
const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
const actors = [
    {
        id: 'surveyor',
        box: [12, 44, 552, 944],
        center: 208,
        ground: 978,
        scale: 0.218,
        hips: [230, 441],
        chest: [216, 281],
        head: [229, 172],
        focus: [297, 301],
        tip: [382, 332],
        feet: [
            [78, 964],
            [301, 961],
        ],
        aim: [232, 302],
        ranged: true,
        contact: 0.34,
        duration: 0.64,
        release: 0.19,
        knee: 685,
        weights: (x, y) => ({
            head: 1 - smooth(161, 222, y),
            focus: smooth(284, 350, x) * smooth(178, 235, y) * (1 - smooth(467, 515, y)),
            chest: 1 - smooth(400, 492, y),
        }),
    },
    {
        id: 'buoy',
        box: [417, 482, 589, 505],
        center: 709,
        ground: 974,
        scale: 0.278,
        hips: [704, 808],
        chest: [707, 733],
        head: [552, 727],
        focus: [644, 746],
        tip: [474, 720],
        feet: [
            [526, 956],
            [941, 945],
        ],
        aim: [688, 724],
        ranged: false,
        contact: 0.32,
        duration: 0.67,
        knee: 877,
        weights: (x, y) => ({
            head: 0,
            focus: (1 - smooth(544, 668, x)) * (1 - smooth(760, 814, y)),
            chest: 1 - smooth(747, 830, y),
        }),
    },
    {
        id: 'rotor',
        box: [983, 25, 546, 918],
        center: 1254,
        ground: 927,
        scale: 0.241,
        hips: [1252, 625],
        chest: [1256, 386],
        head: [1258, 382],
        focus: [1258, 382],
        tip: [1057, 393],
        feet: [
            [1103, 858],
            [1368, 891],
        ],
        aim: [1258, 382],
        ranged: true,
        contact: 0.49,
        duration: 0.93,
        release: 0.31,
        knee: 787,
        weights: (x, y) => ({
            head: 0,
            focus: 1 - smooth(586, 723, y),
            chest: 1 - smooth(705, 777, y),
        }),
    },
];
function isolate(actor) {
    const [left, top, width, height] = actor.box;
    const out = new PNG({ width, height });
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const sx = x + left,
                sy = y + top,
                off = (sy * sheet.width + sx) * 4,
                to = (y * width + x) * 4;
            if (
                (actor.id === 'surveyor' && sx > 416 && sy > 485) ||
                (actor.id === 'buoy' && sx > 955 && sy < 810) ||
                (actor.id === 'rotor' && sx < 1010 && sy > 860)
            )
                continue;
            sheet.data.copy(out.data, to, off, off + 4);
            out.data[to + 3] = Math.round(
                Math.max(0, Math.min(1, (out.data[to + 3] - 7) / 244)) * 255
            );
        }
    return out;
}
function tracks(a) {
    const rot = (pairs) => pairs.map(([time, angle]) => ({ time, angle }));
    const move = (pairs) => pairs.map(([time, x, y]) => ({ time, x, y }));
    const rotate = (pairs) => ({ rotate: rot(pairs) }),
        translate = (pairs) => ({ translate: move(pairs) });
    const rotor = a.id === 'rotor',
        drone = a.id === 'buoy',
        t = a.contact,
        end = a.duration;
    const wind = drone ? 4 : rotor ? -15 : -7,
        strike = drone ? -6 : rotor ? 16 : 12;
    const idle = {
        Chest: translate([
            [0, 0, 0],
            [1.35, 0, rotor ? 2.5 : 1],
            [2.8, 0, 0],
        ]),
        Focus: rotate([
            [0, 0],
            [1.35, rotor ? 4 : 1.5],
            [2.8, 0],
        ]),
        Head: rotate([
            [0, 0],
            [1.35, -1.1],
            [2.8, 0],
        ]),
    };
    if (rotor)
        idle.Fall = translate([
            [0, 0, 0],
            [1.35, 0, 3],
            [2.8, 0, 0],
        ]);
    const attack = {
        Chest: rotate([
            [0, 0],
            [0.14, wind],
            [t, strike],
            [end, 0],
        ]),
        Focus: rotate([
            [0, 0],
            [0.15, wind],
            [t, rotor ? 20 : drone ? -3 : 14],
            [end, 0],
        ]),
        Hips: translate([
            [0, 0, 0],
            [0.12, drone ? 4 : -2, -3],
            [t, drone ? -3 : 2, drone ? 5 : 1],
            [end, 0, 0],
        ]),
        Approach: translate([
            [0, 0, 0],
            [0.13, 0, 0],
            [t, drone ? 1 : 0, 0],
            [t + 0.07, drone ? 1 : 0, 0],
            [end, 0, 0],
        ]),
    };
    const direction = drone || rotor ? 1 : -1;
    return {
        animations: {
            idle: { bones: idle },
            attack: {
                bones: attack,
                events: [
                    ...(a.ranged ? [{ time: a.release, name: 'release' }] : []),
                    { time: t, name: 'impact' },
                ],
            },
            prepare: {
                bones: {
                    Chest: rotate([
                        [0, 0],
                        [0.18, wind],
                        [0.46, wind],
                        [0.65, 0],
                    ]),
                    Focus: rotate([
                        [0, 0],
                        [0.24, rotor ? -27 : -10],
                        [0.47, rotor ? -27 : -10],
                        [0.65, 0],
                    ]),
                },
            },
            hurt: {
                bones: {
                    Hips: translate([
                        [0, 0, 0],
                        [0.065, direction * 5, -1],
                        [0.24, 0, 0],
                    ]),
                    Chest: rotate([
                        [0, 0],
                        [0.07, -direction * 5],
                        [0.24, 0],
                    ]),
                },
            },
            death: {
                bones: {
                    Fall: {
                        rotate: rot([
                            [0, 0],
                            [0.13, direction * 5],
                            [0.54, -direction * (drone ? 16 : 72)],
                            [0.68, -direction * (drone ? 13 : 68)],
                        ]),
                        translate: move([
                            [0, 0, 0],
                            [0.15, 0, 2],
                            [0.54, direction * 8, drone ? -1 : -6],
                            [0.68, direction * 8, drone ? 0 : -4],
                        ]),
                    },
                },
            },
        },
        contactPose: {
            Chest: { rotate: strike },
            Focus: { rotate: rotor ? 20 : drone ? -3 : 14 },
            Hips: { x: drone ? -3 : 2, y: drone ? 5 : 1 },
        },
    };
}
function authorActor(a) {
    const pixels = isolate(a),
        png = PNG.sync.write(pixels),
        [left, top, width, height] = a.box;
    const world = ([x, y]) => [
        round((x - a.center) * a.scale),
        round((a.ground - y) * a.scale - 112),
    ];
    const bones = [],
        bind = {};
    function bone(name, parent, p) {
        const pos = p ? world(p) : [0, 0],
            origin = bind[parent] ?? [0, 0];
        bind[name] = pos;
        bones.push({
            name,
            ...(parent ? { parent } : {}),
            x: round(pos[0] - origin[0]),
            y: round(pos[1] - origin[1]),
        });
    }
    bone('PoseRoot');
    bone('Approach', 'PoseRoot');
    bone('Fall', 'PoseRoot', [a.center, a.ground]);
    bone('Hips', 'Fall', a.hips);
    bone('Chest', 'Hips', a.chest);
    bone('Head', 'Chest', a.head);
    bone('Focus', 'Chest', a.focus);
    bone('AttackTip', 'Focus', a.tip);
    bone('Aim', 'Chest', a.aim);
    bone('FrontFoot', 'Fall', a.feet[0]);
    bone('RearFoot', 'Fall', a.feet[1]);
    const uvs = [],
        verts = [],
        neutral = [],
        influences = [],
        tris = [],
        seen = new Map();
    const xs = [0],
        ys = [0];
    for (let x = 18; x < width; x += 18) xs.push(x);
    xs.push(width);
    for (let y = 18; y < height; y += 18) ys.push(y);
    ys.push(height);
    function vertex(x, y) {
        const key = y * 65536 + x;
        if (seen.has(key)) return seen.get(key);
        const sx = x + left,
            sy = y + top,
            p = world([sx, sy]),
            weights = a.weights(sx, sy);
        const leg = smooth(a.knee - 62, a.knee + 74, sy),
            rem = (1 - weights.focus) * (1 - weights.head);
        const named = [
            ['Focus', weights.focus],
            ['Head', (1 - weights.focus) * weights.head],
            ['Chest', rem * weights.chest],
            ['Hips', rem * (1 - weights.chest) * (1 - leg)],
            [sx < a.center ? 'FrontFoot' : 'RearFoot', rem * (1 - weights.chest) * leg],
        ].filter(([, w]) => w > 0.001);
        const total = named.reduce((n, [, w]) => n + w, 0);
        const inf = named.map(([name, w]) => [
            bones.findIndex((b) => b.name === name),
            round(p[0] - bind[name][0]),
            round(p[1] - bind[name][1]),
            round(w / total),
        ]);
        const i = neutral.length;
        seen.set(key, i);
        neutral.push(p);
        uvs.push(round(x / width), round(y / height));
        verts.push(inf.length, ...inf.flat());
        influences.push(inf);
        return i;
    }
    // Retain edge cells for rendering; transparent texels are never part of a painted rectangle.
    for (let row = 0; row < ys.length - 1; row++)
        for (let col = 0; col < xs.length - 1; col++) {
            const x = xs[col],
                y = ys[row],
                r = xs[col + 1],
                b = ys[row + 1];
            let painted = false;
            for (let py = y; py < b && !painted; py += 3)
                for (let px = x; px < r; px += 3)
                    if (pixels.data[(py * width + px) * 4 + 3] > 64) {
                        painted = true;
                        break;
                    }
            if (!painted) continue;
            const ids = [vertex(x, y), vertex(r, y), vertex(r, b), vertex(x, b)];
            tris.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
        }
    const { animations, contactPose } = tracks(a);
    const skeleton = {
        skeleton: { spine: '3.8.75', width: width * a.scale, height: height * a.scale },
        bones,
        slots: [{ name: 'silhouette', bone: 'PoseRoot', attachment: 'body' }],
        skins: [
            {
                name: 'default',
                attachments: {
                    silhouette: {
                        body: {
                            type: 'mesh',
                            path: 'body',
                            uvs,
                            triangles: tris,
                            vertices: verts,
                            hull: 0,
                            width,
                            height,
                        },
                    },
                },
            },
        ],
        events: { impact: {}, release: {} },
        animations,
    };
    const contract = {
        schemaVersion: 1,
        actor: a.id,
        sourceSha256: crypto.createHash('sha256').update(png).digest('hex'),
        baseline: -112,
        boneNames: bones.map((b) => b.name),
        neutralVertices: neutral,
        influences,
        triangles: tris,
        contactTip: point(poseMatrices({ bones }, contactPose).AttackTip, 0, 0).map(round),
        contactBone: 'AttackTip',
        approachBone: 'Approach',
        ...(a.ranged ? { flight: a.contact - a.release } : {}),
        motions: {
            idle: { duration: 2.8, loop: true },
            attack: { duration: a.duration, contact: a.contact, loop: false },
            prepare: { duration: 0.65, loop: false },
            hurt: { duration: 0.24, loop: false },
            death: { duration: 0.68, loop: false },
        },
    };
    fs.writeFileSync(path.join(dest, a.id + '.png'), png);
    fs.writeFileSync(
        path.join(dest, a.id + '.atlas'),
        a.id +
            '.png\nsize: ' +
            width +
            ',' +
            height +
            '\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  rotate: false\n  xy: 0, 0\n  size: ' +
            width +
            ', ' +
            height +
            '\n  orig: ' +
            width +
            ', ' +
            height +
            '\n  offset: 0, 0\n  index: -1\n'
    );
    for (const [file, obj] of [
        [a.id, skeleton],
        [a.id + '-motion', contract],
    ])
        fs.writeFileSync(path.join(dest, file + '.json'), JSON.stringify(obj) + '\n');
}
fs.mkdirSync(dest, { recursive: true });
for (const actor of actors) authorActor(actor);

const cardIds = [
    'attack',
    'dodge',
    'knife',
    'evade',
    'repair',
    'heavy',
    'slash',
    'cash',
    'follow_up',
    'shield_push',
    'scrap_shiv',
    'rummage',
];
const art = PNG.sync.read(fs.readFileSync(path.join(source, 'items.png')));
const size = 256,
    atlas = new PNG({ width: 4 * size, height: 3 * size });
const frames = [];
for (const [index, id] of cardIds.entries()) {
    const col = index % 4,
        row = Math.floor(index / 4);
    const cellX = Math.round((col * art.width) / 4),
        cellY = Math.round((row * art.height) / 3);
    const cellW = Math.round(((col + 1) * art.width) / 4) - cellX,
        cellH = Math.round(((row + 1) * art.height) / 3) - cellY;
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const src =
                ((cellY + Math.floor(((y + 0.5) * cellH) / size)) * art.width +
                    cellX +
                    Math.floor(((x + 0.5) * cellW) / size)) *
                4;
            const to = ((row * size + y) * atlas.width + col * size + x) * 4;
            art.data.copy(atlas.data, to, src, src + 4);
            atlas.data[to + 3] = Math.min(255, Math.max(0, ((art.data[src + 3] - 8) * 255) / 242));
        }
    frames.push(
        '<key>' +
            id +
            '</key><dict><key>frame</key><string>{{' +
            col * size +
            ',' +
            row * size +
            '},{256,256}}</string><key>offset</key><string>{0,0}</string><key>rotated</key><false/><key>sourceSize</key><string>{256,256}</string></dict>'
    );
}
fs.writeFileSync(path.join(dest, 'field-items.png'), PNG.sync.write(atlas));
fs.writeFileSync(
    path.join(dest, 'field-items.plist'),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>frames</key><dict>' +
        frames.join('') +
        '</dict><key>metadata</key><dict><key>format</key><integer>2</integer><key>textureFileName</key><string>field-items.png</string><key>size</key><string>{1024,768}</string></dict></dict></plist>\n'
);
