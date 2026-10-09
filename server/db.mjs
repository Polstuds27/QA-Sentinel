// Linewise's database: one SQLite file, server/data/linewise.db, using the SQLite that is built
// into Node (no install, nothing to compile). Open it with any SQLite viewer, for example
// "DB Browser for SQLite", or from a terminal:  sqlite3 server/data/linewise.db
//
// Tables:
//   agents            who may send recordings, and the token on each one's phone
//   uploads           every recording a phone sent: which agent, when, and how far along it is
//   calls             every scored call (from a phone or dragged into the app)
//   transcript_lines  what was said on a call, line by line, with the time of each word
//   results           the verdict on each scorecard check for a call
//   decisions         the analyst's Confirm or Dismiss on a flagged check
//   scorecards        the rules calls are scored against
//   settings          small values such as the tunnel address
//
// The audio is not inside the database. It is kept as ordinary files beside it:
//   server/data/uploads/   recordings sent from phones, named by their SHA-256
//   server/data/calls/     recordings dragged into the app, named by the call's id
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(dataDir) {
  // The product was called Linya for a day: carry a database from then over to the new name.
  for (const tail of ["", "-wal", "-shm"]) {
    const old = join(dataDir, `linya.db${tail}`);
    if (existsSync(old) && !existsSync(join(dataDir, `linewise.db${tail}`))) renameSync(old, join(dataDir, `linewise.db${tail}`));
  }
  const db = new DatabaseSync(join(dataDir, "linewise.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS agents (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      device         TEXT NOT NULL,
      token          TEXT NOT NULL UNIQUE,
      created_at     TEXT NOT NULL,
      revoked_at     TEXT,
      last_upload_at TEXT
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id          TEXT PRIMARY KEY,
      hash        TEXT NOT NULL UNIQUE,          -- SHA-256 of the file: the same recording is kept once
      file        TEXT NOT NULL,                 -- name inside data/uploads/
      name        TEXT NOT NULL,                 -- what the phone called it
      size        INTEGER NOT NULL,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      uploaded_at TEXT NOT NULL,
      status      TEXT NOT NULL,                 -- uploaded → processing → scored | failed
      call_id     TEXT,                          -- the call it became, once scored
      score       INTEGER,
      call_status TEXT,
      error       TEXT,
      updated_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS uploads_by_agent ON uploads(agent_id);
    CREATE INDEX IF NOT EXISTS uploads_by_status ON uploads(status);

    CREATE TABLE IF NOT EXISTS calls (
      id         TEXT PRIMARY KEY,
      number     INTEGER,                        -- "Jason Call No. 150"
      agent      TEXT NOT NULL,
      name       TEXT,                           -- file name of the recording
      duration   TEXT NOT NULL,
      scorecard  TEXT NOT NULL,
      speakers   TEXT,                           -- channels | voice | unknown
      languages  TEXT,                           -- JSON array of language codes
      engine     TEXT,                           -- which Whisper transcribed it
      redactions TEXT,                           -- JSON array of customer details to hide
      coaching   TEXT,
      audio_file TEXT,                           -- path under data/, e.g. uploads/ab12….m4a or calls/ai-….m4a
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transcript_lines (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id  TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      time     TEXT NOT NULL,
      speaker  TEXT NOT NULL,
      text     TEXT NOT NULL,
      words    TEXT                              -- JSON array of {start, end, text}
    );
    CREATE INDEX IF NOT EXISTS lines_by_call ON transcript_lines(call_id, position);

    CREATE TABLE IF NOT EXISTS results (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id   TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL,
      check_id  TEXT NOT NULL,
      verdict   TEXT NOT NULL,
      severity  TEXT NOT NULL,
      speaker   TEXT,
      timestamp TEXT,
      evidence  TEXT,
      reason    TEXT
    );
    CREATE INDEX IF NOT EXISTS results_by_call ON results(call_id, position);

    CREATE TABLE IF NOT EXISTS decisions (
      call_id    TEXT NOT NULL,
      check_id   TEXT NOT NULL,
      verdict    TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      PRIMARY KEY (call_id, check_id)
    );

    CREATE TABLE IF NOT EXISTS scorecards (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      checks     TEXT NOT NULL,                  -- JSON array
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  importOldJson(db, dataDir);
  return db;
}

// Before SQLite, agents and uploads lived in data/db.json. Bring that file's contents
// across once, then set it aside so it is not imported again.
function importOldJson(db, dataDir) {
  const file = join(dataDir, "db.json");
  if (!existsSync(file)) return;
  const old = JSON.parse(readFileSync(file, "utf8"));
  const addAgent = db.prepare("INSERT OR IGNORE INTO agents (id, name, device, token, created_at, revoked_at, last_upload_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const addUpload = db.prepare(
    "INSERT OR IGNORE INTO uploads (id, hash, file, name, size, agent_id, uploaded_at, status, call_id, score, call_status, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const a of old.agents ?? []) addAgent.run(a.id, a.name, a.device, a.token, a.createdAt, a.revokedAt ?? null, a.lastUploadAt ?? null);
  for (const r of old.recordings ?? []) {
    addUpload.run(r.id, r.hash, r.file, r.name, r.size ?? 0, r.agentId, r.uploadedAt, r.status, r.callId ?? null, r.score ?? null, r.callStatus ?? null, r.error ?? null, r.updatedAt ?? null);
  }
  if (old.publicUrl) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('publicUrl', ?)").run(old.publicUrl);
  renameSync(file, join(dataDir, "db.json.imported"));
  console.log(`Moved ${old.agents?.length ?? 0} agent(s) and ${old.recordings?.length ?? 0} upload(s) from db.json into linewise.db`);
}
