# AGENTS.md — QA Sentinel

Local-AI call-center QA (AppBuildersPH Hackathon 2026, Local AI track): batch-upload
call recordings, transcribe + score + flag every call on-device, export redacted reports.
One-liner: "A robot QA checker for call center calls that never sends customer data anywhere."
Submission due 10:00 AM Oct 10 — working product over slides.

## Where things live

- `frontend/` — Vite 8 + React 19 + TS + Tailwind v4 SPA. This is the only code so far.
- `frontend/src/mock.ts` — 3 demo calls (clean, critical #147 62/100 RED, borderline).
- `frontend/src/lib/` — `scorecard.ts` (Bank Support v2 preset + scorer), `pii.ts`
  (regex + Luhn redaction only), `db.ts` (Dexie `qa-sentinel` schema, persistence TODO).
- No backend, no AI workers yet. `dexie`/`wavesurfer.js`/`recharts`/`jspdf` are installed
  but unwired. Do NOT add `transformers.js` / WebLLM / Ollama until the AI phase is planned.

## Commands (PowerShell on win32)

```powershell
cd frontend; npm install; npm run dev      # UI shell with mock data
npm run build                              # tsc -b + vite build (must pass)
npm run lint                               # oxlint
```

## Conventions from the spec doc

- Scorecard `BANK_SUPPORT_V2` (7 checks, weights sum to 100): green ≥85, amber 70–84,
  red <70; any critical fail forces red; N/A checks excluded and score scaled to 100.
- Evidence rule (for the later AI phase): every LLM verdict needs a transcript quote;
  reject the verdict if the quote is not found. Never invent accuracy numbers — only
  measured ones.
- PII: deterministic regex + Luhn now; LLM name/address pass is AI-phase TODO. Exports
  must be redacted (`[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`).
- Hard constraints: no cloud AI APIs, audio never uploaded, app must work offline after
  first load. MVP (upload → transcript → scorecard → call detail → PII/export) freezes
  before any stretch work (dashboard, search, PDF, Ollama switch).
- Parent `Desktop/` is clutter (50+ sibling folders, empty root git) — ignore it, never
  run git/commands at Desktop level. `QA Sentinel/` is its own git repo; run git here.
