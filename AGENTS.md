# AGENTS.md — QA Sentinel

Local-AI call-center QA (AppBuildersPH Hackathon 2026, Local AI track): batch-upload
call recordings, transcribe + score + flag every call on-device, export redacted reports.
One-liner: "A robot QA checker for call center calls that never sends customer data anywhere."
Submission due 10:00 AM Oct 10 — working product over slides.

## Layout

- `frontend/` — Vite 8 + React 19 + TS + Tailwind v4 SPA. The only runnable code.
- `frontend/src/` — `App.tsx` (5 screens), `mock.ts` (3 demo calls: clean, critical #147
  62/100 RED, borderline), `lib/` (`scorecard.ts`, `pii.ts` regex+Luhn only, `db.ts` Dexie schema).
- `frontend/src/ai/` — working local pipeline: `whisper.ts` + `speech.worker.ts`
  (Whisper base, Web Worker), `ollama.ts` (qwen2.5:3b scoring), `backend.ts`
  (provider abstraction: Ollama live, WebLLM stubbed), `coaching.ts` (notes),
  `pipeline.ts` (dispatcher, two-tier quote guard, deterministic critical override).
  Behind the in-app Local AI toggle (`localStorage qa-ai-enabled`); OFF = mock data.
- `frontend/src/lib/` — `scorecard.ts`, `pii.ts` (regex+Luhn+`findCardHits`),
  `db.ts` (Dexie v2: calls, transcripts, results, overrides, scorecards),
  `store.ts` (persistence service), `export.ts` (redacted CSV + PDF),
  `agents.ts` (per-agent stats).
- `frontend/scripts/` — `phase0-*.mjs` (model checks), `phase1-e2e.mjs` (full
  upload→transcribe→score browser test). `phase0.html` = WebLLM harness (blocked HW).
- `docs/LOCAL_AI_PLAN.md` — phased local AI/backend plan. Planning doc, not implementation.
- Local backend only: Ollama on localhost (qwen2.5:3b) + IndexedDB in the browser.
  No hosted servers, no cloud APIs — audio never leaves the machine.
  `recharts` wired (dashboard); `wavesurfer.js` installed but unwired.

## Commands (PowerShell on win32)

```powershell
cd frontend; npm install; npm run dev      # UI shell (mock data until AI toggle)
npm run build                              # tsc -b + vite build (must pass)
npm run lint                               # oxlint
node scripts/phase1-e2e.mjs                # whole-piece E2E (needs dev + ollama up)
```

Ollama (required when the AI toggle is on): `ollama serve` must run with
`OLLAMA_ORIGINS` including `http://localhost:5173` (set via `setx`, then restart
the server). Models: `qwen2.5:3b` for scoring. Whisper base downloads from HF hub
on first transcription (~150 MB, then cached).

## Rules from the spec doc

- Scorecard `BANK_SUPPORT_V2` (7 checks, weights sum to 100): green ≥85, amber 70–84,
  red <70; any critical fail forces red; N/A checks excluded and score scaled to 100.
- Evidence rule: every verdict needs a transcript quote; reject it if the quote is not
  in the transcript. Claim only measured accuracy numbers, never invented ones.
- PII: deterministic regex + Luhn now; LLM name/address pass is AI phase. Exports must
  stay redacted (`[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`).
- Hard constraints: no cloud AI APIs, audio never leaves the machine, offline after first
  load. MVP (upload → transcript → scorecard → call detail → PII/export) freezes before
  any stretch work (dashboard, search, PDF, Ollama switch).

## AI/backend plan — Phase 1–5 DONE (adapted), rest gated

Shipped as working pieces: Whisper worker → PII engine → Ollama 3B scoring →
quote guard → deterministic critical override, behind the in-app toggle; provider
abstraction (`backend.ts`); Dexie v2 persistence (calls, results, overrides,
scorecards, coaching); redacted CSV + PDF export; coaching notes; agent dashboard.
E2E proven (`phase1-e2e.mjs`): real 67 s clip transcribed and scored, card-readback
flagged CRIT. Phase 0 ledger: Whisper PASS; WebLLM BLOCKED on Intel iGPU; Ollama 1.5B
fast but wrong on criticals; Ollama 3B correct (~26 s cold). Still TODO (gated):
stereo speaker split beyond channel mapping, model-weight cache pinning + Wi-Fi-off
test, wavesurfer waveform, WebLLM revisit on stronger hardware.

## Env notes

- Parent `Desktop/` is clutter (50+ sibling folders, empty root git) — ignore it, never
  run git/commands at Desktop level. `QA Sentinel/` is its own git repo; run git here.
- `shell` is PowerShell: no Unix-isms (`head` fails), chain with `;`, quote spaced paths.
  Prefer `read`/`glob`/`grep` over `cat`/`sed`/`find`/`ls`.
