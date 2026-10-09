// Linewise upload server: lets agents send call recordings from their phones to the QA
// laptop. It only receives and queues files. Transcribing and scoring still happen in
// the Linewise app on this laptop, which polls this server for new recordings.
//
//   npm start            (from server/)   or   npm run server   (from frontend/)
//
// Everything is kept in server/data/: linewise.db (a SQLite database, see db.mjs for its
// tables) and the audio as ordinary files in uploads/ and calls/. The app loads and saves
// its calls here too, so they are the same in every browser and survive clearing one.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import express from "express";
import multer from "multer";
import { openDatabase } from "./db.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_MB = 200; // a one-hour call in AAC is well under this
const AUDIO = new Set([".m4a", ".mp4", ".caf", ".wav", ".mp3", ".aac", ".aif", ".aiff", ".qta"]);
const DATA = process.env.LINEWISE_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "data");
const UPLOADS = join(DATA, "uploads");
const CALLS = join(DATA, "calls");
await mkdir(UPLOADS, { recursive: true });
await mkdir(CALLS, { recursive: true });

// ---------- storage ----------
const db = openDatabase(DATA);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
// A recording left "processing" by a closed browser tab goes back in the queue.
run("UPDATE uploads SET status = 'uploaded' WHERE status = 'processing'");

const now = () => new Date().toISOString();
const newId = () => randomBytes(6).toString("hex");
const json = (text, fallback) => {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
};

// Rows as the app expects them.
const agentOut = (a) => ({ id: a.id, name: a.name, device: a.device, token: a.token, createdAt: a.created_at, revokedAt: a.revoked_at, lastUploadAt: a.last_upload_at });
const UPLOAD_ROWS = "SELECT u.*, a.name AS agent_name, a.device AS agent_device FROM uploads u LEFT JOIN agents a ON a.id = u.agent_id";
const uploadOut = (u) => ({
  id: u.id,
  name: u.name,
  size: u.size,
  agentId: u.agent_id,
  agent: u.agent_name ?? "Unknown",
  device: u.agent_device ?? "",
  uploadedAt: u.uploaded_at,
  status: u.status,
  callId: u.call_id ?? undefined,
  score: u.score ?? undefined,
  callStatus: u.call_status ?? undefined,
  error: u.error ?? undefined,
});
function callOut(c) {
  return {
    id: c.id,
    number: c.number ?? undefined,
    agent: c.agent,
    name: c.name ?? undefined,
    duration: c.duration,
    scorecard: c.scorecard,
    speakers: c.speakers ?? undefined,
    languages: json(c.languages, undefined),
    engine: c.engine ?? undefined,
    redactions: json(c.redactions, undefined),
    coaching: c.coaching ?? undefined,
    hasAudio: !!c.audio_file && existsSync(join(DATA, c.audio_file)),
    lines: all("SELECT time, speaker, text, words FROM transcript_lines WHERE call_id = ? ORDER BY position", c.id).map((l) => ({
      time: l.time,
      speaker: l.speaker,
      text: l.text,
      words: json(l.words, undefined),
    })),
    results: all("SELECT check_id, verdict, severity, speaker, timestamp, evidence, reason FROM results WHERE call_id = ? ORDER BY position", c.id).map((r) => ({
      check_id: r.check_id,
      verdict: r.verdict,
      severity: r.severity,
      speaker: r.speaker ?? undefined,
      timestamp: r.timestamp ?? undefined,
      evidence: r.evidence ?? undefined,
      reason: r.reason ?? undefined,
    })),
  };
}

// ---------- who is asking ----------
// Admin routes (agents, tokens, uploads, calls) are for the Linewise app on this laptop only.
// A tunnel (Cloudflare, ngrok) also connects from this laptop, but it always adds a
// forwarding header, so anything that came through a tunnel is refused.
function adminOnly(req, res, next) {
  const ip = req.socket.remoteAddress ?? "";
  const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const forwarded = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "ngrok-skip-browser-warning"].some((h) => req.headers[h]);
  if (!local || forwarded) return res.status(403).json({ ok: false, message: "Only available on the Linewise laptop itself." });
  next();
}

