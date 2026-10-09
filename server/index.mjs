// Linya upload server: lets agents send call recordings from their phones to the QA
// laptop. It only receives and queues files. Transcribing and scoring still happen in
// the Linya app on this laptop, which polls this server for new recordings.
//
//   npm start            (from server/)   or   npm run server   (from frontend/)
//
// Storage is two things in server/data/: db.json (agents, tokens, recordings) and
// uploads/ (the audio, named by its SHA-256). No database to install.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import express from "express";
import multer from "multer";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_MB = 200; // a one-hour call in AAC is well under this
const AUDIO = new Set([".m4a", ".mp4", ".caf", ".wav", ".mp3", ".aac", ".aif", ".aiff", ".qta"]);
const DATA = process.env.LINYA_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "data");
const UPLOADS = join(DATA, "uploads");
const DB_FILE = join(DATA, "db.json");
await mkdir(UPLOADS, { recursive: true });

// ---------- storage ----------
let db = { agents: [], recordings: [], publicUrl: "" };
try {
  db = { ...db, ...JSON.parse(await readFile(DB_FILE, "utf8")) };
} catch {
  // first run
}
// A recording left "processing" by a closed browser tab goes back in the queue.
for (const r of db.recordings) if (r.status === "processing") r.status = "uploaded";
let writing = Promise.resolve();
const save = () => (writing = writing.then(() => writeFile(DB_FILE, JSON.stringify(db, null, 2))));
await save();

const now = () => new Date().toISOString();
const newId = () => randomBytes(6).toString("hex");
const agentOf = (id) => db.agents.find((a) => a.id === id);

// ---------- who is asking ----------
// Admin routes (agents, tokens, recordings) are for the Linya app on this laptop only.
// A tunnel (Cloudflare, ngrok) also connects from this laptop, but it always adds a
// forwarding header, so anything that came through a tunnel is refused.
function adminOnly(req, res, next) {
  const ip = req.socket.remoteAddress ?? "";
  const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const forwarded = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "ngrok-skip-browser-warning"].some((h) => req.headers[h]);
  if (!local || forwarded) return res.status(403).json({ ok: false, message: "Only available on the Linya laptop itself." });
  next();
}

// A device proves who it is with its token: "Authorization: Bearer <token>", or
// "?token=<token>" in the link (which is what the Apple Shortcut uses).
function device(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : String(req.query.token ?? "");
  const agent = token && db.agents.find((a) => a.token === token);
  if (!agent) return res.status(401).json({ ok: false, message: "This device is not registered with Linya. Ask your QA lead for a new link." });
  if (agent.revokedAt) return res.status(401).json({ ok: false, message: "This device's access was turned off. Ask your QA lead for a new link." });
  req.agent = agent;
  next();
}

const app = express();
app.use(express.json());

// ---------- device routes ----------
app.get("/api/ping", device, (req, res) => res.json({ ok: true, message: `Connected to Linya as ${req.agent.name}.` }));

// An agent who scans their QR code lands here in the phone's browser. The link is meant
// for the shortcut, not for opening, so show a page that says it works and lets them copy it.
const page = (title, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linya</title><style>
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
  const agent = token && db.agents.find((a) => a.token === token);
  if (!agent || agent.revokedAt) {
    return res.status(401).send(page("This link does not work", `<p>${agent ? "This device's access was turned off." : "Linya does not recognise this link."} Ask your QA lead for a new one.</p>`));
  }
  const link = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  res.send(
    page(
      `You're connected, ${esc(agent.name)}`,
      `<p>Your phone can reach Linya. This is your personal upload link:</p>
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
       <li>Add the <b>Send to Linya</b> shortcut your QA lead sent you.</li>
       <li>When it asks for your Linya upload link, paste.</li></ol>
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
    return res.status(415).json({ ok: false, message: `Linya can't read ${ext} files. Send the audio recording itself.` });
  }
  // The same recording sent twice (a double tap, two devices) is stored and scored once.
  const hash = await sha256(file.path);
  const existing = db.recordings.find((r) => r.hash === hash);
  if (existing) {
    await rm(file.path, { force: true });
    return res.json({ ok: true, duplicate: true, message: "Linya already has this recording. Nothing to do." });
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
  const recording = {
    id: newId(),
    hash,
    file: `${hash}${ext}`,
    name: file.originalname || `recording${ext}`,
    size: file.size,
    agentId: req.agent.id,
    uploadedAt: now(),
    status: "uploaded", // uploaded → processing → scored | failed
  };
  db.recordings.unshift(recording);
  req.agent.lastUploadAt = recording.uploadedAt;
  await save();
  const waiting = db.recordings.filter((r) => r.status === "uploaded" || r.status === "processing").length;
  console.log(`upload  ${req.agent.name} (${req.agent.device})  ${recording.name}  ${(file.size / 1e6).toFixed(1)} MB`);
  res.json({ ok: true, message: waiting > 1 ? `Sent to Linya. ${waiting - 1} recording(s) ahead of it in the queue.` : "Sent to Linya. It will be scored shortly." });
});

// ---------- admin routes (the Linya app on this laptop) ----------
const lanUrls = () =>
  Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => `http://${n.address}:${PORT}`);

