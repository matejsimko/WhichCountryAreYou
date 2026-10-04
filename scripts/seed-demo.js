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
await rebuildCounts();
if (process.argv.includes('--clear')) { console.log('Demo votes removed.'); process.exit(0); }

// deterministic-ish random
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

const BIG = { IN: 9, US: 8, BR: 6, ID: 4, NG: 3.5, DE: 4, GB: 4.5, MX: 3, SK: 3, PL: 2.8, FR: 3, IT: 3, JP: 2.5, TR: 2.5, ES: 2.5, CA: 3, AU: 2.2, NL: 2, CZ: 1.6, PH: 2.5, EG: 2 };
const now = Date.now();
const rows = [];
for (const q of QUESTIONS) {
  const duel = q.options.length === 2;
  const weights = q.options.map((o, i) => {
    if (q.kind === 'countries') return BIG[o.id] ?? 0.15 + rand() * 0.9;
    if (duel) return 0.25 + rand() * 0.75;
    return 1 / (1 + i * 0.55) + rand() * 0.25;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const N = q.kind === 'countries' ? 5200 : 1800 + Math.floor(rand() * 2500);
  for (let i = 0; i < N; i++) {
    let r = rand() * sum, idx = 0;
    while (r > weights[idx] && idx < weights.length - 1) r -= weights[idx++];
    rows.push({ sql: 'INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [q.id, `seed-${q.id}-${i}`, q.options[idx].id, 'seed', now, now] });
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
await rebuildCounts();
console.log(`Demo votes added (${rows.length}). Run "npm run seed:clear" to remove them.`);
