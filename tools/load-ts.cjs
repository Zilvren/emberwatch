const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const project = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(project, '.pink/settings.json'), 'utf8'));
const ts = require(path.join(process.env.APPDATA, 'cocos-default', `cocos-${settings['cocos.engine.version']}`, 'node_modules/typescript'));

// Isolated module graph: tests can load different catalogs without sharing state.
function createLoader() {
    const cache = new Map();
    function load(filename) {
        filename = path.resolve(filename);
        if (cache.has(filename)) return cache.get(filename).exports;
        const loaded = new Module(filename, module);
        cache.set(filename, loaded);
        loaded.filename = filename;
        const nativeRequire = Module.createRequire(filename);
        loaded.require = request => {
            const target = request.startsWith('.') ? path.resolve(path.dirname(filename), request + '.ts') : '';
            return target && fs.existsSync(target) ? load(target) : nativeRequire(request);
        };
        const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
        loaded._compile(code, filename);
        return loaded.exports;
    }
    return load;
}
module.exports = { createLoader, ts };
