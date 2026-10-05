// Votes live in libSQL: a local file in development, Turso in production (Vercel).
//   TURSO_DATABASE_URL   libsql://your-db.turso.io   (unset = local file data/votes.db)
//   TURSO_AUTH_TOKEN     token for that database
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

export const DB_URL = process.env.TURSO_DATABASE_URL || 'file:data/votes.db';
export const DB_KIND = DB_URL.startsWith('file:') ? 'local file' : 'turso';
// A read-only filesystem (Vercel without Turso configured) must not crash the whole function at import time.
if (DB_URL.startsWith('file:')) { try { fs.mkdirSync(path.dirname(DB_URL.slice(5)), { recursive: true }); } catch { /* reported by /api/health */ } }

export const client = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS votes (
    question_id TEXT NOT NULL,
    device_id   TEXT NOT NULL,
    option_id   TEXT NOT NULL,
    ip_hash     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (question_id, device_id)
  ) WITHOUT ROWID`,
  'CREATE INDEX IF NOT EXISTS votes_ip ON votes (question_id, ip_hash)',
  'CREATE INDEX IF NOT EXISTS votes_device ON votes (device_id)',
  // first-party analytics: pageviews, time on page and product events. No IPs, no cookies, no raw user agents.
  `CREATE TABLE IF NOT EXISTS ev (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL,
    day     TEXT NOT NULL,
    kind    TEXT NOT NULL,   -- pv = pageview, ev = event, dur = time on page
    name    TEXT,            -- event name
    vh      TEXT NOT NULL,   -- anonymous visitor hash, changes every day
    path    TEXT,
    entry   INTEGER NOT NULL DEFAULT 0, -- 1 = first page of a visit (landing)
    ref     TEXT,            -- referrer host
    utm_s   TEXT, utm_m TEXT, utm_c TEXT,
    country TEXT, region TEXT, city TEXT,
    device  TEXT, browser TEXT, os TEXT, lang TEXT, sw INTEGER,
    dur     INTEGER,
    props   TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS ev_day_kind ON ev (day, kind)',
  'CREATE INDEX IF NOT EXISTS ev_name ON ev (name, day)',
  'CREATE INDEX IF NOT EXISTS ev_vh ON ev (vh, ts)',
  // running tally, so reads never scan the votes table
  `CREATE TABLE IF NOT EXISTS counts (
    question_id TEXT NOT NULL,
    option_id   TEXT NOT NULL,
    n           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (question_id, option_id)
  ) WITHOUT ROWID`,
];

let ready;
export const init = () => (ready ??= client.batch(SCHEMA, 'write').catch((e) => { ready = undefined; throw e; }));

export async function getVote(q, dev) {
  await init();
  const r = await client.execute({ sql: 'SELECT option_id FROM votes WHERE question_id = ? AND device_id = ?', args: [q, dev] });
  return r.rows[0]?.option_id ?? null;
}

export async function ipCount(q, ipHash) {
  await init();
  const r = await client.execute({ sql: 'SELECT COUNT(*) AS c FROM votes WHERE question_id = ? AND ip_hash = ?', args: [q, ipHash] });
  return Number(r.rows[0].c);
}

export async function counts(q) {
  await init();
  const r = await client.execute({ sql: 'SELECT option_id, n FROM counts WHERE question_id = ? AND n > 0', args: [q] });
  const out = {};
  for (const row of r.rows) out[row.option_id] = Number(row.n);
  return out;
}

export async function allCounts() {
  await init();
  const r = await client.execute('SELECT question_id, option_id, n FROM counts WHERE n > 0');
  const out = {};
  for (const row of r.rows) (out[row.question_id] ??= {})[row.option_id] = Number(row.n);
  return out;
}

export async function mine(dev) {
  await init();
  const r = await client.execute({ sql: 'SELECT question_id, option_id FROM votes WHERE device_id = ?', args: [dev] });
  const out = {};
  for (const row of r.rows) out[row.question_id] = row.option_id;
  return out;
}

// One atomic batch: move the tally off the old answer, onto the new one, then store the vote.
// Safe even if the same device votes twice at once.
export async function castVote(q, dev, opt, ipHash) {
  await init();
  const now = Date.now();
  await client.batch([
    {
      sql: `UPDATE counts SET n = n - 1 WHERE question_id = :q AND option_id != :o
            AND option_id = (SELECT option_id FROM votes WHERE question_id = :q AND device_id = :d)`,
      args: { q, o: opt, d: dev },
    },
    {
      sql: `INSERT INTO counts (question_id, option_id, n)
            SELECT :q, :o, 1 WHERE NOT EXISTS (SELECT 1 FROM votes WHERE question_id = :q AND device_id = :d AND option_id = :o)
            ON CONFLICT (question_id, option_id) DO UPDATE SET n = n + 1`,
      args: { q, o: opt, d: dev },
    },
    {
      sql: `INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at)
            VALUES (:q, :d, :o, :ip, :now, :now)
            ON CONFLICT (question_id, device_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at`,
      args: { q, d: dev, o: opt, ip: ipHash, now },
    },
  ], 'write');
}

// What do the people who said they are from `cc` answer elsewhere? Joins on the device that gave each answer.
// Returns { voters, byQuestion: { qid: { optionId: n } } }. Cached briefly because it is the heaviest query.
const profileCache = new Map();
export async function countryProfile(cc) {
  const hit = profileCache.get(cc);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  await init();
  const [rs, vs] = await Promise.all([
    client.execute({
      sql: `SELECT v.question_id, v.option_id, COUNT(*) AS n
            FROM votes v JOIN votes c ON c.device_id = v.device_id AND c.question_id = 'country' AND c.option_id = ?
            WHERE v.question_id != 'country' AND v.question_id NOT LIKE 'place-%'
            GROUP BY v.question_id, v.option_id`,
      args: [cc],
    }),
    client.execute({ sql: "SELECT n FROM counts WHERE question_id = 'country' AND option_id = ?", args: [cc] }),
  ]);
  const byQuestion = {};
  for (const r of rs.rows) (byQuestion[r.question_id] ??= {})[r.option_id] = Number(r.n);
  const v = { voters: Number(vs.rows[0]?.n || 0), byQuestion };
  profileCache.set(cc, { at: Date.now(), v });
  if (profileCache.size > 300) profileCache.delete(profileCache.keys().next().value);
  return v;
}

// Simple end-to-end check for /api/health: can we read and write?
export async function health() {
  await init();
  const t = await client.execute('SELECT COALESCE(SUM(n), 0) AS votes FROM counts');
  return { votes: Number(t.rows[0].votes) };
}
