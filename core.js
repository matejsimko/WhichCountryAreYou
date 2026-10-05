// The app's request handler. Runs the same way locally (server.js) and on Vercel (api/index.js).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QUESTIONS, CATEGORIES, FEATURED, questionById } from './questions.js';
import * as db from './db.js';

const TEMPLATE = fileURLToPath(new URL('./templates/index.html', import.meta.url));
const PLACES = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./public/places.json', import.meta.url)), 'utf8')); // built by scripts/build-places.js
const THE = new Set(['US', 'GB', 'NL', 'PH', 'AE', 'BS', 'GM', 'CD', 'CG', 'CZ', 'MV', 'KM', 'SB', 'MH', 'SC', 'VA']);
const countryLabel = new Map(QUESTIONS[0].options.map((o) => [o.id, (THE.has(o.id) && !/^(Czechia)$/.test(o.label) ? 'the ' : '') + o.label]));

// Every country gets its own "where in X?" question, made on demand: id place-sk, place-us, ...
const placeCache = new Map();
function placeQuestion(id) {
  const m = /^place-([a-z]{2})$/.exec(id);
  if (!m) return null;
  const cc = m[1].toUpperCase();
  const rows = PLACES[cc];
  if (!rows) return null;
  if (!placeCache.has(id)) {
    const options = rows.map(([oid, n, s, , , , g]) => ({ id: oid, label: n, sub: s || undefined, emoji: g === 'r' ? '🗺️' : '🏙️', group: g === 'r' ? 'Regions' : 'Cities' }));
    placeCache.set(id, { id, category: 'where', prompt: `Where in ${countryLabel.get(cc) || cc} are you from?`, hue: 172, kind: 'places', country: cc.toLowerCase(), options, optionIds: new Set(options.map((o) => o.id)) });
  }
  return placeCache.get(id);
}
const getQuestion = (id) => questionById.get(id) || placeQuestion(id);

const SECRET = process.env.SECRET || 'dev-only-secret-change-me';
const SITE_URL = (process.env.SITE_URL || 'https://whichcountryareyou.com').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || Boolean(process.env.VERCEL);
const IP_CAP = Number(process.env.IP_CAP) || 6; // new devices allowed per question per network per day
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 40; // votes per minute per network (best effort per instance)

if (process.env.VERCEL && SECRET === 'dev-only-secret-change-me') console.warn('WARNING: set SECRET in production.');

// ---------- helpers
function getIp(req) {
  if (TRUST_PROXY) {
    const h = req.headers['x-real-ip'] || req.headers['fly-client-ip'] || req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (h) return String(h);
  }
  return req.socket?.remoteAddress || 'unknown';
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
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return ++b.n > RATE_PER_MIN;
}

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
  if (req.body !== undefined) { // Vercel parses JSON bodies for us
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch { return Promise.reject(new Error('bad json')); } }
    return Promise.resolve(req.body || {});
  }
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

const totalOf = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function leaderOf(q, counts, total) {
  let best = null;
  for (const o of q.options) {
    const c = counts[o.id] || 0;
    if (c > 0 && (!best || c > best.c)) best = { id: o.id, label: o.label, flag: o.code ? o.code.toLowerCase() : o.flag || null, c };
  }
  return best ? { id: best.id, label: best.label, flag: best.flag, pct: (best.c / total) * 100 } : null;
}

function summary(q, counts, mine) {
  const total = totalOf(counts);
  const mo = mine ? q.options.find((o) => o.id === mine) : null;
  return {
    mineOpt: mo ? { label: mo.label, emoji: mo.emoji || null, flag: mo.code ? mo.code.toLowerCase() : mo.flag || null, swatch: mo.swatch || null } : null,
    id: q.id, category: q.category, prompt: q.prompt, hue: q.hue,
    kind: q.options.length === 2 ? 'duel' : q.kind === 'countries' ? 'countries' : q.kind === 'places' ? 'places' : 'list',
    country: q.country,
    optionCount: q.options.length, total, leader: leaderOf(q, counts, total), mine: mine ?? null,
  };
}
const detail = (q, counts, mine) => ({ ...summary(q, counts, mine), options: q.options, counts });

