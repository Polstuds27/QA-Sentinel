# Linya — frontend (UI shell, no AI yet)

Local AI call-center QA. This step scaffolds only the frontend UI shell from the
hackathon spec. No speech-to-text, no LLM scoring, no backend — those are planned
separately for local implementation.

## Stack

React 19 + Vite 8 + TypeScript + Tailwind v4, with shadcn/ui components on Base UI
(`src/components/ui/`) and the self-hosted Schibsted Grotesk font. The look is the
Gallery White system described in `DESIGN.md`. UI deps: `dexie` (IndexedDB schema),
`wavesurfer.js` / `recharts` / `jspdf` installed but **not wired yet**.

## Run

Needs Node 20 or newer. The commands are the same in PowerShell, bash and zsh.

```sh
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
- `src/lib/db.ts` — Dexie `linya` schema (calls, transcripts). Persistence wiring TODO.

## Explicitly NOT started (AI/backend phase)

`transformers.js` (Whisper), `@mlc-ai/web-llm` (Qwen2.5-3B / Llama-3.2-3B), Web Workers,
Cache Storage model caching, Ollama `OLLAMA_ORIGINS` switch, PDF export, real waveform
seek. Do not add cloud AI APIs — spec forbids audio upload.

## Submission disclosures (fill in before 10:00 AM, Oct 10)

The hackathon form asks for these. Keep only what is true of the code at the deadline.

| Field | Status today |
|---|---|
| What runs locally | PII redaction (regex + Luhn), scoring maths, CSV export, all UI. Speech-to-text and LLM scoring are not built yet. |
| What requires internet | First load of the app only. No cloud AI APIs. |
| Models used | None yet. Planned: Whisper base/small (ONNX), Qwen2.5-3B-Instruct or Llama-3.2-3B-Instruct via WebLLM. |
| Technologies and frameworks | React, Vite, TypeScript, Tailwind, shadcn/ui, Base UI, Dexie. Add Transformers.js, WebLLM, wavesurfer.js, Recharts and jsPDF only once they are wired. |
| APIs and cloud services | None. |
| Existing code and assets | Open-source libraries above; the Vite React template; shadcn/ui component source. |
| AI development tools | Claude Code. Add any others used. |
| Accuracy numbers | None measured. The three demo calls are scripted mock data, not model output. |

