# AGENTS.md — Linya

Linya (Filipino for "line") was called QA Sentinel until Oct 9, 2026. The concept PDF, the
repo folder, the GitHub repo and some internal keys (`qa-sentinel` IndexedDB name,
`qa-ai-enabled` localStorage key) still use the old name; use Linya everywhere new.

Local-AI call-center QA (AppBuildersPH Hackathon 2026, Local AI track): batch-upload
call recordings, transcribe + score + flag every call on-device, export redacted reports.
One-liner: "A robot QA checker for call center calls that never sends customer data anywhere."
Submission due 10:00 AM Oct 10 — working product over slides.

## Layout

- `frontend/` — Vite 8 + React 19 + TS + Tailwind v4 SPA. The app.
- `frontend/src/App.tsx` — all 5 screens. `mock.ts` — 3 demo calls (clean, critical #147
  62/100 RED, borderline); transcripts and verdicts are hand-written, line times match
  the sample recordings.
- `frontend/src/ai/` — working local pipeline: `whisper.ts` + `speech.worker.ts`
  (Whisper base, Web Worker), `ollama.ts` (qwen2.5:3b scoring), `backend.ts`
  (provider abstraction: Ollama live, WebLLM stubbed), `coaching.ts` (notes),
  `pipeline.ts` (dispatcher, two-tier quote guard, deterministic critical override).
  Behind the in-app Local AI toggle (`localStorage qa-ai-enabled`); OFF = mock data.
- `frontend/src/lib/` — `scorecard.ts`, `pii.ts` (regex+Luhn+`findCardHits`),
  `db.ts` (Dexie v2: calls, transcripts, results, overrides, scorecards),
  `store.ts` (persistence service), `export.ts` (redacted CSV + PDF),
  `agents.ts` (per-agent stats).
- `frontend/DESIGN.md` — the Gallery White design system (off-white wall, black type,
  cobalt as the only accent, square corners, no shadows). Read it before touching UI.
- `frontend/src/components/ui/` — shadcn/ui (Base UI, `base-nova`) components, restyled in
  place for Gallery White. Add more with `npx shadcn@latest add <name>`, then restyle to
  match. Imports use the `@/` alias (`@/components/ui/button`, `@/lib/utils`).
- `frontend/src/index.css` — all colour tokens (`:root` and `.dark`); dark mode follows the
  system setting via `main.tsx`.
- `frontend/src/components/logo.tsx` — the Linya logo (an L with a cobalt dot, plus the
  wordmark). PNG exports and the favicon are in `frontend/public/` (`logo.png`,
  `logo-dark.png`, `logo-mark.png`, `favicon.svg`).
- `frontend/src/components/audio-player.tsx` + `waveform.tsx` — custom player for call
  detail: hairline track, cobalt playhead, a tick at each flagged timestamp, and a canvas
  waveform decoded from the recording (agent channel above the line, customer below) that
  moves at the playhead during playback. Plain `<audio>` underneath; `wavesurfer.js` is
  still unwired and no longer needed for this.
- `frontend/public/samples/call-*.m4a` — one recording per demo call, built by
  `frontend/scripts/make_sample_calls.py` (macOS `say` voices; stereo, agent left,
  customer right). Synthetic voices on scripted calls: demo data, never a benchmark. If a
  script changes, re-run it and copy the printed times into `mock.ts`. The calls are 7 to
  31 seconds long, so the spec's "click 02:13" moment is at 00:14 on Call #147.
- `frontend/scripts/` — `phase0-*.mjs` (model checks), `phase1-e2e.mjs` (full
  upload→transcribe→score browser test; it finds elements by `data-testid` and by the
  header text "Local AI on (Whisper + Ollama 3B)", so keep those when restyling).
  `phase0.html` = WebLLM harness (blocked HW).
- `docs/LOCAL_AI_PLAN.md` — phased local AI/backend plan. `docs/BACKEND_CAPSULE.md` —
  backend notes.
- `linya-ads/` — Remotion project for the promo video. Separate package, not part of the app.
- Local backend only: Ollama on localhost (qwen2.5:3b) + IndexedDB in the browser.
  No hosted servers, no cloud APIs — audio never leaves the machine.
  `recharts` wired (dashboard); `wavesurfer.js` installed but unwired.
- The repo root (this folder) is the git repo; run git here, npm inside `frontend/`.

## Commands

