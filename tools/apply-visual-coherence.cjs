// Explicit authoring on current resources. Never runs during a normal game build.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2];
const environments = ['street', 'depot', 'shelter'];
const screens = [
    'JournalScreen',
    'MapScreen',
    'BattleScreen',
    'RewardScreen',
    'RestScreen',
    'ShelterScreen',
    'DayTwoScreen',
    'FailureScreen',
];
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, data) =>
    fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
function pngSize(file) {
    const data = fs.readFileSync(path.join(root, file));
    if (data.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error('Expected PNG: ' + file);
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
if (mode === '--prepare') {
    for (const environment of environments) {
        const stem = 'field-sketch-' + environment + '-v2',
            file = stem + '.png';
        const { width, height } = pngSize('assets/resources/art/' + file);
        const plist =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
            `<plist version="1.0"><dict><key>frames</key><dict><key>cover</key><dict><key>frame</key><string>{{0,0},{${width},${height}}}</string><key>offset</key><string>{0,0}</string><key>rotated</key><false/><key>sourceSize</key><string>{${width},${height}}</string></dict></dict><key>metadata</key><dict><key>format</key><integer>2</integer><key>textureFileName</key><string>${file}</string><key>realTextureFileName</key><string>${file}</string><key>size</key><string>{${width},${height}}</string></dict></dict></plist>\n`;
        fs.writeFileSync(path.join(root, 'assets/resources/art', stem + '.plist'), plist);
        console.log(stem + ': prepared ' + width + 'x' + height);
    }
    process.exit(0);
}
if (mode !== '--apply') throw Error('Use --prepare, import through Pink, then --apply.');

const N = require('./native-assets.cjs');
const { Graph, script, ref, asset, color, cleanComponent, graphicTemplate } = N;
const colors = {
    canvas: '#e9e4d9',
    paper: '#e2dac7',
    paperShade: '#c7c1af',
    paperSelected: '#e8d7ad',
    ink: '#3e4237',
    muted: '#5c6354',
    line: '#727263',
    lineSoft: '#b3b09a',
    ochre: '#b69b70',
    olive: '#8c927a',
    brown: '#aa947e',
    danger: '#8c5547',
    disabled: '#cac7bc',
};
const fieldFile = 'assets/resources/ui/field-card-theme.json';
const field = read(fieldFile);
const nativeTheme = asset(read(fieldFile + '.meta').uuid, 'cc.JsonAsset');
const replacements = new Map(
    Object.entries({
        ded2b6: 'e2dac7',
        e6dcc6: 'e2dac7',
        f2eadb: 'e2dac7',
        c5bea2: 'c7c1af',
        ded1bb: 'c7c1af',
        e2d1a8: 'e8d7ad',
        ece0ca: 'e8d7ad',
        454637: '3e4237',
        454238: '3e4237',
        '535b43': '485040',
        '686b52': '5c6354',
        626650: '5c6354',
        '6b6553': '727263',
        '6f6757': '727263',
        b0a68b: 'b3b09a',
        b3a68e: 'b3b09a',
        '8b816b': '727263',
        eadfc7: 'eee7d8',
        eddfc6: 'eee7d8',
    })
);
const affected = [
    ...screens.map((name) => 'assets/prefabs/screens/' + name + '.prefab'),
    ...['HUD', 'HelpPopup', 'LogPopup', 'ConfirmPopup', 'InventoryPopup'].map(
        (name) => 'assets/prefabs/ui/' + name + '.prefab'
    ),
    'assets/prefabs/cards/HandCard.prefab',
    'assets/prefabs/cards/RewardCard.prefab',
    fieldFile,
    'assets/resources/ui/theme.json',
    'assets/resources/ui/immersive-theme.json',
];
// Keep a pre-authoring copy for comparison without ever loading it as a generation baseline.
for (const file of affected) {
    const backup = path.join(root, 'temp/coherence-pass-01/before', file);
    if (!fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(path.join(root, file), backup);
    }
}
const primary = {
    fill: '#c1ae87',
    hover: '#cfbd98',
    pressed: '#a89470',
    line: '#857b61',
    activeLine: '#665f4a',
    text: '#252c24',
};
const secondary = {
    fill: colors.paper,
    hover: '#eae2d0',
    pressed: '#cfc6b2',
    line: '#88836d',
    activeLine: '#716d58',
    text: colors.ink,
};
for (const file of [fieldFile, 'assets/resources/ui/theme.json']) {
    const theme = read(file);
    theme.colors = { ...theme.colors, ...colors };
    theme.button.variants.primary = { ...primary };
    theme.button.variants.secondary = { ...secondary };
    theme.button.focusLine = colors.ochre;
    theme.button.darkQuietText = '#f1ecdf';
    write(file, theme);
}
const immersive = read('assets/resources/ui/immersive-theme.json');
immersive.colors = {
    ...immersive.colors,
    canvas: colors.canvas,
    ink: '#eee7d8',
    muted: '#d0cdbf',
    line: colors.line,
    lineSoft: colors.lineSoft,
    ochre: colors.ochre,
    olive: '#a4ad90',
};
immersive.button.variants.primary = { ...primary };
immersive.button.variants.secondary = { ...secondary };
immersive.button.variants.quiet.text = '#eee7d8';
immersive.button.darkQuietText = '#f1ecdf';
write('assets/resources/ui/immersive-theme.json', immersive);

const frames = Object.fromEntries(
    environments.map((environment) => {
        const file = 'assets/resources/art/field-sketch-' + environment + '-v2.plist';
        const meta = read(file + '.meta');
        const frame = Object.values(meta.subMetas).find((value) => value.name === 'cover');
        if (!meta.imported || !frame?.uuid)
            throw Error('Import the new atlas through Pink first: ' + file);
        return [environment, asset(frame.uuid, 'cc.SpriteFrame')];
    })
);
// A script must likewise have its actual SDK-imported UUID before native serialization.
script('ContactShadow');
const components = (g, node) => (g.graph[node]._components ?? []).map((r) => g.graph[r.__id__]);
const component = (g, node, type) => components(g, node).find((c) => c.__type__ === type);
function tintSerialized(value) {
    if (!value || typeof value !== 'object') return;
    if (value.__type__ === 'cc.Color') {
        const hex = [value.r, value.g, value.b]
            .map((c) => c.toString(16).padStart(2, '0'))
            .join('');
        const replacement = replacements.get(hex);
        if (replacement) Object.assign(value, color(replacement, value.a));
    }
    for (const child of Object.values(value)) tintSerialized(child);
}
function override(g, instance, fileId, property, value) {
    let target = g.graph.findIndex(
        (o) => o.__type__ === 'cc.TargetInfo' && o.localID?.length === 1 && o.localID[0] === fileId
    );
    if (target < 0) target = g.add({ __type__: 'cc.TargetInfo', localID: [fileId] });
    const existing = instance.propertyOverrides
        .map((r) => g.graph[r.__id__])
        .find(
            (o) =>
                o.targetInfo.__id__ === target &&
                o.propertyPath.length === 1 &&
                o.propertyPath[0] === property
        );
    if (existing) existing.value = value;
    else
        instance.propertyOverrides.push(
            ref(
                g.add({
                    __type__: 'CCPropertyOverrideInfo',
                    targetInfo: ref(target),
                    propertyPath: [property],
                    value,
                })
            )
        );
}
function groundActors(g, world) {
    const shadows = [];
    for (const instanceNode of g.graph.filter((o) => o.__type__ === 'cc.Node' && o._prefab)) {
        const info = g.graph[instanceNode._prefab.__id__];
        if (!info.instance || !info.asset) continue;
        const actorFile = ['PlayerActor', 'WandererActor', 'BruteActor']
            .map((name) => 'assets/prefabs/actors/' + name + '.prefab')
            .find((file) => read(file + '.meta').uuid === info.asset.__uuid__);
        if (!actorFile) continue;
        const source = read(actorFile),
            instance = g.graph[info.instance.__id__];
        const original = source.find((o) => o.__type__ === 'cc.Node' && o._name === 'Shadow');
        override(g, instance, source[original._prefab.__id__].fileId, '_active', false);
        const targetIndex = g.graph.indexOf(instanceNode),
            name = 'ContactShadow-' + targetIndex;
        // Graph pruning can renumber serialized objects. Follow the actual actor reference.
        const existing = g.graph.find(
            (o) => o.__type__ === script('ContactShadow') && o.target?.__id__ === targetIndex
        );
        let node = existing?.node?.__id__ ?? -1;
        if (node < 0) {
            const props = instance.propertyOverrides.map((r) => g.graph[r.__id__]);
            const scale = props.find((p) => p.propertyPath[0] === '_lscale')?.value.x ?? 1;
            node = g.node(
                name,
                world,
                0,
                0,
                (actorFile.includes('Brute') ? 240 : 186) * scale,
                22 * scale
            );
            g.component(node, 'cc.Graphics', cleanComponent(graphicTemplate));
            g.component(node, script('ContactShadow'), {
                target: ref(targetIndex),
                tint: color('373a2f'),
                opacity: 110,
                offsetY: -2,
            });
        }
        shadows.push(node);
    }
    const children = g.graph[world]._children.filter((r) => !shadows.includes(r.__id__));
    const cover = children.findIndex((r) => g.graph[r.__id__]._name === 'cover');
    children.splice(cover + 1, 0, ...shadows.map(ref));
    g.graph[world]._children = children;
}
for (const file of affected.filter((file) => file.endsWith('.prefab'))) {
    const g = new Graph(file, path.basename(file));
    g.graph = read(file);
    g.root = g.graph[0].data.__id__;
    tintSerialized(g.graph);
    const world = g.graph.findIndex((o) => o.__type__ === 'cc.Node' && o._name === 'World');
    if (world >= 0) {
        const name = path.basename(file, '.prefab');
        const environment = ['BattleScreen', 'MapScreen'].includes(name)
            ? 'street'
            : ['RestScreen', 'ShelterScreen', 'DayTwoScreen'].includes(name)
              ? 'shelter'
              : 'depot';
        const cover = g.graph[world]._children.find(
            (r) => g.graph[r.__id__]._name === 'cover'
        ).__id__;
        const sprite = component(g, cover, 'cc.Sprite');
        sprite._spriteFrame = frames[environment];
        sprite._color = color('ffffff');
        const size = pngSize('assets/resources/art/field-sketch-' + environment + '-v2.png');
        component(g, cover, 'cc.UITransform')._contentSize.width = (900 * size.width) / size.height;
        groundActors(g, world);
    }
    for (const item of g.graph) {
        if (item.__type__ === script('SceneShade')) {
            item.top = 150;
            item.bottom = 145;
            item.right = item.right ? 110 : 0;
            item.tint = color('23251f');
        }
        if (item.__type__ === script('DeckStackGraphic')) item.theme = nativeTheme;
        if (item.__type__ === script('CommonPanel')) item.theme = nativeTheme;
        if (item.__type__ === script('MapPointPresentation')) {
            // Unavailable route nodes still contain information the player must read.
            if (item.action) g.graph[item.action.__id__].disabledOpacity = 255;
            Object.assign(item, {
                availableFill: color('c3b58e'),
                visitedFill: color('a2aa91'),
                lockedFill: color('bfc0ae'),
                availableOutline: color('6d7058'),
                normalOutline: color('8d917b'),
            });
            const stack = [item.node.__id__];
            while (stack.length) {
                const n = stack.pop();
                for (const c of components(g, n)) {
                    if (c.__type__ === 'cc.Label') {
                        c._color = color('3e4237');
                        c._enableOutline = false;
                    }
                    if (c.__type__ === script('UIValue')) c.normalColor = color('3e4237');
                }
                stack.push(...(g.graph[n]._children ?? []).map((r) => r.__id__));
            }
        }
    }
    // Preserve every original array index, UUID, fileId, event and native override.
    write(file, g.graph);
}
console.log(
    JSON.stringify({
        screens: screens.length,
        frames,
        materials: colors,
        actorArtAndScaleChanged: false,
    })
);
