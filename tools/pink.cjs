const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(project, '.pink/settings.json'), 'utf8'));
const engineRoot = path.join(process.env.APPDATA, 'cocos-default',
    `cocos-${settings['cocos.engine.version']}`);
const cli = path.join(engineRoot, 'dist/cli.js');
if (!fs.existsSync(cli)) throw new Error(`Pink COCOS CLI not found: ${cli}`);
// Pink's native engine modules are built for its Electron runtime, not system Node.
const runtime = process.env.PINK_EXECUTABLE ?? 'C:/software/work/PinK/PinK.exe';
if (!fs.existsSync(runtime)) throw new Error('Set PINK_EXECUTABLE to the installed PinK.exe path.');
const result = spawnSync(runtime, [path.join(__dirname, 'pink-runtime.cjs'), ...process.argv.slice(2)], {
    cwd: project,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PINK_CLI_ENTRY: cli },
    stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
