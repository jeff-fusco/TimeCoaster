// Minimal static file server for local dev.
//
// Sends `Cache-Control: no-store` on every response so the browser always picks
// up the latest HTML/CSS/JS (ES modules included) on a normal reload — no more
// stale styles.css / main.js after an edit. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const port = Number(process.env.PORT) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
    const filePath = normalize(join(root, pathname));
    // stay within the project root
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      res.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Cache-Control': 'no-store' }).end('Server error');
  }
});

server.listen(port, () => {
  console.log(`Time Coaster dev server (no-store) on http://localhost:${port}`);
});
