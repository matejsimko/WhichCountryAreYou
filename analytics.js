// First-party, privacy-friendly analytics.
//  - no cookies, no localStorage ids, no IP addresses stored
//  - a visitor is a hash of (secret + today + IP + browser) that changes every day, so nobody can be followed over time
//  - country and city come from the host's edge headers (Vercel), never from the IP we see
import crypto from 'node:crypto';
import { client, init } from './db.js';

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl\/|wget|python|node-fetch|axios|go-http|vercel|monitor|uptime|checker/i;

// ---------- parsing helpers
export function parseUA(ua = '') {
  const device = /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'Tablet' : /mobi|iphone|ipod|android/i.test(ua) ? 'Phone' : 'Desktop';
  let browser = 'Other';
  if (/Instagram/i.test(ua)) browser = 'Instagram app';
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = 'Facebook app';
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) browser = 'TikTok app';
  else if (/Twitter|TwitterAndroid/i.test(ua)) browser = 'X app';
  else if (/LinkedInApp/i.test(ua)) browser = 'LinkedIn app';
  else if (/Line\//i.test(ua)) browser = 'LINE app';
  else if (/Telegram/i.test(ua)) browser = 'Telegram app';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/EdgA?\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  return { device, browser, os };
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase().slice(0, 80); } catch { return null; } };

