// Local / Docker server. On Vercel, api/index.js runs the same handler as a function.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './core.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

// Code revalidates on every load (cheap 304 via ETag) so changes show up immediately.
// Flags and images never change, so they cache for a day.
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const cache = ['.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': cache }); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache, etag, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (path.extname(pathname) && !pathname.startsWith('/api/') && pathname !== '/sitemap.xml' && pathname !== '/robots.txt') {
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); return res.end('Not found'); }
    return sendFile(req, res, file);
  }
  return handle(req, res);
}).listen(PORT, () => console.log(`Which Country Are You? → http://localhost:${PORT}`));
