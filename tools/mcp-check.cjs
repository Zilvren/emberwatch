const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const project = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(project, '.pink/settings.json'), 'utf8'));
const engineRoot = path.join(process.env.APPDATA, 'cocos-default',
    `cocos-${settings['cocos.engine.version']}`);
const engineRequire = createRequire(path.join(engineRoot, 'package.json'));
const { Client } = engineRequire('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = engineRequire('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { discoverProjectBackend } = engineRequire('./dist/core/project-backend/ownership.js');

async function main() {
    const client = new Client({ name: 'the-end-scene-verification', version: '1.0.0' });
    try {
        const backend = await discoverProjectBackend(project);
        const endpoint = process.env.PINK_MCP_URL ?? backend?.mcpUrl;
        if (!endpoint) throw new Error('Start npm run mcp first, or set PINK_MCP_URL.');
        const url = new URL(endpoint);
        if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
        await client.connect(new StreamableHTTPClientTransport(url));
        const result = await client.listTools();
        const sceneOpen = await client.callTool({ name: 'scene-open', arguments: {
            options: { dbURLOrUUID: 'db://assets/TheEnd.scene', includeChildren: true },
        } });
        if (sceneOpen.isError) throw new Error(JSON.stringify(sceneOpen.content));
        const backgroundNode = await client.callTool({ name: 'scene-query-node', arguments: {
            options: { path: 'Canvas/GameRoot', includeChildren: true, includeComponents: true },
        } });
        if (backgroundNode.isError) throw new Error(JSON.stringify(backgroundNode.content));
        const opened = sceneOpen.structuredContent.result;
        const queried = backgroundNode.structuredContent.result;
        if (opened.code !== 200 || queried.code !== 200) {
            throw new Error('MCP scene open/query failed: ' + JSON.stringify({ opened, queried }));
        }
        const report = { connected: true, toolCount: result.tools.length,
            tools: result.tools.map(tool => tool.name), sceneOpen: opened,
            gameNode: queried };
        fs.mkdirSync(path.join(project, 'output'), { recursive: true });
        fs.writeFileSync(path.join(project, 'output/game-mcp.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ connected: true, toolCount: report.toolCount, scene: opened.data.assetUrl, gameRootChildren: queried.data.children?.length, report: 'output/game-mcp.json' }, null, 2));
    } finally {
        await client.close();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