// A device proves who it is with its token: "Authorization: Bearer <token>", or
// "?token=<token>" in the link (which is what the Apple Shortcut uses).
function device(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : String(req.query.token ?? "");
  const agent = token && one("SELECT * FROM agents WHERE token = ?", token);
  if (!agent) return res.status(401).json({ ok: false, message: "This device is not registered with Linewise. Ask your QA lead for a new link." });
  if (agent.revoked_at) return res.status(401).json({ ok: false, message: "This device's access was turned off. Ask your QA lead for a new link." });
  req.agent = agent;
  next();
}

const app = express();
app.use(express.json({ limit: "20mb" })); // a long call's transcript, with a time for every word

// ---------- device routes ----------
app.get("/api/ping", device, (req, res) => res.json({ ok: true, message: `Connected to Linewise as ${req.agent.name}.` }));

// An agent who scans their QR code lands here in the phone's browser. The link is meant
// for the shortcut, not for opening, so show a page that says it works and lets them copy it.
const page = (title, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linewise</title><style>
  :root { color-scheme: light dark; --bg: #fafaf8; --fg: #111111; --muted: #5d5d58; --accent: #1d3fd1; --on: #ffffff; --line: #dcdcd8; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e0e0e; --fg: #f2f2ef; --muted: #a5a5a0; --accent: #7d97ff; --on: #0e0e0e; --line: #2c2c2a; } }
  body { margin: 0; padding: 48px 20px; background: var(--bg); color: var(--fg); font: 17px/1.6 -apple-system, system-ui, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; }
  h1 { font-size: 2rem; line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 16px; }
  p { margin: 0 0 16px; } .muted { color: var(--muted); font-size: 15px; }
  code { display: block; padding: 12px; border: 1px solid var(--line); font: 14px/1.5 ui-monospace, monospace; word-break: break-all; margin: 0 0 16px; }
  button { height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on); font: 500 17px system-ui, sans-serif; }
  ol { padding-left: 1.2em; margin: 0 0 16px; } li { margin-bottom: 8px; }
</style><main><h1>${title}</h1>${body}</main></html>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

app.get("/api/uploads", (req, res) => {
  const token = String(req.query.token ?? "");
  const agent = token && one("SELECT * FROM agents WHERE token = ?", token);
  if (!agent || agent.revoked_at) {
    return res.status(401).send(page("This link does not work", `<p>${agent ? "This device's access was turned off." : "Linewise does not recognise this link."} Ask your QA lead for a new one.</p>`));
  }
  const link = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  res.send(
    page(
      `You're connected, ${esc(agent.name)}`,
      `<p>Your phone can reach Linewise. This is your personal upload link:</p>
       <code id="link">${esc(link)}</code>
       <p><button onclick="copyLink(this)">Copy link</button></p>
       <script>
         // On a plain http address phones do not offer the modern clipboard, so fall back
         // to selecting the link and using the older copy command, which works there.
         function copyLink(button) {
           var text = document.getElementById('link').textContent;
           var done = function () { button.textContent = 'Copied'; };
           if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, old); } else { old(); }
           function old() {
             var box = document.createElement('textarea');
             box.value = text; box.setAttribute('readonly', ''); box.style.position = 'fixed'; box.style.opacity = '0';
             document.body.appendChild(box); box.select(); box.setSelectionRange(0, text.length);
             var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
             document.body.removeChild(box);
             button.textContent = ok ? 'Copied' : 'Press and hold the link to copy';
           }
         }
       </script>
       <p>Next:</p>
       <ol><li>Tap <b>Copy link</b>. If nothing happens, press and hold the link above and choose Copy.</li>
       <li>Add the <b>Send to Linewise</b> shortcut your QA lead sent you.</li>
       <li>When it asks for your Linewise upload link, paste.</li></ol>
       <p class="muted">Keep this link to yourself. Recordings sent with it arrive under your name.</p>`,
    ),
  );
});

const upload = multer({ dest: join(DATA, "incoming"), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });
const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (d) => hash.update(d)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });

