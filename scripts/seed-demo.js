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
for (let i = 0; i < rows.length; i += 1000) await client.batch(rows.slice(i, i + 1000), 'write');
await rebuildCounts();
console.log(`Demo votes added (${rows.length}). Run "npm run seed:clear" to remove them.`);
