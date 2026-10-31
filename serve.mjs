import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

export function startServer(port = 8000) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        send(res, 204, '');
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, 'Method Not Allowed');
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/README.md';

      const filePath = path.resolve(root, `.${pathname}`);
      if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        send(res, 403, 'Forbidden');
        return;
      }

      const info = await stat(filePath);
      if (info.isDirectory()) {
        send(res, 404, 'Not Found');
        return;
      }

      const data = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, req.method === 'HEAD' ? '' : data, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': info.size
      });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        send(res, 404, 'Not Found');
      } else {
        console.error(error);
        send(res, 500, 'Internal Server Error');
      }
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving ${root}`);
    console.log(`Open: http://localhost:${port}/`);
    console.log(`Extension URL: http://localhost:${port}/dist/ai-agent.js`);
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000);
  startServer(port);
}
