# QA Sentinel — frontend (UI shell, no AI yet)

Local AI call-center QA. This step scaffolds only the frontend UI shell from the
hackathon spec. No speech-to-text, no LLM scoring, no backend — those are planned
separately for local implementation.

## Stack

React 19 + Vite 8 + TypeScript + Tailwind v4. UI deps: `dexie` (IndexedDB schema),
`wavesurfer.js` / `recharts` / `jspdf` installed but **not wired yet**.

## Run

```powershell
cd frontend
npm install
npm run dev     # UI shell with mock data
npm run build   # tsc + vite build (verified)
npm run lint    # oxlint
```

## What's implemented (mock data)

- `src/mock.ts` — 3 demo calls: clean, critical Call #147 (62/100 RED), borderline
- Screens: Upload & queue (file picker + object-URL playback) · Calls list (flagged filter)
  · Call detail hero (redacted transcript, scorecard, click timestamp to seek, confirm/dismiss,
  redacted CSV export) · Scorecard editor (Bank Support v2 weights/critical toggles)
  · Agent dashboard = stretch placeholder · Export = redacted CSV
- `src/lib/scorecard.ts` — Bank Support v2 preset, `scoreCall` (green ≥85, amber 70–84,
  red <70, any critical fail forces red; N/A checks excluded and scaled)
- `src/lib/pii.ts` — deterministic redaction only (card regex + Luhn, email, PH mobile).
  LLM name/address pass is TODO in the AI phase.
- `src/lib/db.ts` — Dexie `qa-sentinel` schema (calls, transcripts). Persistence wiring TODO.

## Explicitly NOT started (AI/backend phase)

`transformers.js` (Whisper), `@mlc-ai/web-llm` (Qwen2.5-3B / Llama-3.2-3B), Web Workers,
Cache Storage model caching, Ollama `OLLAMA_ORIGINS` switch, PDF export, real waveform
seek. Do not add cloud AI APIs — spec forbids audio upload.
