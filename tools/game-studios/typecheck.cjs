const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const settings = JSON.parse(fs.readFileSync(path.join(root, '.pink/settings.json'), 'utf8'));
if (!process.env.APPDATA)
    throw new Error('Locate the installed Pink SDK before running this Windows adapter.');
const compiler = path.join(
    process.env.APPDATA,
    'cocos-default',
    `cocos-${settings['cocos.engine.version']}`,
    'node_modules/typescript/bin/tsc'
);
if (!fs.existsSync(compiler))
    throw new Error(`Pink SDK TypeScript compiler not found: ${compiler}`);
const result = spawnSync(process.execPath, [compiler, '--noEmit', '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
