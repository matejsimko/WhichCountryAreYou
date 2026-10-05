// LOCAL DEMO DATA ONLY. Fills the local database with fake votes so the pages have something to show.
//   npm run seed         add demo votes
//   npm run seed:clear   remove them again (real votes are untouched)
// Refuses to touch a remote (Turso) database.
import { client, init, DB_URL } from '../db.js';
import { QUESTIONS } from '../questions.js';

if (!DB_URL.startsWith('file:')) {
  console.error('Refusing to seed a remote database. Unset TURSO_DATABASE_URL to seed the local file.');
  process.exit(1);
}
await init();

const rebuildCounts = () => client.batch([
  'DELETE FROM counts',
  'INSERT INTO counts (question_id, option_id, n) SELECT question_id, option_id, COUNT(*) FROM votes GROUP BY question_id, option_id',
], 'write');

await client.execute("DELETE FROM votes WHERE device_id LIKE 'seed-%'");
await client.execute("DELETE FROM ev WHERE vh LIKE 'seed-%'");
await rebuildCounts();
if (process.argv.includes('--clear')) { console.log('Demo votes removed.'); process.exit(0); }

// deterministic-ish random
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

const BIG = { IN: 9, US: 8, BR: 6, ID: 4, NG: 3.5, DE: 4, GB: 4.5, MX: 3, SK: 3, PL: 2.8, FR: 3, IT: 3, JP: 2.5, TR: 2.5, ES: 2.5, CA: 3, AU: 2.2, NL: 2, CZ: 1.6, PH: 2.5, EG: 2 };
const now = Date.now();
const rows = [];
const ROW = 'INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
const pickIdx = (w) => { const sum = w.reduce((x, y) => x + y, 0); let r = rand() * sum, i = 0; while (r > w[i] && i < w.length - 1) r -= w[i++]; return i; };
const frac = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

// base popularity of every option, per question
const base = {};
for (const q of QUESTIONS) {
  const duel = q.options.length === 2;
  base[q.id] = q.options.map((o, i) => (q.kind === 'countries' ? BIG[o.id] ?? 0.15 + rand() * 0.9 : duel ? 0.25 + rand() * 0.75 : 1 / (1 + i * 0.55) + rand() * 0.25));
}

// "People": one device answers the country question and a bunch of others, and each country leans its own way.
// That is what makes the country pages (what do Slovaks think?) show real differences.
const countryQ = QUESTIONS.find((q) => q.id === 'country');
const PEOPLE = 14000;
for (let i = 0; i < PEOPLE; i++) {
  const ci = pickIdx(base.country);
  const cc = countryQ.options[ci].id;
  const dev = `seed-p-${i}`;
  const off = Math.floor(rand() * rand() * 30); // days ago of the first visit (more recent is more common: growth)
  const t0 = now - off * 86400000 - Math.floor(rand() * 40000000);
  rows.push({ sql: ROW, args: ['country', dev, cc, 'seed', t0, t0] });
  for (const q of QUESTIONS) {
    if (q.id === 'country' || rand() > 0.72) continue;
    const w = base[q.id].map((b, k) => b * (0.35 + 1.4 * frac(cc + q.id + q.options[k].id)));
    const later = off > 0 && rand() < 0.28 ? Math.floor(rand() * off) * 86400000 : 0; // some people came back another day
    rows.push({ sql: ROW, args: [q.id, dev, q.options[pickIdx(w)].id, 'seed', t0 + later, t0 + later] });
  }
}