app.post("/api/uploads", device, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, message: 'No recording received. Send it as the form field "file".' });
  let ext = extname(file.originalname || "").toLowerCase() || ".m4a";
  if (!AUDIO.has(ext)) {
    await rm(file.path, { force: true });
    return res.status(415).json({ ok: false, message: `Linewise can't read ${ext} files. Send the audio recording itself.` });
  }
  // The same recording sent twice (a double tap, two devices) is stored and scored once.
  const hash = await sha256(file.path);
  if (one("SELECT id FROM uploads WHERE hash = ?", hash)) {
    await rm(file.path, { force: true });
    return res.json({ ok: true, duplicate: true, message: "Linewise already has this recording. Nothing to do." });
  }
  let stored = join(UPLOADS, `${hash}${ext}`);
  await rename(file.path, stored);
  // Browsers cannot decode Apple's CAF or AIFF. On a Mac, convert them once on arrival.
  if ([".caf", ".aif", ".aiff", ".qta"].includes(ext) && process.platform === "darwin") {
    try {
      const wav = join(UPLOADS, `${hash}.wav`);
      await promisify(execFile)("afconvert", ["-f", "WAVE", "-d", "LEI16", stored, wav]);
      await rm(stored, { force: true });
      stored = wav;
      ext = ".wav";
    } catch {
      // keep the original; the app will report it if it cannot be read
    }
  }
  const name = file.originalname || `recording${ext}`;
  const at = now();
  run("INSERT INTO uploads (id, hash, file, name, size, agent_id, uploaded_at, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)", newId(), hash, `${hash}${ext}`, name, file.size, req.agent.id, at, at);
  run("UPDATE agents SET last_upload_at = ? WHERE id = ?", at, req.agent.id);
  const waiting = one("SELECT COUNT(*) AS n FROM uploads WHERE status IN ('uploaded', 'processing')").n;
  console.log(`upload  ${req.agent.name} (${req.agent.device})  ${name}  ${(file.size / 1e6).toFixed(1)} MB`);
  res.json({ ok: true, message: waiting > 1 ? `Sent to Linewise. ${waiting - 1} recording(s) ahead of it in the queue.` : "Sent to Linewise. It will be scored shortly." });
});

// ---------- admin routes (the Linewise app on this laptop) ----------
const lanUrls = () =>
  Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => `http://${n.address}:${PORT}`);
const publicUrl = () => one("SELECT value FROM settings WHERE key = 'publicUrl'")?.value ?? "";

app.get("/api/info", adminOnly, (_req, res) => res.json({ ok: true, lanUrls: lanUrls(), publicUrl: publicUrl(), maxMb: MAX_MB, storage: "sqlite" }));

// The https address of a tunnel, if one is running, so links and QR codes can use it.
app.post("/api/info", adminOnly, (req, res) => {
  const url = String(req.body?.publicUrl ?? "").trim().replace(/\/+$/, "");
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('publicUrl', ?)", url);
  res.json({ ok: true, publicUrl: url });
});

// ----- agents -----
app.get("/api/agents", adminOnly, (_req, res) => res.json({ ok: true, agents: all("SELECT * FROM agents ORDER BY created_at").map(agentOut) }));

app.post("/api/agents", adminOnly, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const deviceName = String(req.body?.device ?? "").trim() || "iPhone";
  if (!name) return res.status(400).json({ ok: false, message: "Give the agent a name." });
  const id = newId();
  run("INSERT INTO agents (id, name, device, token, created_at) VALUES (?, ?, ?, ?, ?)", id, name, deviceName, randomBytes(24).toString("base64url"), now());
  res.json({ ok: true, agent: agentOut(one("SELECT * FROM agents WHERE id = ?", id)) });
});

app.post("/api/agents/:id/revoke", adminOnly, (req, res) => {
  if (run("UPDATE agents SET revoked_at = ? WHERE id = ?", now(), req.params.id).changes === 0) return res.status(404).json({ ok: false, message: "No such agent." });
  res.json({ ok: true, agent: agentOut(one("SELECT * FROM agents WHERE id = ?", req.params.id)) });
});

// ----- uploads (recordings sent from phones) -----
app.get("/api/recordings", adminOnly, (req, res) => {
  const { agentId, status } = req.query;
  const rows = all(`${UPLOAD_ROWS} ORDER BY u.uploaded_at DESC`).filter((u) => (!agentId || u.agent_id === agentId) && (!status || u.status === status));
  res.json({ ok: true, recordings: rows.map(uploadOut) });
});

