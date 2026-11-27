// The six approved poses share the same scale and forward foot registration.
// The near right fist remains in the original art. The far left arm passes
// behind the cloak as the character lowers into the three-point landing.
const { PNG, identifyParts, extractPart } = require('./bestiary-assets.cjs');

const names = ['release', 'bend', 'drop', 'contact', 'compress', 'settle'];
const times = [0.07, 0.23, 0.4, 0.6, 0.735, 0.94],
    duration = 1.02;
const soles = [
    [398, 549],
    [880, 549],
    [1398, 548],
    [477, 994],
    [950, 994],
    [1473, 994],
];
const scale = 0.8;
const round = (n) => Math.round(n * 10000) / 10000;

// The first three cells contain the registered clean fabric and knee pixels
// for the lower row. The fourth is the foreground fold used between poses.
const coverWidth = 144,
    coverHeight = 210;
const coverOrigins = [
    [167, 769],
    [640, 773],
    [1146, 771],
];
function applyFarArmCover(sheet, atlas) {
    if (
        sheet.width !== 1536 ||
        sheet.height !== 1024 ||
        atlas.width !== coverWidth * 4 ||
        atlas.height !== coverHeight
    )
        throw Error('Unexpected landing artwork registration');
    coverOrigins.forEach(([left, top], i) =>
        PNG.bitblt(atlas, sheet, i * coverWidth, 0, coverWidth, coverHeight, left, top)
    );
}

