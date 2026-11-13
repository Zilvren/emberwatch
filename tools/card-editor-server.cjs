const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createLoader, ts } = require('./load-ts.cjs');
const project = path.resolve(__dirname, '..');
const schemaPath = path.join(project, 'assets/CardCatalog.ts');
const { validateCatalog, CatalogError } = createLoader()(schemaPath);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

function createEditorServer(options = {}) {
    const catalogFile = options.catalogFile ?? path.join(project, 'assets/resources/data/cards.json');
    const backupDirectory = options.backupDirectory ?? path.join(project, 'temp/card-editor-backups');
    const revision = data => crypto.createHash('sha256').update(data).digest('hex');
    const read = () => {
        const text = fs.readFileSync(catalogFile, 'utf8');
        return { catalog: validateCatalog(JSON.parse(text)), revision: revision(text) };
    };
    const json = (response, status, data) => {
        response.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(data));
    };
    const sendFile = (response, file) => {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: '文件不存在。' });
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
    };
    const body = request => new Promise((resolve, reject) => {
        let size = 0, text = '';
        request.setEncoding('utf8');
        request.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > 512 * 1024) { reject(Object.assign(new Error('配置不能超过 512 KB。'), { status: 413 })); request.destroy(); } else text += chunk; });
        request.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(Object.assign(new Error('请求内容不是合法 JSON。'), { status: 400 })); } });
        request.on('error', reject);
    });
    return http.createServer(async (request, response) => {
        try {
            const host = request.headers.host ?? '';
            const address = new URL(request.url, `http://${host}`);
            if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(response, 403, { error: '仅支持本机访问。' });
            if (request.headers.origin && request.headers.origin !== address.origin) return json(response, 403, { error: '请从本地编辑器页面保存。' });
            if (address.pathname === '/api/cards') {
                if (request.method === 'GET') return json(response, 200, read());
                if (request.method !== 'PUT') return json(response, 405, { error: '不支持此操作。' });
                if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return json(response, 415, { error: '请使用 JSON 保存。' });
                const input = await body(request);
                const next = validateCatalog(input.catalog);
                const previousText = fs.readFileSync(catalogFile, 'utf8');
                if (input.revision !== revision(previousText)) return json(response, 409, { error: '磁盘配置已被其他页面或编辑器修改，请重新载入后合并修改。' });
                fs.mkdirSync(backupDirectory, { recursive: true });
                const backup = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
                fs.writeFileSync(path.join(backupDirectory, backup), previousText, { encoding: 'utf8', flag: 'wx' });
                const temporary = path.join(path.dirname(catalogFile), `.${path.basename(catalogFile)}.${crypto.randomUUID()}.tmp`);
                try {
                    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
                    fs.renameSync(temporary, catalogFile);
                } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
                return json(response, 200, { ...read(), savedAt: new Date().toISOString(), backup });
            }
            if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: '不支持此操作。' });
            if (address.pathname === '/api/status') return json(response, 200, { gameBuilt: fs.existsSync(path.join(project, 'build/web-desktop/application.js')) });
            if (address.pathname === '/shared/catalog.js') {
                response.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' });
                return response.end(ts.transpileModule(fs.readFileSync(schemaPath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText);
            }
            if (address.pathname === '/art/card-art.png') return sendFile(response, path.join(project, 'assets/resources/art/card-art.png'));
            if (address.pathname === '/play') { response.writeHead(302, { Location: '/play/?cards=live' }); return response.end(); }
            if (address.pathname.startsWith('/play/')) {
                const build = path.join(project, 'build/web-desktop');
                const file = path.resolve(build, '.' + decodeURIComponent(address.pathname.slice(5) || '/index.html'));
                const resolved = address.pathname === '/play/' ? path.join(build, 'index.html') : file;
                if (!resolved.startsWith(build + path.sep)) return json(response, 403, { error: '无效路径。' });
                if (!fs.existsSync(path.join(build, 'application.js'))) {
                    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
                    return response.end('<html lang="zh-CN"><meta charset="utf-8"><title>首次试玩准备</title><body style="background:#181b1a;color:#e3d9c5;font:20px system-ui;padding:64px"><h1>首次试玩需要构建游戏</h1><p>在项目目录运行 <code>npm run build:web</code>，完成后重新打开试玩。</p><p>之后通过本编辑器修改卡牌，只需保存并重新打开试玩。</p></body></html>');
                }
                return sendFile(response, resolved);
            }
            const staticFiles = { '/': 'index.html', '/editor.css': 'editor.css', '/editor.js': 'editor.js' };
            const name = staticFiles[address.pathname];
            if (name) return sendFile(response, path.join(project, 'tools/card-editor', name));
            return json(response, 404, { error: '页面不存在。' });
        } catch (error) {
            json(response, error instanceof CatalogError ? 422 : error.status ?? 500, { error: error.message, issues: error.issues });
        }
    });
}
if (require.main === module) {
    const port = Number(process.env.CARD_EDITOR_PORT ?? 7460);
    const server = createEditorServer();
    server.listen(port, '127.0.0.1', () => console.log(`the end 卡牌编辑器: http://127.0.0.1:${port}/`));
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请使用已运行的编辑器，或设置 CARD_EDITOR_PORT。` : error.message); process.exitCode = 1; });
}
module.exports = { createEditorServer };
