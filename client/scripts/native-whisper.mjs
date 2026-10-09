// `npm run whisper`: starts the native Whisper service the app prefers for speech to text.
//
// Whisper large-v3-turbo, run by whisper.cpp on this machine's GPU: far more accurate and
// several times faster than the Whisper that fits in a browser tab. It listens on this
// machine only (localhost:8178), so the app stays offline. Leave it running next to
// `ollama serve`. If it is not running, the app falls back to Whisper base in the browser.
//
// First run: downloads the model once (1.6 GB, needs internet) to ~/.linewise/.
// Needs whisper.cpp: `brew install whisper-cpp` on macOS.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PORT = 8178; // keep in step with NATIVE_WHISPER_URL in src/ai/native-whisper.ts
const dir = join(homedir(), ".linewise");
// The 1.6 GB model was first downloaded to ~/.linya: move it instead of fetching it again.
const oldDir = join(homedir(), ".linya");
if (await stat(oldDir).then(() => true, () => false) && !(await stat(dir).then(() => true, () => false))) await rename(oldDir, dir);
const model = join(dir, "ggml-large-v3-turbo.bin");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";

if (spawnSync("whisper-server", ["--help"], { stdio: "ignore" }).error) {
  console.error("whisper.cpp is not installed. On macOS: brew install whisper-cpp");
  console.error("Without it the app still works, using Whisper base in the browser.");
  process.exit(1);
}

if (!(await stat(model).then((s) => s.size > 1e9, () => false))) {
  console.log("Downloading Whisper large-v3-turbo (1.6 GB, one time)...");
  await mkdir(dir, { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    console.error(`Download failed (HTTP ${res.status}). Check the internet connection and try again.`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${model}.part`));
  await rename(`${model}.part`, model);
  console.log("Downloaded.");
}

console.log(`Starting Whisper large-v3-turbo on http://localhost:${PORT} — leave this running. Ctrl+C stops it.`);
const server = spawn(
  "whisper-server",
  [
    "-m", model,
    "--host", "127.0.0.1", // this machine only
    "--port", String(PORT),
    "-l", "auto", // detect the spoken language
    "-dtw", "large.v3.turbo", // precise word timing, which the app's speaker assignment relies on
    "-nfa", // required by -dtw
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => server.kill("SIGINT"));
