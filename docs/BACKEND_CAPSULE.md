# QA Sentinel — Backend Capsule (handoff brief)

Everything the backend is, how to run it, and where to extend it. No hosted servers,
no cloud APIs — the "backend" is 100% on-device by design (hackathon Local AI track).

## 0. New machine: requirements + one-shot setup

Run `setup-local.ps1` (repo root, right-click > Run with PowerShell) — it checks Node,
installs Ollama, sets `OLLAMA_ORIGINS`, pulls the model, and runs `npm install`.
What it needs underneath:

| Requirement | Minimum | Measured on this laptop |
|---|---|---|
| OS | Windows 10/11 | Win 10 Pro |
| Node.js | v20+ | v24 |
| Browser | Chrome / Edge 113+ (WebGPU API for future WebLLM) | Chrome 151, Edge 154 |
| RAM | 8 GB (16 GB for 3B comfort) | 16 GB |
| Disk | ~3 GB free (1 GB model + 150 MB Whisper + ~700 MB node_modules) | 68 GB free |
| GPU | None required (CPU path) | Intel iGPU + MX150 2 GB |
| Internet | Once (Ollama pull, npm, first Whisper download) — then fully offline-capable | — |

## 1. What the backend is

Three stages, all on the analyst's laptop. Audio never leaves the machine.

```
Upload (mp3/wav/m4a)
  → decode + resample to 16 kHz  (Web Audio API, main thread)
  → transcribe                    (Whisper base, Web Worker, WASM)
  → PII scan                      (regex + Luhn, deterministic)
  → score each scorecard check    (qwen2.5:3b via Ollama on localhost:11434)
  → quote-guard + critical override
  → persist                       (IndexedDB via Dexie v2)
  → review in UI, export redacted CSV/PDF
```

| Stage | Tech | Runs where | Measured on i5-8250U / 16 GB |
|---|---|---|---|
| Transcription | Whisper base ONNX (`@huggingface/transformers`), Web Worker | Browser tab | ~40 s for a 67 s clip |
| Scoring | qwen2.5:3b (`Ollama`), one call per check | `localhost:11434` (CPU) | ~20–30 s/check warm, 52 s cold |
| PII | Regex + Luhn (`lib/pii.ts`) | Browser tab | Instant |
| Storage | Dexie v2: calls, transcripts, results, overrides, scorecards | Browser IndexedDB | Instant |

Deliberate architecture call (measured, not guessed): the 1.5B model quotes perfectly
but misjudges critical checks, so **critical checks are double-decided** — the
deterministic PII engine overrules the LLM whenever an agent-spoken line carries
card digits (spec §06). The 3B judges everything else. WebLLM in-browser is registered
as a stub provider but BLOCKED on this laptop (Intel iGPU hangs at init, any size).

## 2. Setup (exact steps, PowerShell)

```powershell
winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
setx OLLAMA_ORIGINS "http://localhost:5173"   # lets the browser call localhost
# restart the Ollama server so it picks up OLLAMA_ORIGINS, then:
ollama pull qwen2.5:3b
ollama serve   # keep running while the app runs
```

```powershell
cd frontend; npm install; npm run dev   # app at http://localhost:5173
```

Flip **Local AI** on in the app header (it health-checks Ollama first), upload audio,
hit **Transcribe & score**.

## 3. Key files

| File | Owns |
|---|---|
| `src/ai/pipeline.ts` | Dispatcher: decode → transcribe → PII → score → guard → override. Start here. |
| `src/ai/backend.ts` | Provider abstraction (`getBackend()`). Add new runners here. |
| `src/ai/ollama.ts` | Ollama client + scoring prompt. Prompt engineering lives here. |
| `src/ai/whisper.ts` + `src/ai/speech.worker.ts` | Audio decode/resample + Whisper worker lifecycle. |
| `src/ai/coaching.ts` | Coaching-note prompt (same model, plain text). |
| `src/lib/pii.ts` | `redactPII()` + `findCardHits()` (digits + Luhn). |
| `src/lib/scorecard.ts` | `BANK_SUPPORT_V2`, `scoreCall()` (green ≥85, amber 70–84, red <70, critical fail forces red). |
| `src/lib/db.ts` + `src/lib/store.ts` | Dexie v2 schema + persistence service (calls, results, overrides, scorecards, coaching). |
| `src/lib/export.ts` | Redacted CSV + PDF. |
| `src/lib/agents.ts` | Per-agent aggregates for the dashboard. |
| `scripts/phase0-whisper.mjs` | Standalone Whisper check (Node, CPU). |
| `scripts/phase0-ollama.mjs [model]` | Standalone verdict check + quote-guard demo. |
| `scripts/phase1-e2e.mjs` | Full browser E2E (toggle → upload → transcribe → score → assert). Set `PHASE1_OFFLINE=1` for the Wi-Fi-off variant. |
| `phase0.html` | WebLLM browser harness (currently fails on this iGPU — expected). |

## 4. Contracts your code must honor

- **LLM verdict JSON:** `{check_id, verdict: pass|fail|not_applicable, timestamp: mm:ss|"", evidence, reason}`. `check_id` copied exactly; `evidence` word-for-word from the transcript.
- **Quote guard** (`quoteExists`): normalized substring, else ≥80% ordered-word fuzzy (Whisper writes "bank code" for "BankCo"). Reject = throw, analyst sees the error.
- **Scorecard math:** weights sum to 100; N/A checks excluded and rescaled; any critical fail forces red.
- **Redaction:** exports show `[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]` — never raw PII.
- **No network except:** HuggingFace hub (first Whisper download, then cached) + `localhost:11434`. No other fetch calls, ever.

## 5. How to extend (common tasks)

- **New scorecard check:** add to `BANK_SUPPORT_V2` (or the persisted editor) — pipeline scores `checks.length` dynamically, no other change.
- **New model:** `ollama pull <tag>`, change `SCORING_MODEL` in `src/ai/ollama.ts`, re-run `phase0-ollama.mjs` to confirm verdict quality before trusting it.
- **New provider (e.g. WebLLM on stronger hardware):** implement `BackendProvider` in `src/ai/backend.ts`; flip via `qa-backend` in localStorage. Keep the JSON contract identical.
- **Mono speaker split:** `chunksToLines(..., "unknown")` in `pipeline.ts` — replace with LLM turn-labelling when ready.

## 6. How to test

```powershell
npm run build; npm run lint                       # must pass
node scripts/phase0-whisper.mjs                   # transcription offline, CPU
node scripts/phase0-ollama.mjs qwen2.5:3b        # one verdict + guard
node scripts/phase1-e2e.mjs                       # whole piece in headless Chrome
```

Manual: toggle on → upload `public/demo-audio/call-sample.wav` → Transcribe & score →
expect card-readback CRIT; reload page → call persists (DevTools → IndexedDB → `qa-sentinel`).

## 7. Known issues (measured, with workarounds)

- WebLLM hangs the Intel iGPU at init (any size incl. 0.5B); SwiftShader exposes no adapter; Chrome/Win ignores `powerPreference`. Use Ollama. Revisit on stronger hardware.
- qwen2.5:1.5b is fast (~6 s) but votes `pass` on card-readback even with digit-count rules — never use it for criticals.
- First Whisper run downloads ~150 MB; first 3B verdict ~52 s cold. Pre-process demo calls before Demo Day; score at most one short call live.
- `phase0-webllm.mjs` (Node flavor) cannot run — Node here has no WebGPU. Use `phase0.html` in a real browser instead.
