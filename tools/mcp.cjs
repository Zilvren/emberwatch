const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const project = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(project, '.pink/settings.json'), 'utf8'));
const engineRoot = path.join(process.env.APPDATA, 'cocos-default', `cocos-${settings['cocos.engine.version']}`);
const load = createRequire(path.join(engineRoot, 'package.json'));
const { Client } = load('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = load('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { discoverProjectBackend } = load('./dist/core/project-backend/ownership.js');

async function main() {
    const backend = await discoverProjectBackend(project);
    if (!backend || backend.state !== 'ready' || !backend.mcpUrl) {
        throw new Error('This project has no ready MCP backend. Start npm run mcp first.');
    }
    const client = new Client({ name: 'pink-game-development', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(backend.mcpUrl)));
    try {
        const [command, name, inputFile] = process.argv.slice(2);
        if (command === 'list' || command === 'schema') {
            const { tools } = await client.listTools();
            console.log(JSON.stringify(command === 'list' ? tools.map(t => t.name)
                : tools.filter(t => t.name === name).map(t => ({ name:t.name, description:t.description, inputSchema:t.inputSchema })), null, 2));
        } else if (command === 'call') {
            const args = inputFile ? JSON.parse(fs.readFileSync(path.resolve(project, inputFile), 'utf8')) : {};
            const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
            const data = response.structuredContent ?? response.content;
            console.log(JSON.stringify(data, null, 2));
            if (response.isError || (data.result?.code && data.result.code !== 200)) process.exitCode = 1;
        } else {
            throw new Error('Usage: node tools/mcp.cjs list | schema TOOL | call TOOL [JSON_FILE]');
        }
    } finally { await client.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
