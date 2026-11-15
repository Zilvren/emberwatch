// Read project-owned facts; never import, regenerate or rewrite native assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function projectPath(root, relative) {
    if (path.isAbsolute(relative)) throw new Error(`Expected a relative project path: ${relative}`);
    const absolute = path.resolve(root, relative);
    const within = path.relative(root, absolute);
    if (within === '..' || within.startsWith(`..${path.sep}`))
        throw new Error(`Path escapes project: ${relative}`);
    let parent = absolute;
    while (parent !== root) {
        if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
            throw new Error(`Do not follow a project symlink: ${relative}`);
        parent = path.dirname(parent);
    }
    return absolute;
}

function filesAt(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Do not follow a project symlink: ${file}`);
    if (!stat.isDirectory()) return [file];
    return fs
        .readdirSync(file)
        .sort()
        .flatMap((name) => filesAt(path.join(file, name)));
}

function inspect(project) {
    const root = fs.realpathSync(project);
    const readJson = (relative) => JSON.parse(fs.readFileSync(projectPath(root, relative), 'utf8'));
    const profile = readJson('tools/game-studios/pink-cocos.project.json');
    if (profile.schemaVersion !== 1 || profile.engine.name !== 'Pink/Cocos')
        throw new Error('Unsupported project adapter');
    const settings = readJson(profile.engine.settings);
    const version = settings['cocos.engine.version'];
    if (!version) throw new Error('No installed Pink/Cocos engine version in project settings');
    const pkg = readJson('package.json');
    const build = readJson(profile.paths.buildConfig);
    const sceneMeta = readJson(profile.paths.mainScene + '.meta');
    const assets = filesAt(projectPath(root, 'assets'));
    const extensions = ['.scene', '.prefab', '.anim', '.meta'];
    const nativeAssets = Object.fromEntries(
        extensions.map((ext) => [ext, assets.filter((file) => path.extname(file) === ext).length])
    );
    const protectedFiles = [
        ...new Set(
            profile.protectedPaths.flatMap((relative) => filesAt(projectPath(root, relative)))
        ),
    ].sort();
    const hashes = Object.fromEntries(
        protectedFiles.map((file) => [
            path.relative(root, file).replaceAll(path.sep, '/'),
            crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        ])
    );
    const images = profile.referenceImages.map((relative) => {
        const bytes = fs.readFileSync(projectPath(root, relative));
        if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            throw new Error(`Expected PNG: ${relative}`);
        return {
            file: relative,
            width: bytes.readUInt32BE(16),
            height: bytes.readUInt32BE(20),
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
    });
    const engineRoot = process.env.APPDATA
        ? path.join(process.env.APPDATA, 'cocos-default', `cocos-${version}`)
        : null;
    const compiler = engineRoot ? path.join(engineRoot, 'node_modules/typescript/bin/tsc') : null;
    const warnings = [];
    if (version !== profile.engine.validatedVersion)
        warnings.push('Engine version changed; revalidate SDK-specific rendering/import behavior.');
    if (build.startScene !== sceneMeta.uuid)
        warnings.push('Build startScene does not match the configured main scene UUID.');
    const nativeJson = assets.filter((file) =>
        ['.scene', '.prefab', '.anim'].includes(path.extname(file))
    );
    for (const file of nativeJson) JSON.parse(fs.readFileSync(file, 'utf8'));
    const missingMetadata = nativeJson
        .filter((file) => !fs.existsSync(file + '.meta'))
        .map((file) => path.relative(root, file).replaceAll(path.sep, '/'));
    if (missingMetadata.length)
        warnings.push(
            'Some native assets have no adjacent .meta file; inspect them before integration.'
        );
    return {
        schemaVersion: 1,
        project: profile.project,
        recordedAt: new Date().toISOString(),
        engine: {
            name: profile.engine.name,
            version,
            sdkCliAvailable: !!engineRoot && fs.existsSync(path.join(engineRoot, 'dist/cli.js')),
            typeScriptCompiler: compiler && fs.existsSync(compiler) ? compiler : null,
        },
        platform: build.platform,
        mainScene: profile.paths.mainScene,
        mainSceneUuid: sceneMeta.uuid,
        sceneMatchesBuild: build.startScene === sceneMeta.uuid,
        buildScript: pkg.scripts['build:web'],
        nativeAssets,
        nativeJsonParsed: nativeJson.length,
        missingMetadata,
        images,
        protectedFiles: hashes,
        warnings,
    };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const value = (name) => {
        const index = args.indexOf(name);
        if (index < 0) return null;
        if (!args[index + 1] || args[index + 1].startsWith('--'))
            throw new Error(`Missing value for ${name}`);
        return args[index + 1];
    };
    for (const arg of args.filter((item) => item.startsWith('--')))
        if (!['--project', '--out'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    const root = path.resolve(value('--project') ?? process.cwd());
    const result = inspect(root);
    const out = value('--out');
    if (out) {
        const target = projectPath(root, out);
        const relative = path.relative(root, target).replaceAll(path.sep, '/');
        if (!relative.startsWith('temp/') && !relative.startsWith('output/playwright/'))
            throw new Error('Inspection output must be under temp/ or output/playwright/');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
        console.log(
            JSON.stringify({
                file: out,
                engine: result.engine,
                nativeAssets: result.nativeAssets,
                protectedFiles: Object.keys(result.protectedFiles).length,
                warnings: result.warnings,
            })
        );
    } else console.log(JSON.stringify(result, null, 2));
}

module.exports = { inspect, projectPath };