// ---------- API
async function api(req, res, p) {
  if (req.method === 'GET' && p === '/api/questions') {
    const all = await db.allCounts();
    const dev = readDevice(req);
    const mine = dev ? await db.mine(dev) : {};
    const questions = QUESTIONS.map((q) => summary(q, all[q.id] || {}, mine[q.id]));
    const countries = Object.keys(all.country || {}).length;
    const answers = questions.reduce((a, q) => a + q.total, 0);
    const placeMine = Object.fromEntries(Object.entries(mine).filter(([id]) => id.startsWith('place-')));
    return json(res, 200, { questions, categories: CATEGORIES, featured: FEATURED, placeCountries: Object.keys(PLACES).map((c) => c.toLowerCase()), placeMine, stats: { answers, countries, questions: questions.length } });
  }

  const cm = /^\/api\/country\/([a-z]{2})$/.exec(p);
  if (req.method === 'GET' && cm) {
    const code = cm[1].toUpperCase();
    const country = QUESTIONS[0].options.find((o) => o.id === code);
    if (!country) return json(res, 404, { error: 'No such country.' });
    const MIN_VOTERS = 5; // below this the breakdown could point at individuals, so it stays hidden
    const [prof, world] = await Promise.all([db.countryProfile(code), db.allCounts()]);
    const out = { code, label: country.label, voters: prof.voters, minVoters: MIN_VOTERS, hidden: prof.voters < MIN_VOTERS, rank: 0, questions: [] };
    const cc = world.country || {};
    out.rank = Object.entries(cc).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === code) + 1;
    out.totalCountryVotes = Object.values(cc).reduce((a, b) => a + b, 0);
    if (!out.hidden) {
      for (const q of QUESTIONS) {
        if (q.kind === 'countries') continue;
        const mine = prof.byQuestion[q.id];
        if (!mine) continue;
        const total = Object.values(mine).reduce((a, b) => a + b, 0);
        if (total < MIN_VOTERS) continue;
        const wTotal = Object.values(world[q.id] || {}).reduce((a, b) => a + b, 0) || 1;
        const rows = q.options.map((o) => ({ id: o.id, label: o.label, emoji: o.emoji || null, flag: o.code ? o.code.toLowerCase() : o.flag || null, swatch: o.swatch || null, n: mine[o.id] || 0, pct: ((mine[o.id] || 0) / total) * 100, world: (((world[q.id] || {})[o.id] || 0) / wTotal) * 100 }))
          .sort((a, b) => b.n - a.n);
        out.questions.push({ id: q.id, prompt: q.prompt, category: q.category, hue: q.hue, total, duel: q.options.length === 2, top: rows.slice(0, q.options.length === 2 ? 2 : 4) });
      }
    }
    return json(res, 200, out);
  }

  const one = /^\/api\/questions\/([a-z0-9-]+)$/.exec(p);
  if (req.method === 'GET' && one) {
    const q = getQuestion(one[1]);
    if (!q) return json(res, 404, { error: 'No such question.' });
    const dev = readDevice(req);
    const [counts, mine] = await Promise.all([db.counts(q.id), dev ? db.getVote(q.id, dev) : null]);
    return json(res, 200, detail(q, counts, mine));
  }

  if (req.method === 'POST' && p === '/api/vote') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-site votes are not allowed.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const q = getQuestion(body.questionId);
    if (!q) return json(res, 404, { error: 'No such question.' });
    if (typeof body.optionId !== 'string' || !q.optionIds.has(body.optionId)) return json(res, 400, { error: 'No such option.' });

    const ip = getIp(req);
    if (rateLimited(ip)) return json(res, 429, { error: 'Easy there. Try again in a minute.' });

    const dev = ensureDevice(req, res);
    const hash = ipHash(ip);
    const existing = await db.getVote(q.id, dev);
    if (existing === null && (await db.ipCount(q.id, hash)) >= IP_CAP) {
      return json(res, 429, { error: 'A lot of people have already voted from your network today. Come back tomorrow.' });
    }
    await db.castVote(q.id, dev, body.optionId, hash);
    return json(res, 200, detail(q, await db.counts(q.id), body.optionId));
  }

  return json(res, 404, { error: 'Not found.' });
}

// ---------- pages
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function metaFor(pathname) {
  let title = 'Which Country Are You?';
  let desc = 'A tiny census taken by anyone. Pick your country, vote on everything else, and watch the world answer.';
  const m = /^\/q\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) {
    const q = getQuestion(m[1]);
    if (q) {
      const total = totalOf(await db.counts(q.id));
      title = `${q.prompt} · Which Country Are You?`;
      desc = total ? `${total.toLocaleString('en-US')} people have answered so far. Add yours and see how the world votes.` : 'Nobody has answered yet. Be the first.';
    }
  } else if (/^\/c\/([a-z]{2})\/?$/.test(pathname)) {
    const code = pathname.split('/')[2].slice(0, 2).toUpperCase();
    const name = (countryLabel.get(code) || code).replace(/^the /, '');
    title = `What people from ${name} think · Which Country Are You?`;
    desc = `Coffee or tea? Cats or dogs? See how people from ${name} vote compared with the rest of the world.`;
  } else if (/^\/explore\/?$/.test(pathname)) {
    title = 'Every question · Which Country Are You?';
  } else if (/^\/profile\/?$/.test(pathname)) {
    title = 'Your passport · Which Country Are You?';
  } else if (/^\/map\/?$/.test(pathname)) {
    title = 'The map · Which Country Are You?';
  } else if (/^\/about\/?$/.test(pathname)) {
    title = 'About · Which Country Are You?';
  }
  const url = SITE_URL + pathname;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Which Country Are You?">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_URL}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE_URL}/og.png"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">`;
}

async function sendShell(res, pathname, status = 200) {
  let meta = '<title>Which Country Are You?</title>';
  try { meta = await metaFor(pathname); } catch (err) { console.error('meta failed', err); } // a DB hiccup must not blank the page
  const html = fs.readFileSync(TEMPLATE, 'utf8').replace('<!--META-->', meta);
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
}

// Vercel rewrites send app routes here as /api/index?route=<original path>
function pathnameOf(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.has('route') ? '/' + url.searchParams.get('route').replace(/^\/+/, '') : url.pathname;
}

export async function handle(req, res) {
  try {
    const pathname = pathnameOf(req);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');

    if (pathname.startsWith('/api/')) return await api(req, res, pathname);

    if (pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    }
    if (pathname === '/sitemap.xml') {
      const urls = ['/', '/explore', '/map', '/about', ...QUESTIONS.map((q) => `/q/${q.id}`), ...QUESTIONS[0].options.map((o) => `/c/${o.id.toLowerCase()}`)];
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc></url>`).join('')}</urlset>`);
    }

    const cm2 = /^\/c\/([a-z]{2})\/?$/.exec(pathname);
    if (cm2) return await sendShell(res, pathname, countryLabel.has(cm2[1].toUpperCase()) ? 200 : 404);
    const m = /^\/q\/([a-z0-9-]+)\/?$/.exec(pathname);
    if (m && !getQuestion(m[1])) return await sendShell(res, pathname, 404);
    if (pathname === '/' || m || /^\/(explore|about|map|profile)\/?$/.test(pathname)) return await sendShell(res, pathname);
    return await sendShell(res, pathname, 404);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Something broke on our side.' });
  }
}