// group a referrer host (or utm_source) into something a human recognises
const CHANNELS = [
  [/^(t\.co|twitter\.com|x\.com|mobile\.twitter\.com)$/, 'X / Twitter'],
  [/(facebook\.com|fb\.com|fb\.me|lm\.facebook\.com|l\.facebook\.com)$/, 'Facebook'],
  [/(instagram\.com|l\.instagram\.com)$/, 'Instagram'],
  [/(whatsapp\.com|wa\.me)$/, 'WhatsApp'],
  [/(reddit\.com|redd\.it)$/, 'Reddit'],
  [/(t\.me|telegram\.org|telegram\.me|web\.telegram\.org)$/, 'Telegram'],
  [/(tiktok\.com)$/, 'TikTok'],
  [/(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
  [/(news\.ycombinator\.com)$/, 'Hacker News'],
  [/(producthunt\.com)$/, 'Product Hunt'],
  [/(indiehackers\.com)$/, 'Indie Hackers'],
  [/(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.com|seznam\.cz|search\.brave\.com)$/, 'Search'],
  [/(vercel\.app)$/, 'Vercel preview'],
];
export function channelOf(refHost, utmSource) {
  const s = (utmSource || '').toLowerCase();
  const probe = refHost || (s && s.includes('.') ? s : '');
  for (const [re, name] of CHANNELS) if (probe && re.test(probe)) return name;
  if (s) {
    const m = { x: 'X / Twitter', twitter: 'X / Twitter', facebook: 'Facebook', instagram: 'Instagram', ig: 'Instagram', whatsapp: 'WhatsApp', reddit: 'Reddit', telegram: 'Telegram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', hn: 'Hacker News', producthunt: 'Product Hunt', indiehackers: 'Indie Hackers', newsletter: 'Newsletter', google: 'Search' };
    return m[s] || `utm: ${s}`;
  }
  return refHost ? refHost : 'Direct';
}

const clean = (s, n = 80) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
const int = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const today = () => new Date().toISOString().slice(0, 10);

// ---------- collecting
export async function collect({ body, ua, ip, geo, secret, siteHosts = [], dnt }) {
  if (dnt || !ua || BOT.test(ua)) return { skipped: true };
  const kind = body?.k;
  if (!['pv', 'ev', 'dur'].includes(kind)) return { skipped: true };
  const path = clean(String(body.p || '/').split('?')[0], 120) || '/';
  if (path.startsWith('/admin') || path.startsWith('/api')) return { skipped: true };
  const day = today();
  const vh = crypto.createHash('sha256').update(`${secret}:${day}:${ip}:${ua}`).digest('hex').slice(0, 16);
  const { device, browser, os } = parseUA(ua);
  let ref = null;
  if (kind === 'pv' && body.r) { ref = hostOf(body.r); if (siteHosts.includes(ref)) ref = null; }
  const u = body.u || {};
  const name = kind === 'ev' ? (clean(body.n, 40) || '').replace(/[^a-z0-9_:-]/gi, '') || null : null;
  if (kind === 'ev' && !name) return { skipped: true };
  let props = null;
  if (body.x && typeof body.x === 'object') { try { const j = JSON.stringify(body.x); if (j.length <= 300) props = j; } catch { /* ignore */ } }
  await init();
  await client.execute({
    sql: `INSERT INTO ev (ts, day, kind, name, vh, path, entry, ref, utm_s, utm_m, utm_c, country, region, city, device, browser, os, lang, sw, dur, props)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [Date.now(), day, kind, name, vh, path, body.e ? 1 : 0, ref, clean(u.s, 40), clean(u.m, 40), clean(u.c, 60), geo.country, geo.region, geo.city, device, browser, os, clean(body.l, 12), int(body.w, 100, 10000), kind === 'dur' ? int(body.d, 0, 1800000) : null, props],
  });
  return { ok: true };
}

// ---------- reading
const rows = async (sql, args = []) => (await client.execute({ sql, args })).rows.map((r) => ({ ...r }));
const num = (x) => Number(x || 0);

const dayAdd = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayMs = (d) => Date.parse(d + 'T00:00:00Z');

async function kpis(from, to) {
  const msFrom = dayMs(from), msTo = dayMs(dayAdd(to, 1));
  const [a, s, v] = await Promise.all([
    rows(`SELECT COUNT(DISTINCT vh||day) AS visitors, COALESCE(SUM(kind='pv'), 0) AS views,
            COUNT(DISTINCT CASE WHEN kind='ev' THEN vh||day END) AS engaged,
            COUNT(DISTINCT CASE WHEN kind='ev' AND name='vote' THEN vh||day END) AS voters,
            COUNT(DISTINCT CASE WHEN kind='ev' AND name='vote' AND json_extract(props,'$.q')='country' THEN vh||day END) AS country_voters,
            COUNT(DISTINCT CASE WHEN kind='ev' AND name='share_open' THEN vh||day END) AS sharers
          FROM ev WHERE day BETWEEN ? AND ?`, [from, to]),
    rows(`SELECT COUNT(*) AS sessions, COALESCE(SUM(CASE WHEN pv <= 1 AND evs = 0 THEN 1 ELSE 0 END), 0) AS bounces, AVG(CASE WHEN dur > 0 THEN dur END) AS avg_dur
          FROM (SELECT vh, ts / 1800000 AS b, SUM(kind='pv') AS pv, SUM(kind='ev') AS evs, SUM(COALESCE(dur, 0)) AS dur FROM ev WHERE day BETWEEN ? AND ? GROUP BY vh, b)`, [from, to]),
    rows('SELECT COUNT(*) AS votes, COUNT(DISTINCT device_id) AS devices FROM votes WHERE created_at >= ? AND created_at < ?', [msFrom, msTo]),
  ]);
  return {
    visitors: num(a[0].visitors), views: num(a[0].views), engaged: num(a[0].engaged), voters: num(a[0].voters), countryVoters: num(a[0].country_voters), sharers: num(a[0].sharers),
    sessions: num(s[0].sessions), bounces: num(s[0].bounces), avgDur: s[0].avg_dur ? Math.round(Number(s[0].avg_dur)) : 0,
    votes: num(v[0].votes), voteDevices: num(v[0].devices),
  };
}

const cache = new Map();
export async function stats(rangeDays) {
  const key = String(rangeDays);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.v;
  await init();
  const to = today();
  const from = dayAdd(to, -(rangeDays - 1));
  const pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(rangeDays - 1));
  const msFrom = dayMs(from);
  const R = [from, to];

  const [cur, prev, daily, vdaily, countries, cities, sources, campaigns, pages, entries, pageDur, devices, browsers, oses, langs, widths, events, props, hours, weekdays, feed, live, topQ, totals, ever] = await Promise.all([
    kpis(from, to),
    kpis(pFrom, pTo),
    rows(`SELECT day, COUNT(DISTINCT vh) AS visitors, SUM(kind='pv') AS views, COUNT(DISTINCT CASE WHEN kind='ev' AND name='vote' THEN vh END) AS voters FROM ev WHERE day BETWEEN ? AND ? GROUP BY day`, R),
    rows(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM votes WHERE created_at >= ? GROUP BY day`, [msFrom]),
    rows(`SELECT country, COUNT(DISTINCT vh||day) AS visitors, SUM(kind='pv') AS views, COUNT(DISTINCT CASE WHEN kind='ev' AND name='vote' THEN vh||day END) AS voters FROM ev WHERE day BETWEEN ? AND ? AND country IS NOT NULL GROUP BY country ORDER BY visitors DESC LIMIT 40`, R),
    rows(`SELECT country, city, COUNT(DISTINCT vh||day) AS visitors FROM ev WHERE day BETWEEN ? AND ? AND city IS NOT NULL GROUP BY country, city ORDER BY visitors DESC LIMIT 20`, R),
    rows(`SELECT ref, utm_s, COUNT(DISTINCT vh||day) AS visitors FROM ev WHERE kind='pv' AND entry=1 AND day BETWEEN ? AND ? GROUP BY ref, utm_s`, R),
    rows(`SELECT utm_s, utm_m, utm_c, COUNT(DISTINCT vh||day) AS visitors FROM ev WHERE kind='pv' AND entry=1 AND utm_c IS NOT NULL AND day BETWEEN ? AND ? GROUP BY utm_s, utm_m, utm_c ORDER BY visitors DESC LIMIT 15`, R),
    rows(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT vh||day) AS visitors FROM ev WHERE kind='pv' AND day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC LIMIT 25`, R),
    rows(`SELECT path, COUNT(*) AS n FROM ev WHERE kind='pv' AND entry=1 AND day BETWEEN ? AND ? GROUP BY path ORDER BY n DESC LIMIT 10`, R),
    rows(`SELECT path, AVG(dur) AS avg_dur, AVG(CAST(json_extract(props, '$.sd') AS REAL)) AS sd FROM ev WHERE kind='dur' AND day BETWEEN ? AND ? GROUP BY path`, R),
    rows(`SELECT device AS k, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND entry=1 AND day BETWEEN ? AND ? GROUP BY device ORDER BY n DESC`, R),
    rows(`SELECT browser AS k, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND entry=1 AND day BETWEEN ? AND ? GROUP BY browser ORDER BY n DESC LIMIT 12`, R),
    rows(`SELECT os AS k, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND entry=1 AND day BETWEEN ? AND ? GROUP BY os ORDER BY n DESC LIMIT 10`, R),
    rows(`SELECT lang AS k, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND entry=1 AND lang IS NOT NULL AND day BETWEEN ? AND ? GROUP BY lang ORDER BY n DESC LIMIT 12`, R),
    rows(`SELECT CASE WHEN sw < 400 THEN 'Under 400 px' WHEN sw < 768 THEN '400 to 767 px' WHEN sw < 1200 THEN '768 to 1199 px' ELSE '1200 px and up' END AS k, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND entry=1 AND sw IS NOT NULL AND day BETWEEN ? AND ? GROUP BY k ORDER BY n DESC`, R),
    rows(`SELECT name, COUNT(*) AS n, COUNT(DISTINCT vh||day) AS u FROM ev WHERE kind='ev' AND day BETWEEN ? AND ? GROUP BY name ORDER BY n DESC LIMIT 80`, R),
    rows(`SELECT name, props, COUNT(*) AS n FROM ev WHERE kind='ev' AND props IS NOT NULL AND day BETWEEN ? AND ? GROUP BY name, props ORDER BY n DESC LIMIT 500`, R),
    rows(`SELECT CAST(strftime('%H', ts / 1000, 'unixepoch') AS INTEGER) AS h, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND day BETWEEN ? AND ? GROUP BY h`, R),
    rows(`SELECT CAST(strftime('%w', ts / 1000, 'unixepoch') AS INTEGER) AS d, COUNT(DISTINCT vh||day) AS n FROM ev WHERE kind='pv' AND day BETWEEN ? AND ? GROUP BY d`, R),
    rows(`SELECT ts, kind, name, path, country, city, device, browser, props FROM ev WHERE kind != 'dur' ORDER BY id DESC LIMIT 40`),
    rows('SELECT COUNT(DISTINCT vh) AS n FROM ev WHERE ts > ?', [Date.now() - 5 * 60_000]),
    rows(`SELECT question_id AS q, SUM(n) AS n FROM counts GROUP BY question_id ORDER BY n DESC LIMIT 40`),
    rows(`SELECT (SELECT COALESCE(SUM(n), 0) FROM counts) AS votes, (SELECT COUNT(*) FROM counts WHERE question_id = 'country' AND n > 0) AS countries, (SELECT COUNT(DISTINCT device_id) FROM votes) AS devices`),
    rows('SELECT COUNT(*) AS n, MIN(ts) AS first, MAX(ts) AS last FROM ev'),
  ]);

  // fill every day of the range, so charts have no gaps
  const dmap = new Map(daily.map((r) => [r.day, r])), vmap = new Map(vdaily.map((r) => [r.day, num(r.n)]));
  const series = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = dayAdd(from, i);
    const r = dmap.get(d);
    series.push({ day: d, visitors: num(r?.visitors), views: num(r?.views), voters: num(r?.voters), votes: vmap.get(d) || 0 });
  }

  // referrers into channels
  const ch = new Map();
  for (const r of sources) { const c = channelOf(r.ref, r.utm_s); ch.set(c, (ch.get(c) || 0) + num(r.visitors)); }
  const channels = [...ch.entries()].map(([name, visitors]) => ({ name, visitors })).sort((a, b) => b.visitors - a.visitors);

  // event property breakdowns, e.g. share by channel
  const breakdown = {};
  for (const r of props) {
    let p; try { p = JSON.parse(r.props); } catch { continue; }
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'object') continue;
      const slot = ((breakdown[r.name] ??= {})[k] ??= {});
      slot[String(v)] = (slot[String(v)] || 0) + num(r.n);
    }
  }

  const durMap = new Map(pageDur.map((r) => [r.path, r]));
  const out = {
    generatedAt: Date.now(), range: { days: rangeDays, from, to, prevFrom: pFrom, prevTo: pTo },
    kpi: { cur, prev },
    series,
    funnel: [
      { key: 'visited', label: 'Visited', n: cur.visitors },
      { key: 'engaged', label: 'Did something', n: cur.engaged },
      { key: 'voted', label: 'Voted', n: cur.voters },
      { key: 'country', label: 'Picked a country', n: cur.countryVoters },
      { key: 'shared', label: 'Opened share', n: cur.sharers },
    ],
    countries: countries.map((r) => ({ code: r.country, visitors: num(r.visitors), views: num(r.views), voters: num(r.voters) })),
    cities: cities.map((r) => ({ country: r.country, city: r.city, visitors: num(r.visitors) })),
    channels,
    campaigns: campaigns.map((r) => ({ source: r.utm_s, medium: r.utm_m, campaign: r.utm_c, visitors: num(r.visitors) })),
    pages: pages.map((r) => ({ path: r.path, views: num(r.views), visitors: num(r.visitors), avgDur: Math.round(num(durMap.get(r.path)?.avg_dur)), scroll: Math.round(num(durMap.get(r.path)?.sd)) })),
    entries: entries.map((r) => ({ path: r.path, n: num(r.n) })),
    devices: devices.map((r) => ({ k: r.k, n: num(r.n) })),
    browsers: browsers.map((r) => ({ k: r.k, n: num(r.n) })),
    os: oses.map((r) => ({ k: r.k, n: num(r.n) })),
    langs: langs.map((r) => ({ k: r.k, n: num(r.n) })),
    widths: widths.map((r) => ({ k: r.k, n: num(r.n) })),
    events: events.map((r) => ({ name: r.name, n: num(r.n), u: num(r.u) })),
    breakdown,
    hours: Array.from({ length: 24 }, (_, h) => num(hours.find((r) => num(r.h) === h)?.n)),
    weekdays: Array.from({ length: 7 }, (_, d) => num(weekdays.find((r) => num(r.d) === d)?.n)),
    feed: feed.map((r) => ({ ts: num(r.ts), kind: r.kind, name: r.name, path: r.path, country: r.country, city: r.city, device: r.device, browser: r.browser, props: r.props })),
    live: num(live[0].n),
    questions: topQ.map((r) => ({ q: r.q, n: num(r.n) })),
    totals: { votes: num(totals[0].votes), countries: num(totals[0].countries), devices: num(totals[0].devices), events: num(ever[0].n), first: num(ever[0].first), last: num(ever[0].last) },
  };
  cache.set(key, { at: Date.now(), v: out });
  return out;
}

export async function liveNow() {
  await init();
  const [n, feed] = await Promise.all([
    rows('SELECT COUNT(DISTINCT vh) AS n FROM ev WHERE ts > ?', [Date.now() - 5 * 60_000]),
    rows(`SELECT ts, kind, name, path, country, city, device, browser, props FROM ev WHERE kind != 'dur' ORDER BY id DESC LIMIT 40`),
  ]);
  return { live: num(n[0].n), feed: feed.map((r) => ({ ts: num(r.ts), kind: r.kind, name: r.name, path: r.path, country: r.country, city: r.city, device: r.device, browser: r.browser, props: r.props })) };
}

// CSV of raw events for the range (for your own analysis in a spreadsheet)
export async function exportCsv(rangeDays) {
  await init();
  const from = dayAdd(today(), -(rangeDays - 1));
  const rs = await rows('SELECT ts, day, kind, name, path, entry, ref, utm_s, utm_m, utm_c, country, region, city, device, browser, os, lang, sw, dur, props FROM ev WHERE day >= ? ORDER BY id LIMIT 200000', [from]);
  const cols = ['ts', 'day', 'kind', 'name', 'path', 'entry', 'ref', 'utm_s', 'utm_m', 'utm_c', 'country', 'region', 'city', 'device', 'browser', 'os', 'lang', 'sw', 'dur', 'props'];
  const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
  return [cols.join(','), ...rs.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
