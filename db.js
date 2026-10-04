import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS votes (
      question_id TEXT NOT NULL,
      device_id   TEXT NOT NULL,
      option_id   TEXT NOT NULL,
      ip_hash     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (question_id, device_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS votes_ip ON votes (question_id, ip_hash);
    CREATE INDEX IF NOT EXISTS votes_device ON votes (device_id);
    -- running tally, so reads never scan the votes table
    CREATE TABLE IF NOT EXISTS counts (
      question_id TEXT NOT NULL,
      option_id   TEXT NOT NULL,
      n           INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (question_id, option_id)
    ) WITHOUT ROWID;
  `);

  const st = {
    getVote: db.prepare('SELECT option_id FROM votes WHERE question_id = ? AND device_id = ?'),
    insVote: db.prepare('INSERT INTO votes (question_id, device_id, option_id, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    updVote: db.prepare('UPDATE votes SET option_id = ?, updated_at = ? WHERE question_id = ? AND device_id = ?'),
    incr: db.prepare('INSERT INTO counts (question_id, option_id, n) VALUES (?, ?, 1) ON CONFLICT (question_id, option_id) DO UPDATE SET n = n + 1'),
    decr: db.prepare('UPDATE counts SET n = n - 1 WHERE question_id = ? AND option_id = ?'),
    ipCount: db.prepare('SELECT COUNT(*) AS c FROM votes WHERE question_id = ? AND ip_hash = ?'),
    counts: db.prepare('SELECT option_id, n FROM counts WHERE question_id = ? AND n > 0'),
    allCounts: db.prepare('SELECT question_id, option_id, n FROM counts WHERE n > 0'),
    mine: db.prepare('SELECT question_id, option_id FROM votes WHERE device_id = ?'),
  };

  return {
    raw: db,
    getVote: (q, dev) => st.getVote.get(q, dev)?.option_id ?? null,
    ipCount: (q, ipHash) => st.ipCount.get(q, ipHash).c,
    counts(q) {
      const out = {};
      for (const r of st.counts.all(q)) out[r.option_id] = r.n;
      return out;
    },
    allCounts() {
      const out = {};
      for (const r of st.allCounts.all()) (out[r.question_id] ??= {})[r.option_id] = r.n;
      return out;
    },
    mine(dev) {
      const out = {};
      for (const r of st.mine.all(dev)) out[r.question_id] = r.option_id;
      return out;
    },
    castVote(q, dev, opt, ipHash) {
      const now = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        const prev = st.getVote.get(q, dev)?.option_id;
        if (prev === undefined) {
          st.insVote.run(q, dev, opt, ipHash, now, now);
          st.incr.run(q, opt);
        } else if (prev !== opt) {
          st.updVote.run(opt, now, q, dev);
          st.decr.run(q, prev);
          st.incr.run(q, opt);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
