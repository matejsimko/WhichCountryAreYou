import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QUESTIONS, CATEGORIES, FEATURED, questionById } from './questions.js';
import { openDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'votes.db');
const SECRET = process.env.SECRET || 'dev-only-secret-change-me';
const SITE_URL = (process.env.SITE_URL || 'https://whichcountryareyou.com').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // set behind Fly / Cloudflare / nginx
const IP_CAP = Number(process.env.IP_CAP) || 6; // new devices allowed per question per network per day
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 40; // votes per minute per network

if (process.env.NODE_ENV === 'production' && SECRET === 'dev-only-secret-change-me') {
  console.warn('WARNING: set SECRET in production.');
}

const db = openDb(DB_PATH);

// ---------- helpers
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

function getIp(req) {
  if (TRUST_PROXY) {
    const h = req.headers['fly-client-ip'] || req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (h) return h;
  }
  return req.socket.remoteAddress || 'unknown';
}

// One-way hash that changes every day. Enough to cap abuse, useless for tracking anyone.
function ipHash(ip) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(`${SECRET}:${day}:${ip}`).digest('hex').slice(0, 24);
}

const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) buckets.set(ip, (b = { n: 0, reset: now + 60_000 }));
  return ++b.n > RATE_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();

const DEVICE_RE = /^[a-f0-9-]{36}$/;
function readDevice(req) {
  const m = /(?:^|;\s*)wcay_d=([^;]+)/.exec(req.headers.cookie || '');
  return m && DEVICE_RE.test(m[1]) ? m[1] : null;
}
function ensureDevice(req, res) {
  let id = readDevice(req);
  if (!id) {
    id = crypto.randomUUID();
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `wcay_d=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  }
  return id;
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function leaderOf(q, counts, total) {
  let best = null;
  for (const o of q.options) {
    const c = counts[o.id] || 0;
    if (c > 0 && (!best || c > best.c)) best = { id: o.id, label: o.label, flag: o.code ? o.code.toLowerCase() : o.flag || null, c };
  }
  return best ? { id: best.id, label: best.label, flag: best.flag, pct: (best.c / total) * 100 } : null;
}
const totalOf = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function summary(q, counts, mine) {
  const total = totalOf(counts);
  return {
    id: q.id, category: q.category, prompt: q.prompt, hue: q.hue,
    kind: q.options.length === 2 ? 'duel' : q.kind === 'countries' ? 'countries' : 'list',
    optionCount: q.options.length, total, leader: leaderOf(q, counts, total), mine: mine ?? null,
  };
}
function detail(q, counts, mine) {
  return { ...summary(q, counts, mine), options: q.options, counts };
}

// ---------- API
async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/questions') {
    const all = db.allCounts();
    const dev = readDevice(req);
    const mine = dev ? db.mine(dev) : {};
    const questions = QUESTIONS.map((q) => summary(q, all[q.id] || {}, mine[q.id]));
    const countries = Object.keys(all.country || {}).length;
    const answers = questions.reduce((a, q) => a + q.total, 0);
    return json(res, 200, { questions, categories: CATEGORIES, featured: FEATURED, stats: { answers, countries, questions: questions.length } });
  }

  const one = /^\/api\/questions\/([a-z0-9-]+)$/.exec(p);
  if (req.method === 'GET' && one) {
    const q = questionById.get(one[1]);
    if (!q) return json(res, 404, { error: 'No such question.' });
    const dev = readDevice(req);
    return json(res, 200, detail(q, db.counts(q.id), dev ? db.getVote(q.id, dev) : null));
  }

  if (req.method === 'POST' && p === '/api/vote') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-site votes are not allowed.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const q = questionById.get(body.questionId);
    if (!q) return json(res, 404, { error: 'No such question.' });
    if (typeof body.optionId !== 'string' || !q.optionIds.has(body.optionId)) return json(res, 400, { error: 'No such option.' });

    const ip = getIp(req);
    if (rateLimited(ip)) return json(res, 429, { error: 'Easy there. Try again in a minute.' });

    const dev = ensureDevice(req, res);
    const hash = ipHash(ip);
    const existing = db.getVote(q.id, dev);
    if (existing === null && db.ipCount(q.id, hash) >= IP_CAP) {
      return json(res, 429, { error: 'A lot of people have already voted from your network today. Come back tomorrow.' });
    }
    db.castVote(q.id, dev, body.optionId, hash);
    return json(res, 200, detail(q, db.counts(q.id), body.optionId));
  }

  return json(res, 404, { error: 'Not found.' });
}

// ---------- pages + static
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function metaFor(pathname) {
  let title = 'Which Country Are You?';
  let desc = 'A tiny census taken by anyone. Pick your country, vote on everything else, and watch the world answer.';
  const m = /^\/q\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) {
    const q = questionById.get(m[1]);
    if (q) {
      const total = totalOf(db.counts(q.id));
      title = `${q.prompt} · Which Country Are You?`;
      desc = total ? `${total.toLocaleString('en-US')} people have answered so far. Add yours and see how the world votes.` : 'Nobody has answered yet. Be the first.';
    }
  } else if (/^\/explore\/?$/.test(pathname)) {
    title = 'Every question · Which Country Are You?';
  } else if (/^\/about\/?$/.test(pathname)) {
    title = 'About · Which Country Are You?';
  }
  const url = SITE_URL + pathname;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Which Country Are You?">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">`;
}

function sendShell(res, pathname, status = 200) {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replace('<!--META-->', metaFor(pathname));
  res.writeHead(status, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
  res.end(html);
}

// Code revalidates on every load (cheap 304 via ETag) so deploys show up immediately.
// Flags and images never change, so they cache for a day.
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const cache = ['.js', '.css', '.html'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': cache }); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache, etag, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');

    if (url.pathname.startsWith('/api/')) return await api(req, res, url);

    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': MIME['.txt'] });
      return res.end(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    }
    if (url.pathname === '/sitemap.xml') {
      const urls = ['/', '/explore', '/about', ...QUESTIONS.map((q) => `/q/${q.id}`)];
      res.writeHead(200, { 'content-type': MIME['.xml'] });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc></url>`).join('')}</urlset>`);
    }

    // static files
    if (path.extname(url.pathname)) {
      const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
      if (!file.startsWith(PUBLIC + path.sep) || file.endsWith('index.html')) { res.writeHead(404); return res.end('Not found'); }
      return sendFile(req, res, file);
    }

    // app routes
    const m = /^\/q\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    if (m && !questionById.has(m[1])) return sendShell(res, url.pathname, 404);
    if (url.pathname === '/' || m || /^\/(explore|about)\/?$/.test(url.pathname)) return sendShell(res, url.pathname);
    return sendShell(res, url.pathname, 404);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Something broke on our side.' });
  }
});

server.listen(PORT, () => console.log(`Which Country Are You? → http://localhost:${PORT}`));
