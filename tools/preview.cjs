const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../build/web-desktop');
const port = Number(process.env.PORT ?? 7457);
const contentTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};
http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => response.writeHead(404).end());
    stream.on('open', () => {
        response.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream');
        stream.pipe(response);
    });
}).listen(port, '127.0.0.1', () => console.log(`Pink preview: http://127.0.0.1:${port}`));
