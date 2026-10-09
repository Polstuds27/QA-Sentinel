# Linya — frontend + local backend (working piece)

Local AI call-center QA (formerly QA Sentinel). The UI and the local pipeline are both
wired: Whisper transcription, Ollama 3B scoring, PII redaction, persistence, export.
WebLLM in-browser remains blocked on the test laptop's iGPU (see `../docs/LOCAL_AI_PLAN.md`).

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
cd frontend
npm install
npm run dev     # toggle Local AI on in the header (needs ollama serve below)
npm run build   # tsc + vite build
npm run lint    # oxlint
node scripts/phase1-e2e.mjs  # full upload→transcribe→score browser test
```

Ollama prerequisite: `ollama serve` with `OLLAMA_ORIGINS` including
`http://localhost:5173`, model `qwen2.5:3b` pulled. On Windows, `../setup-local.ps1`
sets this up.

With Local AI off, the app shows three scripted demo calls.

## What's implemented

- `src/mock.ts` — 3 demo calls: clean, critical Call #147 (62/100 RED), borderline.
  Each has a recording in `public/samples/` made with macOS text-to-speech by
  `scripts/make_sample_calls.py`, so the audio bar, timestamps and flag ticks line up.
  The transcripts and scores of these three are scripted, not model output.
- Screens: Upload & queue (transcribe & score when Local AI is on) · Calls list (flagged
  filter) · Call detail (waveform player, redacted transcript, scorecard, click timestamp
  to seek, analyst confirm/dismiss, coaching note, CSV + PDF export) · Scorecard editor
  (weights and critical toggles, saved to IndexedDB) · Agent dashboard (average score and
  most-missed checks) · Export (redacted CSV + PDF)
- `src/ai/` — the local pipeline: Whisper worker, Ollama scoring, quote guard, coaching notes.
- `src/lib/scorecard.ts` — Bank Support v2 preset, `scoreCall` (green ≥85, amber 70–84,
  red <70, any critical fail forces red; N/A checks excluded and scaled)
- `src/lib/pii.ts` — deterministic redaction (card regex + Luhn, email, PH mobile).
  The LLM name/address pass is not built.
- `src/lib/db.ts`, `store.ts` — Dexie schema and persistence (calls, transcripts, results,
  overrides, scorecards).

Do not add cloud AI APIs — the spec forbids audio upload.

## Submission disclosures (check before 10:00 AM, Oct 10)

The hackathon form asks for these. Keep only what is true of the code at the deadline.

| Field | Status today |
|---|---|
| What runs locally | Speech-to-text (Whisper base in the browser), check scoring and coaching notes (Ollama on localhost), PII redaction (regex + Luhn), storage, CSV and PDF export, all UI. |
| What requires internet | First load of the app, the one-time Whisper download (~150 MB), and pulling the Ollama model. No cloud AI APIs. |
| Models used | Whisper base (ONNX, via Transformers.js); qwen2.5:3b via Ollama. WebLLM was tried and is blocked on the test hardware, so do not list it as used. |
| Technologies and frameworks | React, Vite, TypeScript, Tailwind, shadcn/ui, Base UI, Transformers.js, Ollama, Dexie, Recharts, jsPDF. |
| APIs and cloud services | None. |
| Existing code and assets | Open-source libraries above; the Vite React template; shadcn/ui component source. Sample call audio generated during the hackathon with text-to-speech. |
| AI development tools | Claude Code. Confirm with the team and add every other tool used (the backend test scripts suggest opencode). |
| Accuracy numbers | None measured as a rate. One end-to-end run on a 67-second clip flagged the card readback as critical; the three demo calls are scripted mock data, not model output. |
