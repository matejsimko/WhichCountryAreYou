// LOCAL DEMO DATA ONLY. Fills the database with fake votes so the pages have something to show.
//   npm run seed         add demo votes
//   npm run seed:clear   remove them again (real votes are untouched)
// Never run this against the production database.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { QUESTIONS } from '../questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'votes.db'));
const raw = db.raw;

raw.exec('BEGIN');
raw.exec("DELETE FROM votes WHERE device_id LIKE 'seed-%'");
raw.exec('DELETE FROM counts');
raw.exec('INSERT INTO counts (question_id, option_id, n) SELECT question_id, option_id, COUNT(*) FROM votes GROUP BY question_id, option_id');
raw.exec('COMMIT');
if (process.argv.includes('--clear')) { console.log('Demo votes removed.'); process.exit(0); }

// deterministic-ish random
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

const BIG = { IN: 9, US: 8, BR: 6, ID: 4, NG: 3.5, DE: 4, GB: 4.5, MX: 3, SK: 3, PL: 2.8, FR: 3, IT: 3, JP: 2.5, TR: 2.5, ES: 2.5, CA: 3, AU: 2.2, NL: 2, CZ: 1.6, PH: 2.5, EG: 2 };
const insert = raw.prepare('INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const bump = raw.prepare('INSERT INTO counts (question_id, option_id, n) VALUES (?, ?, 1) ON CONFLICT (question_id, option_id) DO UPDATE SET n = n + 1');

raw.exec('BEGIN');
const now = Date.now();
for (const q of QUESTIONS) {
  const duel = q.options.length === 2;
  const weights = q.options.map((o, i) => {
    if (q.kind === 'countries') return BIG[o.id] ?? 0.15 + rand() * 0.9;
    if (duel) return i === 0 ? 0.25 + rand() * 0.75 : 0.25 + rand() * 0.75;
    return 1 / (1 + i * 0.55) + rand() * 0.25;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const N = q.kind === 'countries' ? 5200 : 1800 + Math.floor(rand() * 2500);
  for (let i = 0; i < N; i++) {
    let r = rand() * sum, idx = 0;
    while (r > weights[idx] && idx < weights.length - 1) r -= weights[idx++];
    const opt = q.options[idx].id;
    insert.run(q.id, `seed-${q.id}-${i}`, opt, 'seed', now, now);
    bump.run(q.id, opt);
  }
}
raw.exec('COMMIT');
console.log('Demo votes added. Run "npm run seed:clear" to remove them.');
