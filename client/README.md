# Linewise — the app and its local backend

Developer notes for the app. What Linewise is, how to run it and the hackathon
disclosures are in the README at the repo root.

Local AI call-center QA. The UI and the local pipeline are both
wired: Whisper transcription, Ollama 3B scoring, PII redaction, persistence, export.

## Stack

React 19 + Vite 8 + TypeScript + Tailwind v4, with shadcn/ui components on Base UI
(`src/components/ui/`) and the self-hosted Schibsted Grotesk font. The look is the
Gallery White system described in `DESIGN.md`. Local backend: Whisper base
(`@huggingface/transformers`, Web Worker) + Ollama qwen2.5:3b on localhost +
Dexie (IndexedDB v2). UI libs: `recharts` (dashboard), `jspdf` (PDF export).
`wavesurfer.js` is installed but unused.

## Run

Needs Node 20 or newer. The commands are the same in PowerShell, bash and zsh.

```sh
cd client
npm install
npm run models  # once per machine: downloads the speech models (about 300 MB, needs internet)
npm run dev     # the header shows "Local AI ready" once ollama serve (below) is running
npm run build   # tsc + vite build
npm run lint    # oxlint
npm run whisper # optional, macOS: native Whisper large-v3-turbo (faster and more accurate)
npm run server  # the server: stores everything in SQLite (../server/data/linewise.db) and takes recordings from iPhones
node scripts/phase1-e2e.mjs  # full upload→transcribe→score browser test
npm run eval    # checks the scoring prompt against 18 scripted calls (needs ollama)
```

Ollama prerequisite: `ollama serve` with `OLLAMA_ORIGINS` including
`http://localhost:5173`, model `qwen2.5:3b` pulled. On Windows, `../setup-local.ps1`
sets this up.

Speech to text runs one of two ways. If `npm run whisper` is running (needs
`brew install whisper-cpp`; downloads a 1.6 GB model to `~/.linewise/` the first time), calls
are transcribed by Whisper large-v3-turbo on this machine's GPU. If it is not, they are
transcribed by Whisper base inside the browser. The call screen says which one was used.

The app ships with no sample data and starts empty. Three scripted test recordings to
upload are in `samples/`.

After `npm install`, `npm run models` and `ollama pull qwen2.5:3b`, the app needs no
internet at all: the speech models and their runtime are served from `public/`, and
scoring talks only to Ollama on this machine.

## What's implemented

- `samples/` — three scripted test recordings (macOS text-to-speech, made by
  `scripts/make_sample_calls.py`) to upload and score. Not part of the app.
- Screens: Upload & queue (transcribe & score whenever Ollama is running) · Calls list (flagged
  filter) · Call detail (waveform player, redacted transcript, scorecard, click timestamp
  to seek, analyst confirm/dismiss, coaching note, PDF export) · Scorecard editor
  (weights and critical toggles, saved to IndexedDB) · Agent dashboard (average score and
  most-missed checks) · Export (redacted PDF)
- `src/ai/` — the local pipeline: Whisper worker, Ollama scoring, quote guard, coaching notes.
- `src/lib/scorecard.ts` — Bank Support v2 preset, `scoreCall` (green ≥85, amber 70–84,
  red <70, any critical fail forces red; N/A checks excluded and scaled)
- `src/lib/pii.ts` + `src/ai/redaction.ts` — redaction. Patterns hide card numbers, emails,
  phones, dates of birth, account IDs and other long numbers; the local model finds names,
  addresses and security answers. The agent's name and the company name stay visible.
- `src/lib/db.ts`, `store.ts` — Dexie schema and persistence (calls, transcripts, results,
  overrides, scorecards, and each uploaded recording, all in this browser only).

Do not add cloud AI APIs — the spec forbids audio upload.

## Submission disclosures

What runs locally, what needs internet, the models, tools, assets and AI development
tools are listed once, in the README at the repo root. Keep that one true to the code.
