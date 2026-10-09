# AGENTS.md — Linya

Linya (Filipino for "line") was called QA Sentinel until Oct 9, 2026. The concept PDF, the
repo folder and the hackathon form draft still use the old name; use Linya everywhere new.

Local-AI call-center QA (AppBuildersPH Hackathon 2026, Local AI track): batch-upload
call recordings, transcribe + score + flag every call on-device, export redacted reports.
One-liner: "A robot QA checker for call center calls that never sends customer data anywhere."
Submission due 10:00 AM Oct 10 — working product over slides.

## Where things live

- `frontend/` — Vite 8 + React 19 + TS + Tailwind v4 SPA. This is the only code so far.
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
- `frontend/src/components/audio-player.tsx` — custom player for call detail: hairline
  track, cobalt playhead, a tick at each flagged timestamp. Plain `<audio>` underneath;
  `wavesurfer.js` is still unwired.
- `frontend/src/mock.ts` — 3 demo calls (clean, critical #147 62/100 RED, borderline).
- `frontend/src/lib/` — `scorecard.ts` (Bank Support v2 preset + scorer), `pii.ts`
  (regex + Luhn redaction only), `db.ts` (Dexie `linya` schema, persistence TODO).
- No backend, no AI workers yet. `dexie`/`wavesurfer.js`/`recharts`/`jspdf` are installed
  but unwired. Do NOT add `transformers.js` / WebLLM / Ollama until the AI phase starts;
  when it does, follow the plan below.
- The repo root (this folder) is the git repo; run git here, npm inside `frontend/`.

## Commands (same in zsh, bash and PowerShell)

```sh
cd frontend; npm install; npm run dev      # UI shell with mock data
npm run build                              # tsc -b + vite build (must pass)
npm run lint                               # oxlint
```

## Conventions from the spec doc

Source: `QA-Sentinel-Concept.pdf` (concept, build plan and pitch, prepared Oct 9, 2026).
Its navy/teal mockups are superseded by `frontend/DESIGN.md`; everything else stands.

- Scorecard `BANK_SUPPORT_V2` (7 checks, weights sum to 100): green ≥85, amber 70–84,
  red <70; any critical fail forces red; N/A checks excluded and score scaled to 100.
- Evidence rule (for the later AI phase): every LLM verdict needs a transcript quote;
  reject the verdict if the quote is not found. Never invent accuracy numbers — only
  measured ones.
- PII: deterministic regex + Luhn now; LLM name/address pass is AI-phase TODO. Exports
  must be redacted (`[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`).
- Hard constraints: no cloud AI APIs, audio never uploaded, app must work offline after
  first load (the demo runs in airplane mode). MVP (batch upload + queue → local
  transcript with timestamps → LLM scoring with quote check → call detail with
  click-to-jump audio → PII redaction → flagged list + CSV export) freezes before any
  stretch work (agent dashboard + coaching notes, transcript search, scorecard builder UI,
  PDF export, analyst confirm/dismiss, Ollama switch).
- The UI shell already has a scorecard editor and Confirm flag / Dismiss buttons. Both are
  stretch items in the spec: leave them as they are, do not spend MVP time wiring them.

## AI phase plan from the spec (not started)

- Speech: Whisper base or small (ONNX) via Transformers.js on WebGPU in a Web Worker,
  WASM fallback. Audio is decoded with the Web Audio API and resampled to 16 kHz mono.
- Speakers: stereo recordings are transcribed per channel; mono falls back to the LLM
  labelling each turn Agent or Customer.
- LLM: WebLLM with Qwen2.5-3B-Instruct or Llama-3.2-3B-Instruct (q4), JSON-mode output;
  Qwen2.5-1.5B as the lighter fallback. Solo build: whisper-base + the 1.5B model.
- Per-check LLM output matches `CheckResult` in `src/lib/scorecard.ts`: `check_id`,
  `verdict` (pass | fail | not_applicable), `severity`, `speaker`, `timestamp`, `evidence`,
  `reason`. A verdict whose evidence quote is missing from the transcript is rejected, then
  re-run or marked for manual review.
- A card number spoken by the agent is both a redaction span and a compliance flag.
- Storage: calls, transcripts and results in IndexedDB (Dexie); model weights in Cache
  Storage, downloaded once.
- Needs Chrome or Edge with WebGPU and roughly 4 GB of GPU memory for the 3B model. Test
  on the demo laptop first.

## Submission (10:00 AM Oct 10, one submission, no extensions)

- Public GitHub repo by the deadline; judges review it as of then.
- README with setup steps for judges and the disclosures. Today that is
  `frontend/README.md`; there is no README at the repo root, where judges land first.
- About 1 minute of demo video, and an X / LinkedIn post tagging Devin / Cognition with
  #AppBuildersPH.
- List only models and tools actually used. Fake benchmarks can get a result disputed.
