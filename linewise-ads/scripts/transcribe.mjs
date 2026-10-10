// Copies a voiceover into public/, checks its length, and transcribes it locally with
// whisper.cpp into src/transcript.json (word-level timestamps for the captions).
//
//   node scripts/transcribe.mjs <path-to-voiceover>
//
// WHISPER_MODEL overrides the model (default base.en). Nothing is uploaded anywhere.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";

// Keep in sync with DURATION_SECONDS in src/timing.ts.
const MAX_SECONDS = 60;
const WHISPER_VERSION = "1.5.5";
const MODEL = process.env.WHISPER_MODEL ?? "base.en";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const whisperPath = path.join(root, "whisper.cpp");
const publicDir = path.join(root, "public");
const transcriptPath = path.join(root, "src", "transcript.json");

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/transcribe.mjs <path-to-voiceover>");
  process.exit(1);
}

const remotion = (args, options = {}) =>
  execFileSync("npx", ["remotion", ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });

let durationSec = NaN;
try {
  durationSec = Number(
    remotion(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path.resolve(source),
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    ).trim(),
  );
} catch {
  // Reported below.
}
if (!Number.isFinite(durationSec)) {
  console.error(`Could not read ${source}. Use an MP3, WAV or M4A file.`);
  process.exit(1);
}
if (durationSec > MAX_SECONDS) {
  console.error(
    `The voiceover is ${durationSec.toFixed(2)}s, longer than the ${MAX_SECONDS}s video. ` +
      "Trim it or change the video length before continuing.",
  );
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
for (const file of readdirSync(publicDir)) {
  if (file.startsWith("voiceover.")) rmSync(path.join(publicDir, file));
}
const audioFile = `voiceover${path.extname(source).toLowerCase()}`;
copyFileSync(source, path.join(publicDir, audioFile));

// whisper.cpp wants 16 kHz mono 16-bit WAV.
const wavPath = path.join(whisperPath, "voiceover-16k.wav");
await installWhisperCpp({ to: whisperPath, version: WHISPER_VERSION });
await downloadWhisperModel({ model: MODEL, folder: whisperPath });
remotion(
  [
    "ffmpeg",
    "-y",
    "-i",
    path.join(publicDir, audioFile),
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ],
  { stdio: "ignore" },
);

const whisperCppOutput = await transcribe({
  model: MODEL,
  whisperPath,
  whisperCppVersion: WHISPER_VERSION,
  inputPath: wavPath,
  tokenLevelTimestamps: true,
  splitOnWord: true,
});
// Whisper has never seen the product name: it hears "Line wise" as two words, or
// spells it its own way. Join and respell it so the captions show it as one word.
const heard = toCaptions({ whisperCppOutput }).captions;
const captions = [];
for (const caption of heard) {
  const last = captions[captions.length - 1];
  if (
    last &&
    /^\s*line$/i.test(last.text) &&
    /^[\s-]*wise\b/i.test(caption.text)
  ) {
    captions[captions.length - 1] = {
      ...last,
      text: " Linewise" + caption.text.replace(/^[\s-]*wise/i, ""),
      endMs: caption.endMs,
    };
  } else {
    captions.push({
      ...caption,
      text: caption.text.replace(/\bline[- ]?wise\b/gi, "Linewise"),
    });
  }
}
rmSync(wavPath);

writeFileSync(
  transcriptPath,
  JSON.stringify({ audioFile, durationSec, captions }, null, 2) + "\n",
);

console.log(`Voiceover: public/${audioFile} (${durationSec.toFixed(2)}s)`);
if (durationSec < MAX_SECONDS) {
  console.log(
    `Shorter than ${MAX_SECONDS}s: the CTA scene holds for the remaining time.`,
  );
}
console.log(`Wrote ${captions.length} words to src/transcript.json:\n`);
for (const c of captions) {
  console.log(`${(c.startMs / 1000).toFixed(2).padStart(6)}s ${c.text.trim()}`);
}