// Landmarks are source pixels in drawing order. Cast tracks always belong to
// the supporting arm; Free tracks follow the relaxed glove back to its cuff.
// prettier-ignore
const guides={
    Crown:[[280,22],[766,46],[1352,105],[392,632],[861,670],[1365,640]],
    Mask:[[291,76],[784,103],[1372,176],[418,703],[874,744],[1386,716]],
    Chest:[[290,136],[772,161],[1325,228],[380,761],[837,790],[1348,770]],
    CastElbow:[[342,200],[817,255],[1372,330],[314,864],[778,897],[1282,864]],
    CastWrist:[[388,162],[856,237],[1412,376],[326,959],[782,957],[1292,957]],
    CastFist:[[409,129],[876,221],[1425,399],[329,990],[789,991],[1300,991]],
    FreeElbow:[[201,261],[652,278],[1189,292],[248,839],[731,848],[1228,844]],
    FreeWrist:[[201,303],[647,323],[1168,335],[234,873],[704,877],[1203,878]],
    FreeHand:[[216,357],[649,371],[1169,389],[236,930],[707,930],[1206,933]],
    Belt:[[281,238],[740,264],[1274,309],[314,809],[755,831],[1277,814]],
    RearKnee:[[201,395],[670,414],[1205,461],[245,984],[697,986],[1209,986]],
    RearBoot:[[193,523],[626,525],[1106,523],[113,974],[583,974],[1091,974]],
    FrontKnee:[[313,395],[835,379],[1341,372],[417,809],[889,817],[1395,809]],
    FrontAnkle:[[326,504],[812,502],[1333,502],[410,944],[880,946],[1402,945]],
    FrontToe:soles,
    Fold:[[134,338],[584,351],[1082,366],[178,843],[612,854],[1148,880]],
    Train:[[67,492],[501,490],[989,470],[33,951],[473,935],[1006,983]],
};
const axis = {
    Crown: 'Mask',
    Mask: 'Crown',
    Chest: 'Belt',
    CastElbow: 'CastWrist',
    CastWrist: 'CastFist',
    FreeElbow: 'FreeWrist',
    FreeWrist: 'FreeHand',
    Belt: 'Chest',
    RearKnee: 'RearBoot',
    RearBoot: 'RearKnee',
    FrontKnee: 'FrontAnkle',
    Fold: 'Chest',
    Train: 'Fold',
};
function stage(i, [x, y]) {
    return [round(96 + (x - soles[i][0]) * scale), round(2 + (soles[i][1] - y) * scale)];
}
function addLanding({ paint, cover, bone, world, makeMesh, slots, attachments, images }) {
    applyFarArmCover(paint, cover);
    const { cells, ids } = identifyParts(paint, 3, 2);
    const positions = Object.fromEntries(
        Object.entries(guides).map(([name, points]) => [name, points.map((p, i) => stage(i, p))])
    );
    const pins = {},
        bones = {};
    for (const [key, path] of Object.entries(positions)) {
        const name = 'Land' + key,
            base = path[0];
        bone(name, 'PoseRoot', ...base);
        const angles = path.map(([x, y], i) => {
            if (!axis[key]) return 0;
            const [tx, ty] = positions[axis[key]][i];
            return Math.atan2(ty - y, tx - x);
        });
        const turns = angles.map((a) =>
            round(((((a - angles[0]) * 180) / Math.PI + 540) % 360) - 180)
        );
        bones[name] = {
            translate: path.map(([x, y], i) => ({
                time: times[i],
                x: round(x - base[0]),
                y: round(y - base[1]),
            })),
            rotate: turns.map((angle, i) => ({ time: times[i], angle })),
        };
        pins[key] = {
            index: world.get(name).index,
            path,
            angles: turns.map((t) => (t * Math.PI) / 180),
        };
    }
    const body = 'landing-body',
        visibility = {};
    const switches = times.map((t, i) => (i === 0 ? 0.065 : round((times[i - 1] + t) / 2)));
    for (const slot of slots)
        visibility[slot.name] = { attachment: [{ time: switches[0], name: null }] };
    slots.push({ name: body, bone: 'PoseRoot' });
    attachments[body] = {};
    visibility[body] = { attachment: names.map((name, i) => ({ time: switches[i], name })) };
    visibility[body].attachment.push({ time: duration, name: names.at(-1) });

    // In each drawing's own key pose the weighted vertices reconstruct its
    // original pixels. Between drawings the neighboring landmarks carry them.
    const allPins = Object.keys(pins);
    const visibleWhileKneeling = allPins.filter((name) => !name.startsWith('Free'));
    function weightsAt(i, image, origin) {
        const pinNames = i < 3 ? allPins : visibleWhileKneeling;
        return (u, v) => {
            const [x, y] = stage(i, [origin[0] + u * image.width, origin[1] + v * image.height]);
            const near = pinNames
                .map((k) => {
                    const p = pins[k],
                        dx = x - p.path[i][0],
                        dy = y - p.path[i][1];
                    return { p, dx, dy, d: dx * dx + dy * dy };
                })
                .sort((a, b) => a.d - b.d)
                .slice(0, 4);
            const weights = near.map((q) => 1 / (q.d + 9) ** 1.65),
                sum = weights.reduce((a, b) => a + b, 0),
                result = [near.length];
            near.forEach(({ p, dx, dy }, j) => {
                const c = Math.cos(-p.angles[i]),
                    s = Math.sin(-p.angles[i]);
                result.push(
                    p.index,
                    round(c * dx - s * dy),
                    round(s * dx + c * dy),
                    weights[j] / sum
                );
            });
            return result;
        };
    }
    names.forEach((name, i) => {
        const { image, sourceXYWH } = extractPart(paint, ids, cells[i]);
        const region = 'landing-' + name;
        images.set(region, image);
        attachments[body][name] = makeMesh(region, image, 24, 26, weightsAt(i, image, sourceXYWH));
    });

    // The actual cloth edge sweeps across the free sleeve after drawing three.
    // Drawing four already includes the occlusion, as does a sampled end pose.
    const edge = 'landing-cloak-cover';
    const cloth = new PNG({ width: coverWidth, height: coverHeight });
    PNG.bitblt(cover, cloth, coverWidth * 3, 0, coverWidth, coverHeight, 0, 0);
    images.set(edge, cloth);
    slots.push({ name: edge, bone: 'PoseRoot' });
    attachments[edge] = {};
    const weights = weightsAt(2, cloth, [1115, 201]);
    const reveal = { sleeve: 0.55, cuff: 0.8, hand: 1 };
    for (const [name, depth] of Object.entries(reveal)) {
        const uv = (u, v) => [u, v * (depth === 1 ? 1 : Math.min(1, depth + 0.37 * (0.5 - u)))];
        attachments[edge][name] = makeMesh(edge, cloth, 10, 12, weights, uv);
    }
    visibility[edge] = {
        attachment: [
            { time: 0.422, name: 'sleeve' },
            { time: 0.455, name: 'cuff' },
            { time: 0.482, name: 'hand' },
            { time: switches[3], name: null },
        ],
    };
    return { bones, slots: visibility };
}
module.exports = { addLanding, duration, applyFarArmCover };
