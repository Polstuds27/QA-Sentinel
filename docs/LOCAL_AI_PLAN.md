# QA Sentinel — local AI/backend plan (NOT started)

Staged plan for implementing the on-device pipeline after the frontend UI shell.
Do not install model deps, download weights, or spawn workers until this plan is approved.
Spec refs: pipeline §06, stack §10, build order §12. Hard rule: no cloud AI APIs, ever.

## Phase 0 — de-risk on the demo laptop (first, before any app code)

- Confirm Chrome/Edge WebGPU works; note GPU RAM (≈4 GB for 3B, less for 1.5B).
- Whisper base ONNX transcribes a ~1-min sample clip locally; WebLLM returns one valid
  JSON verdict against `BANK_SUPPORT_V2`.
- Done when: both run on the exact demo laptop. If slow/failing: drop to whisper-base +
  Qwen2.5-1.5B, or switch LLM to Ollama on localhost.

### Measured on this laptop (Oct 9, 2026)

| Check | Result |
|---|---|
| GPUs | Intel UHD 620 (1 GB, Chrome default adapter) + NVIDIA MX150 (2 GB). Below 4 GB spec. |
| Browsers | Chrome 151, Edge 154 — WebGPU API present |
| RAM / disk | 16 GB RAM, 68 GB free — fine |
| A: Whisper base | PASS — 67.5 s local TTS clip (`public/demo-audio/call-sample.wav`) transcribed in 19.0 s CPU (~0.28× realtime), 5/6 keywords hit. `scripts/phase0-whisper.mjs` |
| B: WebLLM 1.5B | BLOCKED — model downloads + caches fine, but Intel iGPU hangs at init (`DXGI_ERROR_DEVICE_HUNG`, device removed). Chrome on Windows ignores `powerPreference`, so MX150 can't be forced from the page. 0.5B hangs identically; SwiftShader exposes no adapter. `phase0.html` + `scripts/phase0-webllm-browser.mjs` |
| C: Ollama qwen2.5:1.5b (CPU) | PARTIAL — server up, valid JSON, exact evidence quotes, quote-guard PASS, ~6 s/check steady-state (52 s cold). But verdict wrong on `no_card_readback` (says pass 3× despite digit-count rule + PII fact). Critical checks must be decided by the deterministic PII engine (per spec §06), LLM handles soft checks. `scripts/phase0-ollama.mjs` |
| D: Ollama qwen2.5:3b (CPU) | PASS — correct `fail` + exact quote + `02:13` + sensible reason, 26.4 s cold (steady-state faster). Locked architecture: 3B judges all checks, deterministic PII engine double-decides criticals (instant, reliable). Pre-process demo calls; live-score at most one short call on stage. |
| B fallbacks (untested) | Qwen2.5-0.5B (fits iGPU?) · SwiftShader CPU-WebGPU (slow but functional) · Ollama on CPU (16 GB RAM, same prompts via `OLLAMA_ORIGINS`) |

## Phase 1 — speech worker

- `Transformers.js` Whisper (base → small) ONNX, WebGPU with WASM fallback, inside a Web Worker.
- Web Audio API decodes + resamples uploads to 16 kHz mono; stereo calls transcribe per
  channel (agent/customer), mono falls back to LLM turn-labelling.
- Returns `TranscriptChunk[]` (`client/src/ai/types.ts`); UI stays on mock until worker
  passes its acceptance clip.

DONE (shipped as Phase 1+2 piece): `src/ai/whisper.ts` + `src/ai/speech.worker.ts` —
Whisper base in a Web Worker (WASM path, UI never blocks). Stereo transcribed per channel
(Agent = ch0, Customer = ch1); mono labelled Unknown. E2E: 67 s clip in ~40 s headless.

## Phase 2 — PII + quote-check guard (deterministic first)

- Keep `lib/pii.ts` regex + Luhn as the base layer (cards, PH mobiles, emails, account IDs).
- Add LLM pass for names/addresses only; every hit becomes a redaction span, and an
  agent-spoken card number becomes a critical flag.
- Quote-check guard: reject any verdict whose evidence quote is not found verbatim in the
  transcript; re-run or mark for manual review.

DONE (shipped as Phase 1+2 piece): `findCardHits()` in `lib/pii.ts`; two-tier guard in
`pipeline.ts` (normalized substring, then ≥80% ordered-word fuzzy — Whisper spells
"BankCo" as "bank code"); agent-spoken card digits force `no_card_readback` fail.
LLM name/address pass still TODO.

## Phase 3 — scoring worker

- WebLLM Qwen2.5-3B-Instruct or Llama-3.2-3B-Instruct (q4); 1.5B fallback. JSON-mode output
  matching `CheckResult` (`check_id`, `verdict`, `severity`, `speaker`, `timestamp`,
  `evidence`, `reason`); one call per scorecard check; analyst confirms/dismisses flags.
- Coaching notes generated from the same transcript, quoted.

DONE via Ollama instead of WebLLM (this laptop's iGPU hangs — see Phase 0 table):
`src/ai/ollama.ts` scores all 7 checks with qwen2.5:3b through `localhost:11434`
(`OLLAMA_ORIGINS` set for the browser). E2E verdicts: greeting PASS, empathy PASS,
card-readback CRIT, refund FAIL — analyst confirms/dismisses in the UI as designed.
Coaching notes still TODO.

## Phase 4 — offline + persistence

- Cache Storage pins app + model weights on first load; full flow tested with Wi-Fi off.
- Dexie `qa-sentinel` stores calls, transcripts, scorecards, results (`lib/db.ts` — wire it here).
- Redacted CSV first, jsPDF report second; wavesurfer.js waveform with click-to-seek.

DONE (v2 schema: calls, transcripts, results, overrides, scorecards): AI calls persist
and reload on startup (`lib/store.ts`); analyst confirm/dismiss writes overrides;
scorecard edits persist; redacted CSV + jsPDF PDF per call (`lib/export.ts`).
Offline-tested: `PHASE1_OFFLINE=1 phase1-e2e` transcribes fully offline (model cache
holds), scoring resumes on localhost. Full airplane-mode rehearsal still due on the
demo laptop. Still TODO: wavesurfer waveform.

## Phase 5 — Ollama switch (optional backend)

- Same prompts over `http://localhost:11434`; set `OLLAMA_ORIGINS` so the browser can call it.
- This is the only "backend": localhost LLM, no audio upload, no hosted services.

DONE as the primary backend (not optional on this hardware): `src/ai/backend.ts`
provider abstraction (Ollama live, WebLLM stubbed); `OLLAMA_ORIGINS` set for
`http://localhost:5173`; qwen2.5:3b pulled. Coaching notes via the same model
(`src/ai/coaching.ts`); per-agent stats (`src/lib/agents.ts`) feed the dashboard.

## Interfaces (already stubbed)

- `client/src/ai/types.ts` — `TranscriptChunk`, `PipelineJob`, reuses `CheckResult`.
- `client/src/ai/pipeline.ts` — `AI_ENABLED = false`; `runLocalPipeline()` throws until
  approved. Flip the flag only when Phase 0 passes on the demo laptop.