// The app takes the oldest waiting recording, one at a time: that is the queue.
app.post("/api/recordings/next", adminOnly, (_req, res) => {
  // The app says "still working" every few seconds while it scores a recording. If that
  // stops (the tab was closed or reloaded mid-way), the recording goes back in the queue.
  run("UPDATE uploads SET status = 'uploaded' WHERE status = 'processing' AND updated_at < ?", new Date(Date.now() - 30_000).toISOString());
  if (one("SELECT id FROM uploads WHERE status = 'processing'")) return res.json({ ok: true, recording: null });
  const next = one("SELECT id FROM uploads WHERE status = 'uploaded' ORDER BY uploaded_at LIMIT 1");
  if (!next) return res.json({ ok: true, recording: null });
  run("UPDATE uploads SET status = 'processing', updated_at = ? WHERE id = ?", now(), next.id);
  res.json({ ok: true, recording: uploadOut(one(`${UPLOAD_ROWS} WHERE u.id = ?`, next.id)) });
});

app.get("/api/recordings/:id/audio", adminOnly, (req, res) => {
  const u = one("SELECT file FROM uploads WHERE id = ?", req.params.id);
  if (!u) return res.status(404).json({ ok: false, message: "No such recording." });
  res.sendFile(join(UPLOADS, u.file));
});

app.post("/api/recordings/:id/status", adminOnly, (req, res) => {
  const { status, callId, score, callStatus, error } = req.body ?? {};
  if (!["uploaded", "processing", "scored", "failed"].includes(status)) return res.status(400).json({ ok: false, message: "Unknown status." });
  const done = run(
    "UPDATE uploads SET status = ?, call_id = COALESCE(?, call_id), score = COALESCE(?, score), call_status = COALESCE(?, call_status), error = ?, updated_at = ? WHERE id = ?",
    status, callId ?? null, score ?? null, callStatus ?? null, error ? String(error).slice(0, 300) : null, now(), req.params.id,
  );
  if (done.changes === 0) return res.status(404).json({ ok: false, message: "No such recording." });
  res.json({ ok: true });
});

// ----- calls (everything that has been scored) -----
app.get("/api/calls", adminOnly, (_req, res) => res.json({ ok: true, calls: all("SELECT * FROM calls ORDER BY created_at DESC").map(callOut) }));

