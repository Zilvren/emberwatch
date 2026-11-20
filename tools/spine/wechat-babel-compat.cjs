// Project-scoped compatibility for the pinned Cocos 4.0.0-beta.1 WeChat builder.
// Its external-Wasm transform omits a filename and unintentionally loads the
// engine's TypeScript Babel preset. Keep that transform independent of configs.
const fs = require('node:fs');
const path = require('node:path');
const entry = process.env.PINK_CLI_ENTRY;
if (entry && process.env.THE_END_WECHAT_WASM_COMPAT === '1') {
    const sdk = path.dirname(path.dirname(entry));
    const file = path.join(sdk, 'node_modules/@babel/core/lib/transform.js');
    if (fs.existsSync(file)) {
        const transform = require(file);
        const original = transform.transformSync;
        transform.transformSync = function(code, options) {
            if (!options?.filename && String(new Error().stack).includes('external-wasm-loader')) {
                options = { ...options, filename: 'external-wasm.js', babelrc: false, configFile: false };
            }
            return original(code, options);
        };
    }
}