The npm commands are the same in zsh, bash and PowerShell.

```sh
cd frontend; npm install; npm run dev      # UI shell (mock data until AI toggle)
npm run build                              # tsc -b + vite build (must pass)
npm run lint                               # oxlint
node scripts/phase1-e2e.mjs                # whole-piece E2E (needs dev + ollama up)
```

`phase1-e2e.mjs` has a Windows Chrome path and profile directory hard-coded; change them
to run it on another machine.

Ollama (required when the AI toggle is on): `ollama serve` must run with
`OLLAMA_ORIGINS` including `http://localhost:5173` (on Windows set via `setx`, then
restart the server). Models: `qwen2.5:3b` for scoring. Whisper base downloads from HF hub
on first transcription (~150 MB, then cached).

## Rules from the spec doc

Source: `QA-Sentinel-Concept.pdf` (concept, build plan and pitch, prepared Oct 9, 2026).
Its navy/teal mockups are superseded by `frontend/DESIGN.md`; everything else stands.

- Scorecard `BANK_SUPPORT_V2` (7 checks, weights sum to 100): green ≥85, amber 70–84,
  red <70; any critical fail forces red; N/A checks excluded and score scaled to 100.
- Evidence rule: every verdict needs a transcript quote; reject it if the quote is not
  in the transcript (then re-run or mark for manual review). Claim only measured accuracy
  numbers, never invented ones.
- Per-check LLM output matches `CheckResult` in `src/lib/scorecard.ts`: `check_id`,
  `verdict` (pass | fail | not_applicable), `severity`, `speaker`, `timestamp`, `evidence`,
  `reason`.
- PII: deterministic regex + Luhn now; LLM name/address pass is not built. Exports must
  stay redacted (`[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`). A card number spoken by the
  agent is both a redaction span and a compliance flag.
- Hard constraints: no cloud AI APIs, audio never leaves the machine, offline after first
  load (the demo runs in airplane mode).
- Spec scope, for reference. MVP: batch upload + queue → local transcript with timestamps
  → LLM scoring with quote check → call detail with click-to-jump audio → PII redaction →
  flagged list + CSV export. Stretch: agent dashboard + coaching notes, transcript search,
  scorecard builder UI, PDF export, analyst confirm/dismiss, Ollama switch. Most of the
  stretch list is already built (see below); transcript search is not.

## AI/backend plan — Phase 1–5 DONE (adapted), rest gated

Shipped as working pieces: Whisper worker → PII engine → Ollama 3B scoring →
quote guard → deterministic critical override, behind the in-app toggle; provider
abstraction (`backend.ts`); Dexie v2 persistence (calls, results, overrides,
scorecards, coaching); redacted CSV + PDF export; coaching notes; agent dashboard.
E2E proven (`phase1-e2e.mjs`): real 67 s clip transcribed and scored, card-readback
flagged CRIT. Phase 0 ledger: Whisper PASS; WebLLM BLOCKED on Intel iGPU; Ollama 1.5B
fast but wrong on criticals; Ollama 3B correct (~26 s cold). Still TODO (gated):
stereo speaker split beyond channel mapping, model-weight cache pinning + Wi-Fi-off
test, WebLLM revisit on stronger hardware. That E2E run was before the Gallery White
restyle was merged in; re-run it once on the merged UI.

The spec's original plan was WebLLM in the browser (Qwen2.5-3B-Instruct or
Llama-3.2-3B-Instruct, 1.5B fallback) with Ollama as the optional switch. Ollama is the
working backend because WebLLM is blocked on the test hardware.

## Submission (10:00 AM Oct 10, one submission, no extensions)

- Public GitHub repo by the deadline; judges review it as of then.
- README with setup steps for judges and the disclosures. Today that is
  `frontend/README.md`; there is no README at the repo root, where judges land first.
- About 1 minute of demo video, and an X / LinkedIn post tagging Devin / Cognition with
  #AppBuildersPH.
- List only models and tools actually used. Fake benchmarks can get a result disputed.

## Env notes

- Two machines work on this repo: one macOS (zsh), one Windows (PowerShell). On Windows:
  no Unix-isms (`head` fails), chain with `;`, quote spaced paths.
- Keep `.ps1` files ASCII-only: PS 5.1 misreads BOM-less UTF-8, and em-dash bytes
  decode as a quote character that breaks parsing (measured on `setup-local.ps1`).