// Saves a scored call, replacing it if it is already there. `uploadId` says the audio is
// a recording a phone sent, which is already on disk and is not copied.
app.put("/api/calls/:id", adminOnly, (req, res) => {
  const c = req.body ?? {};
  const id = req.params.id;
  if (!c.agent || !Array.isArray(c.lines) || !Array.isArray(c.results)) return res.status(400).json({ ok: false, message: "Not a call." });
  const upload = c.uploadId ? one("SELECT file FROM uploads WHERE id = ?", c.uploadId) : null;
  const kept = one("SELECT audio_file, created_at, coaching FROM calls WHERE id = ?", id);
  db.exec("BEGIN");
  try {
    run("DELETE FROM calls WHERE id = ?", id); // lines and results go with it
    run(
      "INSERT INTO calls (id, number, agent, name, duration, scorecard, speakers, languages, engine, redactions, coaching, audio_file, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, c.number ?? null, c.agent, c.name ?? null, c.duration ?? "0:00", c.scorecard ?? "", c.speakers ?? null,
      c.languages ? JSON.stringify(c.languages) : null, c.engine ?? null, c.redactions ? JSON.stringify(c.redactions) : null,
      c.coaching ?? kept?.coaching ?? null, upload ? `uploads/${upload.file}` : (kept?.audio_file ?? null), c.createdAt ?? kept?.created_at ?? now(),
    );
    c.lines.forEach((l, i) => run("INSERT INTO transcript_lines (call_id, position, time, speaker, text, words) VALUES (?, ?, ?, ?, ?, ?)", id, i, l.time, l.speaker, l.text, l.words ? JSON.stringify(l.words) : null));
    c.results.forEach((r, i) =>
      run("INSERT INTO results (call_id, position, check_id, verdict, severity, speaker, timestamp, evidence, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, i, r.check_id, r.verdict, r.severity ?? "normal", r.speaker ?? null, r.timestamp ?? null, r.evidence ?? null, r.reason ?? null),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json({ ok: true });
});

// The recording for a call that was dragged into the app, sent as the raw file.
app.post("/api/calls/:id/audio", adminOnly, express.raw({ type: () => true, limit: `${MAX_MB}mb` }), async (req, res) => {
  const id = req.params.id;
  if (!one("SELECT id FROM calls WHERE id = ?", id)) return res.status(404).json({ ok: false, message: "No such call." });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ ok: false, message: "No audio received." });
  const named = extname(String(req.headers["x-file-name"] ?? "")).toLowerCase();
  const file = `${id.replace(/[^\w-]/g, "")}${AUDIO.has(named) ? named : ".m4a"}`;
  await writeFile(join(CALLS, file), req.body);
  run("UPDATE calls SET audio_file = ? WHERE id = ?", `calls/${file}`, id);
  res.json({ ok: true });
});

app.get("/api/calls/:id/audio", adminOnly, (req, res) => {
  const c = one("SELECT audio_file FROM calls WHERE id = ?", req.params.id);
  if (!c?.audio_file || !existsSync(join(DATA, c.audio_file))) return res.status(404).json({ ok: false, message: "This call has no recording." });
  res.sendFile(join(DATA, c.audio_file));
});

app.delete("/api/calls/:id", adminOnly, async (req, res) => {
  const c = one("SELECT audio_file FROM calls WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ ok: false, message: "No such call." });
  run("DELETE FROM calls WHERE id = ?", req.params.id);
  run("DELETE FROM decisions WHERE call_id = ?", req.params.id);
  // A recording dragged into the app goes with its call. One a phone sent stays in
  // uploads/, where the upload's own row still points at it, minus the link to the call.
  run("UPDATE uploads SET call_id = NULL WHERE call_id = ?", req.params.id);
  if (c.audio_file?.startsWith("calls/")) await rm(join(DATA, c.audio_file), { force: true });
  res.json({ ok: true });
});

app.put("/api/calls/:id/coaching", adminOnly, (req, res) => {
  run("UPDATE calls SET coaching = ? WHERE id = ?", String(req.body?.note ?? ""), req.params.id);
  res.json({ ok: true });
});

// ----- analyst decisions -----
app.get("/api/decisions", adminOnly, (_req, res) =>
  res.json({ ok: true, decisions: Object.fromEntries(all("SELECT call_id, check_id, verdict FROM decisions").map((d) => [`${d.call_id}:${d.check_id}`, d.verdict])) }),
);

// Confirm or Dismiss: records the decision and makes it the call's verdict for that check.
app.post("/api/calls/:id/decision", adminOnly, (req, res) => {
  const { checkId, verdict } = req.body ?? {};
  if (!checkId || !["pass", "fail"].includes(verdict)) return res.status(400).json({ ok: false, message: "Not a decision." });
  run("INSERT OR REPLACE INTO decisions (call_id, check_id, verdict, decided_at) VALUES (?, ?, ?, ?)", req.params.id, checkId, verdict, now());
  run("UPDATE results SET verdict = ? WHERE call_id = ? AND check_id = ?", verdict, req.params.id, checkId);
  res.json({ ok: true });
});

// ----- scorecard -----
app.get("/api/scorecards/:id", adminOnly, (req, res) => {
  const row = one("SELECT checks FROM scorecards WHERE id = ?", req.params.id);
  res.json({ ok: true, checks: row ? json(row.checks, null) : null });
});

app.put("/api/scorecards/:id", adminOnly, (req, res) => {
  if (!Array.isArray(req.body?.checks)) return res.status(400).json({ ok: false, message: "Not a scorecard." });
  run("INSERT OR REPLACE INTO scorecards (id, name, checks, updated_at) VALUES (?, ?, ?, ?)", req.params.id, String(req.body.name ?? req.params.id), JSON.stringify(req.body.checks), now());
  res.json({ ok: true });
});

// Errors from multer (file too large) and anything unexpected, as the short JSON a Shortcut can show.
app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE" || err?.type === "entity.too.large") return res.status(413).json({ ok: false, message: `That recording is over ${MAX_MB} MB, which is the limit.` });
  console.error(err);
  res.status(500).json({ ok: false, message: "Linewise could not save that. Try again." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Linewise upload server on port ${PORT}`);
  console.log(`  this laptop:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  same Wi-Fi:    ${url}`);
  console.log(`  database:      ${join(DATA, "linewise.db")}`);
  console.log("Add agents and get their upload links in the Linewise app, Agents tab.");
});