app.get("/api/info", adminOnly, (_req, res) => res.json({ ok: true, lanUrls: lanUrls(), publicUrl: db.publicUrl, maxMb: MAX_MB }));

// The https address of a tunnel, if one is running, so links and QR codes can use it.
app.post("/api/info", adminOnly, async (req, res) => {
  db.publicUrl = String(req.body?.publicUrl ?? "").trim().replace(/\/+$/, "");
  await save();
  res.json({ ok: true, publicUrl: db.publicUrl });
});

app.get("/api/agents", adminOnly, (_req, res) => res.json({ ok: true, agents: db.agents }));

app.post("/api/agents", adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const deviceName = String(req.body?.device ?? "").trim() || "iPhone";
  if (!name) return res.status(400).json({ ok: false, message: "Give the agent a name." });
  const agent = { id: newId(), name, device: deviceName, token: randomBytes(24).toString("base64url"), createdAt: now(), revokedAt: null, lastUploadAt: null };
  db.agents.push(agent);
  await save();
  res.json({ ok: true, agent });
});

app.post("/api/agents/:id/revoke", adminOnly, async (req, res) => {
  const agent = agentOf(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, message: "No such agent." });
  agent.revokedAt = now();
  await save();
  res.json({ ok: true, agent });
});

const withAgent = (r) => ({ ...r, agent: agentOf(r.agentId)?.name ?? "Unknown", device: agentOf(r.agentId)?.device ?? "" });

app.get("/api/recordings", adminOnly, (req, res) => {
  const { agentId, status } = req.query;
  res.json({ ok: true, recordings: db.recordings.filter((r) => (!agentId || r.agentId === agentId) && (!status || r.status === status)).map(withAgent) });
});

// The app takes the oldest waiting recording, one at a time: that is the queue.
app.post("/api/recordings/next", adminOnly, async (_req, res) => {
  // The app says "still working" every few seconds while it scores a recording. If that
  // stops (the tab was closed or reloaded mid-way), the recording goes back in the queue.
  for (const r of db.recordings) {
    if (r.status === "processing" && Date.now() - new Date(r.updatedAt ?? 0).getTime() > 30_000) r.status = "uploaded";
  }
  if (db.recordings.some((r) => r.status === "processing")) return res.json({ ok: true, recording: null });
  const next = [...db.recordings].reverse().find((r) => r.status === "uploaded");
  if (!next) return res.json({ ok: true, recording: null });
  next.status = "processing";
  next.updatedAt = now();
  await save();
  res.json({ ok: true, recording: withAgent(next) });
});

app.get("/api/recordings/:id/audio", adminOnly, (req, res) => {
  const r = db.recordings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, message: "No such recording." });
  res.sendFile(join(UPLOADS, r.file));
});

app.post("/api/recordings/:id/status", adminOnly, async (req, res) => {
  const r = db.recordings.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, message: "No such recording." });
  const { status, callId, score, callStatus, error } = req.body ?? {};
  if (!["uploaded", "processing", "scored", "failed"].includes(status)) return res.status(400).json({ ok: false, message: "Unknown status." });
  Object.assign(r, { status, callId, score, callStatus, error: error ? String(error).slice(0, 300) : undefined, updatedAt: now() });
  await save();
  res.json({ ok: true });
});

// Errors from multer (file too large) and anything unexpected, as the short JSON a Shortcut can show.
app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok: false, message: `That recording is over ${MAX_MB} MB, which is the limit.` });
  console.error(err);
  res.status(500).json({ ok: false, message: "Linya could not save the recording. Try again." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Linya upload server on port ${PORT}`);
  console.log(`  this laptop:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  same Wi-Fi:    ${url}`);
  console.log("Add agents and get their upload links in the Linya app, Agents tab.");
});