// cities and regions for a few countries, weighted by population
import fs from 'node:fs';
const placesAll = JSON.parse(fs.readFileSync(new URL('../public/places.json', import.meta.url), 'utf8'));
for (const [cc, n] of [['US', 2600], ['SK', 700], ['DE', 900], ['GB', 800], ['IN', 900], ['BR', 700], ['PL', 500], ['FR', 500]]) {
  const pr = placesAll[cc];
  const w = pr.map((r) => Math.pow(r[5] + 1, 0.8) * (r[6] === 'r' ? 0.5 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    let r = rand() * sum, idx = 0;
    while (r > w[idx] && idx < w.length - 1) r -= w[idx++];
    rows.push({ sql: 'INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: ['place-' + cc.toLowerCase(), `seed-place-${cc}-${i}`, pr[idx][0], 'seed', now, now] });
  }
}
for (let i = 0; i < rows.length; i += 1000) await client.batch(rows.slice(i, i + 1000), 'write');
// demo analytics events so /admin has something to show (visitor hashes start with "seed-")
{
  const days = 30, now2 = Date.now();
  const CC = [['SK', 22], ['CZ', 10], ['US', 12], ['DE', 7], ['GB', 6], ['PL', 6], ['BR', 5], ['IN', 5], ['FR', 4], ['HU', 3], ['AT', 3], ['NL', 2], ['CA', 3], ['JP', 2], ['NG', 2]];
  const CITIES = { SK: ['Bratislava', 'Košice', 'Žilina', 'Nitra'], CZ: ['Prague', 'Brno'], US: ['New York', 'Austin', 'San Francisco'], DE: ['Berlin', 'Munich'], GB: ['London'], PL: ['Warsaw'], BR: ['São Paulo'], IN: ['Mumbai'], FR: ['Paris'] };
  const REFS = [[null, 'Direct', 30], ['t.co', 'X', 22], ['api.whatsapp.com', 'WA', 14], ['www.reddit.com', 'Reddit', 9], ['l.instagram.com', 'IG', 8], ['www.google.com', 'G', 7], ['news.ycombinator.com', 'HN', 4], ['www.indiehackers.com', 'IH', 3]];
  const UAS = [['Phone', 'Chrome', 'Android', 36], ['Phone', 'Safari', 'iOS', 28], ['Desktop', 'Chrome', 'Windows', 16], ['Desktop', 'Safari', 'macOS', 8], ['Phone', 'Instagram app', 'iOS', 6], ['Desktop', 'Firefox', 'Linux', 3], ['Phone', 'TikTok app', 'Android', 3]];
  const pickW = (arr, i) => { const sum = arr.reduce((a, x) => a + x[i], 0); let r = rand() * sum; for (const x of arr) { r -= x[i]; if (r <= 0) return x; } return arr[0]; };
  const EVS = ['vote', 'vote', 'vote', 'vote', 'share_open', 'share_click', 'map_open', 'map_zoom', 'map_country', 'pinny_click', 'tour_start', 'badge', 'change_answer', 'search', 'sort'];
  const PAGES = ['/', '/', '/', '/explore', '/map', '/q/country', '/q/coffee-or-tea', '/q/favorite-animal', '/profile', '/c/sk', '/about'];
  const INS = 'INSERT INTO ev (ts, day, kind, name, vh, path, entry, ref, utm_s, utm_c, country, city, device, browser, os, lang, sw, dur, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const INS2 = 'INSERT INTO ev (ts, day, kind, name, vh, path, entry, ref, utm_s, utm_m, utm_c, country, city, device, browser, os, lang, sw, dur, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const ev = [];
  for (let d = days - 1; d >= 0; d--) {
    const growth = 0.4 + (days - d) / days * 1.6;
    const visitors = Math.round((18 + rand() * 25) * growth);
    for (let v = 0; v < visitors; v++) {
      const ts0 = now2 - d * 86400000 - Math.floor(rand() * 86400000);
      const day = new Date(ts0).toISOString().slice(0, 10);
      const vh = `seed-an-${d}-${v}`;
      const [cc] = pickW(CC, 1), [dev, br, os] = pickW(UAS, 3), [rf] = pickW(REFS, 2);
      const city = (CITIES[cc] || [null])[Math.floor(rand() * (CITIES[cc] || [null]).length)];
      const utm = rf === 't.co' && rand() < 0.4 ? ['x', 'launch'] : [null, null];
      const pages = 1 + Math.floor(rand() * rand() * 7);
      let ts = ts0;
      for (let i = 0; i < pages; i++) {
        const path = i === 0 ? (rand() < 0.7 ? '/' : PAGES[Math.floor(rand() * PAGES.length)]) : PAGES[Math.floor(rand() * PAGES.length)];
        const viaShare = i === 0 && rand() < 0.14;
        if (viaShare) ev.push({ sql: INS2, args: [ts, day, 'pv', null, vh, path, 1, null, ['whatsapp', 'whatsapp', 'x', 'instagram', 'copy', 'telegram'][Math.floor(rand() * 6)], 'share', 'share', cc, city, dev, br, os, 'en', dev === 'Phone' ? 390 : 1440, null, null] });
        else ev.push({ sql: INS, args: [ts, day, 'pv', null, vh, path, i === 0 ? 1 : 0, i === 0 ? rf : null, i === 0 ? utm[0] : null, i === 0 ? utm[1] : null, cc, city, dev, br, os, 'en', dev === 'Phone' ? 390 : 1440, null, null] });
        if (i === 0) {
          const slow = dev === 'Phone' ? 1.5 : 1;
          ev.push({ sql: INS, args: [ts + 3000, day, 'ev', 'perf', vh, '/', 0, null, null, null, cc, city, dev, br, os, 'en', null, null, JSON.stringify({ lcp: Math.round((900 + rand() * 2600) * slow), cls: Math.round(rand() * rand() * 300) / 1000, inp: Math.round(60 + rand() * 260 * slow), ttfb: Math.round(120 + rand() * 500), load: Math.round(700 + rand() * 1500 * slow) })] });
          if (rand() < 0.03) ev.push({ sql: INS, args: [ts + 4000, day, 'ev', 'js_error', vh, '/', 0, null, null, null, cc, city, dev, br, os, 'en', null, null, JSON.stringify({ m: ['Cannot read properties of null', 'Failed to fetch', 'document.startViewTransition is not a function'][Math.floor(rand() * 3)], f: 'site.js', l: 120 + Math.floor(rand() * 40) })] });
          if (rand() < 0.02) ev.push({ sql: INS, args: [ts + 4500, day, 'ev', 'not_found', vh, ['/q/nope', '/c/zz', '/old-page'][Math.floor(rand() * 3)], 0, null, null, null, cc, city, dev, br, os, 'en', null, null, null] });
        }
        const n = Math.floor(rand() * 4);
        for (let k = 0; k < n; k++) {
          const name = EVS[Math.floor(rand() * EVS.length)];
          const props = name === 'vote' ? JSON.stringify({ q: i === 0 && k === 0 && rand() < 0.5 ? 'country' : ['coffee-or-tea', 'favorite-animal', 'season', 'cuisine'][Math.floor(rand() * 4)] }) : name === 'share_click' ? JSON.stringify({ ch: ['whatsapp', 'x', 'copy', 'instagram', 'facebook'][Math.floor(rand() * 5)] }) : name === 'map_zoom' ? JSON.stringify({ view: ['europe', 'asia', 'na', 'africa'][Math.floor(rand() * 4)] }) : null;
          ev.push({ sql: INS, args: [ts + 1000 * (k + 1), day, 'ev', name, vh, path, 0, null, null, null, cc, city, dev, br, os, 'en', null, null, props] });
        }
        const dur = 8000 + Math.floor(rand() * 90000);
        ts += dur;
        ev.push({ sql: INS, args: [ts, day, 'dur', null, vh, path, 0, null, null, null, cc, city, dev, br, os, 'en', null, dur, JSON.stringify({ sd: Math.floor(rand() * 100) })] });
      }
    }
  }
  for (let i = 0; i < ev.length; i += 800) await client.batch(ev.slice(i, i + 800), 'write');
  console.log(`Demo analytics events added (${ev.length}).`);
}
await rebuildCounts();
console.log(`Demo votes added (${rows.length}). Run "npm run seed:clear" to remove them.`);
