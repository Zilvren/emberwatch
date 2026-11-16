/** Explicit authoring only. Preserve approved08 texture/geometry and existing prefab identities. */
const fs = require('node:fs'),
    path = require('node:path');
const N = require('./native-assets.cjs');
const output = 'assets/resources/actors/native08',
    animations = 'assets/animations/native08';
const roles = {
    survivor: {
        prefab: 'PlayerActor',
        facing: 1,
        head: [281, 220],
        front: [
            [308, 277],
            [339, 386],
            [353, 439],
            [470, 536],
        ],
        rear: [
            [207, 281],
            [178, 369],
            [166, 430],
            [163, 456],
        ],
        frontMask: [
            [330, 385],
            [358, 384],
            [380, 421],
            [377, 469],
            [339, 475],
            [326, 413],
        ],
        rearMask: [
            [140, 310],
            [209, 317],
            [209, 394],
            [194, 470],
            [137, 470],
            [134, 405],
        ],
        headMask: [
            [186, 109],
            [335, 104],
            [357, 157],
            [333, 226],
            [282, 238],
            [226, 221],
            [183, 189],
        ],
        weapon: (x, y) => x > 342 + Math.max(0, y - 444) * 0.72 && y > 433 && y < 557,
        duration: 0.72,
        contact: 0.34,
        times: [0, 0.1, 0.21, 0.29, 0.34, 0.4, 0.5, 0.62, 0.72],
        peak: {
            Body: -5,
            Head: 2,
            FrontUpperArm: 0,
            FrontForearm: 45,
            FrontHand: 0,
            RearUpperArm: -4,
            RearForearm: 4,
        },
        deathAngle: -84,
    },
    wanderer: {
        prefab: 'WandererActor',
        facing: -1,
        head: [667, 179],
        front: [
            [665, 238],
            [625, 398],
            [592, 512],
            [589, 550],
        ],
        rear: [
            [785, 281],
            [808, 425],
            [825, 507],
            [829, 550],
        ],
        frontMask: [
            [540, 285],
            [655, 285],
            [655, 350],
            [630, 420],
            [606, 480],
            [610, 580],
            [540, 580],
        ],
        rearMask: [
            [788, 305],
            [860, 305],
            [868, 610],
            [797, 610],
            [781, 440],
        ],
        headMask: [
            [558, 64],
            [668, 61],
            [698, 123],
            [697, 172],
            [659, 208],
            [606, 191],
            [571, 161],
        ],
        duration: 0.8,
        contact: 0.38,
        times: [0, 0.12, 0.24, 0.32, 0.38, 0.46, 0.57, 0.69, 0.8],
        peak: {
            Body: 5,
            Head: -3,
            FrontUpperArm: -42,
            FrontForearm: -22,
            FrontHand: 8,
            RearUpperArm: 7,
            RearForearm: -9,
        },
        deathAngle: 82,
    },
    brute: {
        prefab: 'BruteActor',
        facing: -1,
        head: [1126, 202],
        front: [
            [1038, 282],
            [969, 421],
            [971, 503],
            [954, 547],
        ],
        rear: [
            [1345, 279],
            [1385, 422],
            [1372, 507],
            [1368, 548],
        ],
        frontMask: [
            [900, 320],
            [1045, 320],
            [1030, 480],
            [1020, 562],
            [900, 562],
        ],
        rearMask: [
            [1322, 300],
            [1475, 300],
            [1480, 563],
            [1335, 563],
            [1312, 440],
        ],
        headMask: [
            [1000, 0],
            [1210, 0],
            [1210, 205],
            [1080, 242],
            [1010, 190],
        ],
        duration: 0.94,
        contact: 0.46,
        times: [0, 0.15, 0.29, 0.38, 0.46, 0.56, 0.68, 0.82, 0.94],
        peak: {
            Body: 5,
            Head: -2,
            FrontUpperArm: -53,
            FrontForearm: -31,
            FrontHand: 4,
            RearUpperArm: 8,
            RearForearm: -8,
        },
        deathAngle: 87,
    },
};
const round = (n) => Math.round(n * 1e7) / 1e7;
function inPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i],
            b = points[j];
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
            inside = !inside;
    }
    return inside;
}
function chainWeights(x, y, points, names) {
    let total = 0,
        best = { distance: Infinity, s: 0 },
        joints = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i],
            b = points[i + 1],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy),
            t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length))),
            distance = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        if (distance < best.distance) best = { distance, s: total + t * length };
        total += length;
        joints.push(total);
    }
    for (let i = 0; i < names.length - 1; i++) {
        const width = i === 0 ? 17 : 12;
        if (Math.abs(best.s - joints[i]) < width) {
            const t = (best.s - joints[i] + width) / (2 * width),
                smooth = t * t * (3 - 2 * t);
            return [
                [names[i], 1 - smooth],
                [names[i + 1], smooth],
            ];
        }
    }
    const index = joints.findIndex((d) => best.s <= d);
    return [[names[index < 0 ? names.length - 1 : index], 1]];
}
function matrixMultiply(a, b) {
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ];
}
function poseMatrices(definition, pose) {
    const result = [];
    for (const b of definition.boneDefinitions) {
        const a = ((pose[b.name] ?? 0) * Math.PI) / 180,
            c = Math.cos(a),
            s = Math.sin(a),
            parent = b.parentIndex < 0 ? [1, 0, 0, 1, 0, 0] : result[b.parentIndex];
        result.push(
            matrixMultiply(parent, [
                c,
                s,
                -s,
                c,
                b.local[0] + (b.name === 'PoseRoot' ? (pose.x ?? 0) : 0),
                b.local[1] + (b.name === 'PoseRoot' ? (pose.y ?? 0) : 0),
            ])
        );
    }
    return result;
}
function point(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function skinPoints(definition, pose) {
    const matrices = poseMatrices(definition, pose);
    return definition.influences.map((weights) =>
        weights.reduce(
            (p, [bone, x, y, w]) => {
                const v = point(matrices[bone], x, y);
                return [p[0] + v[0] * w, p[1] + v[1] * w];
            },
            [0, 0]
        )
    );
}
function prepareSkin(actor, c) {
    const geometry = N.read('assets/resources/actors/sketch08/' + actor + '-rig.json');
    const vertex = geometry.vertices[0],
        other = geometry.vertices.find((v) => Math.abs(v[0] - vertex[0]) > 20),
        gx = (v) => Math.round(v[2] * 1536),
        gy = (v) => Math.round(v[3] * 1024),
        scale = (other[0] - vertex[0]) / (gx(other) - gx(vertex)),
        ox = vertex[0] - gx(vertex) * scale,
        oy = vertex[1] + gy(vertex) * scale;
    const convert = ([x, y]) => [round(x * scale + ox), round(-y * scale + oy)];
    const raw = [
        ['PoseRoot', null, null],
        ['Body', 'PoseRoot', null],
        ['Head', 'Body', c.head],
        ['FrontUpperArm', 'Body', c.front[0]],
        ['FrontForearm', 'FrontUpperArm', c.front[1]],
        ['FrontHand', 'FrontForearm', c.front[2]],
        ['AttackTip', 'FrontHand', c.front[3]],
        ['RearUpperArm', 'Body', c.rear[0]],
        ['RearForearm', 'RearUpperArm', c.rear[1]],
        ['RearHand', 'RearForearm', c.rear[2]],
    ];
    const boneDefinitions = [];
    for (const [name, parent, source] of raw) {
        const position = source ? convert(source) : name === 'Body' ? [0, -112] : [0, 0],
            parentIndex = boneDefinitions.findIndex((b) => b.name === parent),
            p = parentIndex < 0 ? [0, 0] : boneDefinitions[parentIndex].bind;
        boneDefinitions.push({
            name,
            parent,
            parentIndex,
            bind: position,
            local: [round(position[0] - p[0]), round(position[1] - p[1])],
        });
    }
    const index = (name) => boneDefinitions.findIndex((b) => b.name === name);
    const weightsAt = (x, y) => {
        let weights;
        if (c.weapon?.(x, y)) weights = [['FrontHand', 1]];
        else if (inPolygon(x, y, c.headMask)) weights = [['Head', 1]];
        else if (inPolygon(x, y, c.frontMask))
            weights = chainWeights(x, y, c.front, ['FrontUpperArm', 'FrontForearm', 'FrontHand']);
        else if (inPolygon(x, y, c.rearMask))
            weights = chainWeights(x, y, c.rear, ['RearUpperArm', 'RearForearm', 'RearHand']);
        else weights = [['Body', 1]];
        return weights;
    };
    const grouped = new Map(),
        groupCounts = {};
    const classify = (v) => weightsAt(v[2] * 1536, v[3] * 1024).sort((a, b) => b[1] - a[1])[0][0];
    const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
    const addPart = (name, triangle) => {
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(triangle);
    };
    const boundary = (a, b, label) => {
        let lo = 0,
            hi = 1;
        for (let i = 0; i < 16; i++) {
            const mid = (lo + hi) / 2;
            if (classify(mix(a, b, mid)) === label) lo = mid;
            else hi = mid;
        }
        return mix(a, b, (lo + hi) / 2);
    };
    function partition(triangle, depth = 0) {
        const labels = triangle.map(classify),
            unique = [...new Set(labels)],
            center = triangle[0].map((value, i) => (value + triangle[1][i] + triangle[2][i]) / 3);
        if (unique.length === 1) {
            if (depth < 2 && classify(center) !== unique[0]) {
                for (let i = 0; i < 3; i++)
                    partition([triangle[i], triangle[(i + 1) % 3], center], depth + 1);
            } else addPart(unique[0], triangle);
            return;
        }
        if (unique.length === 2) {
            const solo = labels.findIndex(
                    (label) => labels.filter((v) => v === label).length === 1
                ),
                i = solo,
                j = (solo + 1) % 3,
                k = (solo + 2) % 3,
                ac = boundary(triangle[i], triangle[j], labels[i]),
                bc = boundary(triangle[i], triangle[k], labels[i]);
            addPart(labels[i], [triangle[i], ac, bc]);
            addPart(labels[j], [ac, triangle[j], triangle[k]]);
            addPart(labels[j], [ac, triangle[k], bc]);
            return;
        }
        const edges = triangle.map((v, i) => boundary(v, triangle[(i + 1) % 3], labels[i]));
        for (let i = 0; i < 3; i++) {
            addPart(labels[i], [triangle[i], edges[i], center]);
            addPart(labels[i], [triangle[i], center, edges[(i + 2) % 3]]);
        }
    }
    for (let t = 0; t < geometry.indices.length; t += 3)
        partition(geometry.indices.slice(t, t + 3).map((i) => geometry.vertices[i]));
    const renderGeometry = {
            ...geometry,
            vertices: [],
            indices: [],
            sourceGeometry: '../sketch08/' + actor + '-rig.json',
            partGroups: [],
        },
        influences = [];
    const vertexLookup = new Map();
    function emitVertex(v, bone) {
        const key = bone + ':' + v.map(round).join(',');
        let vertex = vertexLookup.get(key);
        if (vertex === undefined) {
            vertex = renderGeometry.vertices.length;
            const bind = boneDefinitions[bone].bind;
            renderGeometry.vertices.push(v);
            influences.push([[bone, round(v[0] - bind[0]), round(v[1] - bind[1]), 1]]);
            vertexLookup.set(key, vertex);
        }
        renderGeometry.indices.push(vertex);
    }
    const overlaps = [
        ['Head', c.head],
        ['FrontUpperArm', c.front[0]],
        ['RearUpperArm', c.rear[0]],
        ['FrontForearm', c.front[1]],
        ['FrontHand', c.front[2]],
        ['RearForearm', c.rear[1]],
        ['RearHand', c.rear[2]],
    ];
    // Duplicate existing painted joint patches behind the cutouts. At rest every texel still maps
    // to its original position; movement reveals overlap instead of stretching triangles across joints.
    for (const [name, source] of overlaps) {
        const bone = index(boneDefinitions[index(name)].parent),
            bind = boneDefinitions[bone].bind,
            radius = name.endsWith('UpperArm')
                ? actor === 'survivor'
                    ? 35
                    : 80
                : name === 'Head'
                  ? 20
                  : actor === 'brute'
                    ? 30
                    : 19,
            start = renderGeometry.indices.length;
        for (let t = 0; t < geometry.indices.length; t += 3) {
            const vertices = geometry.indices.slice(t, t + 3).map((i) => geometry.vertices[i]),
                cx = vertices.reduce((n, v) => n + gx(v), 0) / 3,
                cy = vertices.reduce((n, v) => n + gy(v), 0) / 3;
            if (Math.hypot(cx - source[0], cy - source[1]) > radius) continue;
            for (const v of vertices) emitVertex(v, bone);
        }
        renderGeometry.partGroups.push({
            name: 'overlap-' + name,
            firstIndex: start,
            indexCount: renderGeometry.indices.length - start,
        });
    }
    const overlapIndices = renderGeometry.indices.length;
    const order = [
        'RearUpperArm',
        'RearForearm',
        'RearHand',
        'Body',
        'Head',
        'FrontUpperArm',
        'FrontForearm',
        'FrontHand',
    ];
    for (const name of order) {
        const triangles = grouped.get(name) ?? [];
        if (!triangles.length) continue;
        const bone = index(name),
            bind = boneDefinitions[bone].bind,
            start = renderGeometry.indices.length;
        for (const triangle of triangles) for (const v of triangle) emitVertex(v, bone);
        groupCounts[name] = triangles.length;
        renderGeometry.partGroups.push({
            name,
            firstIndex: start,
            indexCount: renderGeometry.indices.length - start,
        });
    }
    if (renderGeometry.indices.length <= overlapIndices)
        throw Error('No original source surface was retained');
    if (renderGeometry.vertices.length > 4000)
        throw Error('Native actor exceeds pinned UI vertex-buffer budget');
    renderGeometry.originalTriangleCount = geometry.indices.length / 3;
    renderGeometry.overlapTriangles = overlapIndices / 3;
    fs.writeFileSync(
        path.join(N.root, output, actor + '-geometry.json'),
        JSON.stringify(renderGeometry) + '\n'
    );
    const definition = {
        schemaVersion: 1,
        actor,
        source: '../sketch08/master08-thin.png',
        sourceSha256: geometry.sourceSha256,
        sourcePixelsChanged: false,
        geometry: actor + '-geometry.json',
        sourceGeometry: '../sketch08/' + actor + '-rig.json',
        partGroups: groupCounts,
        baseHeight: geometry.baseHeight,
        facing: c.facing,
        boneDefinitions,
        influences,
        contactTime: c.contact,
        attackDuration: c.duration,
    };
    const bindGround = Math.min(...skinPoints(definition, {}).map((p) => p[1])),
        peak = { ...c.peak };
    peak.y = bindGround - Math.min(...skinPoints(definition, peak).map((p) => p[1]));
    const matrices = poseMatrices(definition, peak);
    definition.contactTip = point(
        matrices[index('FrontHand')],
        ...boneDefinitions[index('AttackTip')].local
    ).map(round);
    const neutral = skinPoints(definition, {});
    definition.neutralMaxError = Math.max(
        ...neutral.map((p, i) =>
            Math.hypot(p[0] - renderGeometry.vertices[i][0], p[1] - renderGeometry.vertices[i][1])
        )
    );
    fs.writeFileSync(
        path.join(N.root, output, actor + '-skin.json'),
        JSON.stringify(definition) + '\n'
    );
    return definition;
}
function writeClip(actor, definition, kind, duration, times, poses, advance = []) {
    if (kind !== 'idle' && kind !== 'death') {
        const ground = Math.min(...skinPoints(definition, {}).map((p) => p[1]));
        poses = poses.map((p) => {
            const pose = { ...p, y: 0 },
                lift = p.y ?? 0;
            pose.y = ground - Math.min(...skinPoints(definition, pose).map((v) => v[1])) + lift;
            return pose;
        });
    }
    const graph = [
        {
            __type__: 'cc.AnimationClip',
            _name: 'Native08_' + actor + '_' + kind,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            sample: 60,
            speed: 1,
            wrapMode: kind === 'idle' ? 2 : 1,
            enableTrsBlending: false,
            _duration: duration,
            _hash: 0,
            _tracks: [],
            _exoticAnimation: null,
            _events:
                kind === 'attack'
                    ? [{ frame: roles[actor].contact, func: 'notifyImpact', params: [] }]
                    : [],
            _embeddedPlayers: [],
            _additiveSettings: null,
            _auxiliaryCurveEntries: [],
        },
    ];
    const add = (o) => (graph.push(o), N.ref(graph.length - 1));
    const curve = (values) => {
        const slopes = values.map((value, i) => {
            if (i === 0 || i === values.length - 1) return 0;
            const left = (value - values[i - 1]) / (times[i] - times[i - 1]),
                right = (values[i + 1] - value) / (times[i + 1] - times[i]);
            if (left * right <= 0) return 0;
            return (
                Math.sign(left) *
                Math.min(
                    Math.abs((left + right) / 2),
                    3 * Math.min(Math.abs(left), Math.abs(right))
                )
            );
        });
        return add({
            __type__: 'cc.RealCurve',
            _times: times,
            _values: values.map((value, i) => ({
                __type__: 'cc.RealKeyframeValue',
                interpolationMode: 2,
                tangentWeightMode: 0,
                value,
                rightTangent: slopes[i],
                rightTangentWeight: 0,
                leftTangent: slopes[i],
                leftTangentWeight: 0,
                easingMethod: 0,
            })),
            _preExtrapolation: 1,
            _postExtrapolation: 1,
        });
    };
    const paths = {};
    for (const b of definition.boneDefinitions)
        paths[b.name] = (b.parent ? paths[b.parent] : 'Visual/NativeBones') + '/' + b.name;
    function real(paths, values) {
        const p = add({ __type__: 'cc.animation.TrackPath', _paths: paths }),
            channel = add({ __type__: 'cc.animation.Channel', _curve: curve(values) });
        graph[0]._tracks.push(
            add({
                __type__: 'cc.animation.RealTrack',
                _binding: { __type__: 'cc.animation.TrackBinding', path: p },
                _channel: channel,
            })
        );
    }
    for (const b of definition.boneDefinitions)
        real(
            [add({ __type__: 'cc.animation.HierarchyPath', path: paths[b.name] }), 'angle'],
            poses.map((p) => p[b.name] ?? 0)
        );
    const root = add({ __type__: 'cc.animation.HierarchyPath', path: paths.PoseRoot }),
        rootPath = add({ __type__: 'cc.animation.TrackPath', _paths: [root, 'position'] }),
        channels = ['x', 'y', 'z', 'w'].map((axis) =>
            add({ __type__: 'cc.animation.Channel', _curve: curve(poses.map((p) => p[axis] ?? 0)) })
        );
    graph[0]._tracks.push(
        add({
            __type__: 'cc.animation.VectorTrack',
            _binding: { __type__: 'cc.animation.TrackBinding', path: rootPath },
            _channels: channels,
            _nComponents: 3,
        })
    );
    real(
        [
            add({ __type__: 'cc.animation.HierarchyPath', path: 'Visual' }),
            add({ __type__: 'cc.animation.ComponentPath', component: 'NativeActorSkin' }),
            'breath',
        ],
        poses.map((p) => p.breath ?? 0)
    );
    real(
        [
            add({ __type__: 'cc.animation.ComponentPath', component: 'ActorPresentation' }),
            'approach',
        ],
        poses.map((p, i) => advance[i] ?? 0)
    );
    const file = animations + '/Native08_' + actor + '_' + kind + '.anim';
    N.ensureMeta(file, 'animation-clip');
    N.write(file, graph);
}
function poses(c) {
    const factor = (k) =>
        Object.fromEntries(Object.entries(c.peak).map(([bone, value]) => [bone, value * k]));
    return [
        {},
        {
            Body: -c.facing * 2,
            Head: c.facing,
            FrontUpperArm: -c.facing * 7,
            RearUpperArm: c.facing * 5,
        },
        { ...factor(0.25), y: 5 },
        factor(0.8),
        c.peak,
        { ...c.peak, Body: c.peak.Body * 1.1 },
        factor(0.55),
        factor(0.16),
        {},
    ];
}
function prepare() {
    fs.mkdirSync(path.join(N.root, output), { recursive: true });
    fs.mkdirSync(path.join(N.root, animations), { recursive: true });
    for (const [actor, c] of Object.entries(roles)) {
        const d = prepareSkin(actor, c);
        // Native linear curves get enough timed authored poses; these are not separately drawn frames.
        const idleTimes = Array.from({ length: 25 }, (_, i) => (i * 3) / 24),
            idle = idleTimes.map((t) => ({ breath: (1 - Math.cos((t / 3) * Math.PI * 2)) / 2 }));
        writeClip(actor, d, 'idle', 3, idleTimes, idle);
        writeClip(
            actor,
            d,
            'attack',
            c.duration,
            c.times,
            poses(c),
            [0, 0, 0.18, 0.8, 1, 1, 0.67, 0.16, 0]
        );
        writeClip(
            actor,
            d,
            'hurt',
            0.36,
            [0, 0.07, 0.16, 0.25, 0.36],
            [
                {},
                { Body: -c.facing * 5, Head: c.facing * 2, FrontForearm: c.facing * 6 },
                { Body: -c.facing * 8, Head: c.facing * 3 },
                { Body: -c.facing * 3 },
                {},
            ]
        );
        writeClip(
            actor,
            d,
            'prepare',
            0.65,
            [0, 0.15, 0.35, 0.5, 0.65],
            [
                {},
                { Body: c.facing * -1, FrontUpperArm: -c.facing * 5 },
                { Body: c.facing * -2, FrontForearm: -c.facing * 12 },
                { Body: c.facing * -1, FrontForearm: -c.facing * 5 },
                {},
            ]
        );
        const deathTimes = [0, 0.14, 0.32, 0.55, 0.82, 1.06],
            deathPoses = [
                {},
                { PoseRoot: c.deathAngle * 0.1, Body: -c.facing * 5 },
                { PoseRoot: c.deathAngle * 0.3, Body: -c.facing * 8, FrontForearm: 15 },
                { PoseRoot: c.deathAngle * 0.64, Body: -c.facing * 8, FrontForearm: 18 },
                { PoseRoot: c.deathAngle, Body: -c.facing * 6, Head: c.facing * 5 },
                { PoseRoot: c.deathAngle, Body: -c.facing * 6, Head: c.facing * 5 },
            ];
        deathPoses.forEach((p) => {
            p.y = -112 - Math.min(...skinPoints(d, p).map((v) => v[1]));
        });
        writeClip(actor, d, 'death', 1.06, deathTimes, deathPoses);
        console.log(
            JSON.stringify({
                actor,
                bones: d.boneDefinitions.length,
                vertices: d.influences.length,
                neutralError: d.neutralMaxError,
                contactTime: d.contactTime,
                contactTip: d.contactTip,
            })
        );
    }
}
function connect(actor, refresh = false) {
    const c = roles[actor];
    if (!c) throw Error('Unknown actor');
    const file = 'assets/prefabs/actors/' + c.prefab + '.prefab',
        g = new N.Graph(file, c.prefab);
    g.graph = N.read(file);
    g.root = g.graph[0].data.__id__;
    const graph = g.graph,
        visual = graph.findIndex((o) => o.__type__ === 'cc.Node' && o._name === 'Visual');
    const previous = graph.findIndex((o) => o.__type__ === 'cc.Node' && o._name === 'NativeBones');
    if (previous >= 0) {
        if (!refresh) throw Error('Already connected ' + actor);
        graph[visual]._children = graph[visual]._children.filter((r) => r.__id__ !== previous);
    }
    const data = N.read(output + '/' + actor + '-skin.json'),
        container = g.node('NativeBones', visual, 0, 0, 0, 0),
        nodes = {};
    for (const b of data.boneDefinitions)
        nodes[b.name] = g.node(
            b.name,
            b.parent ? nodes[b.parent] : container,
            b.local[0],
            b.local[1],
            0,
            0
        );
    const sprite = graph[visual]._components
        .map((r) => graph[r.__id__])
        .find(
            (o) =>
                o.__type__ === N.script('StableActorSprite') ||
                o.__type__ === N.script('NativeActorSkin')
        );
    Object.assign(sprite, {
        __type__: N.script('NativeActorSkin'),
        geometry: N.asset(N.uuid(output + '/' + actor + '-geometry.json'), 'cc.JsonAsset'),
        skin: N.asset(N.uuid(output + '/' + actor + '-skin.json'), 'cc.JsonAsset'),
        boneNodes: data.boneDefinitions.map((b) => N.ref(nodes[b.name])),
    });
    graph[visual]._active = true;
    const old = graph.find((o) => o.__type__ === 'cc.Node' && o._name === 'PaperDoll');
    if (old) old._active = false;
    const oldRig = graph.find((o) => o.__type__ === N.script('PaperDollRig'));
    if (oldRig) oldRig._enabled = false;
    const presentation = graph.find((o) => o.__type__ === N.script('ActorPresentation'));
    presentation.paperDoll = null;
    for (const kind of ['idle', 'attack', 'hurt', 'prepare', 'death'])
        presentation[kind] = N.asset(
            N.uuid(animations + '/Native08_' + actor + '_' + kind + '.anim'),
            'cc.AnimationClip'
        );
    for (const [key, kind] of [
        ['armedIdle', 'idle'],
        ['armedAttack', 'attack'],
        ['armedHurt', 'hurt'],
    ])
        presentation[key] = presentation[kind];
    const animation = graph.find((o) => o.__type__ === 'cc.Animation');
    animation._clips = ['idle', 'attack', 'hurt', 'prepare', 'death'].map((k) => presentation[k]);
    animation._defaultClip = presentation.idle;
    animation.playOnLoad = false;
    g.save();
    console.log('Connected ' + actor + ' to existing native Actor prefab.');
}
if (require.main === module) {
    if (process.argv.includes('--prepare')) prepare();
    else {
        const actor = process.argv[2];
        connect(actor, process.argv.includes('--refresh'));
    }
}
module.exports = { roles, poseMatrices, skinPoints, prepareSkin };
