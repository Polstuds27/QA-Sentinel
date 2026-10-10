# Linewise — the local backend

How the AI side of Linewise is set up, run, tested and extended. There are no hosted
servers and no cloud APIs: the "backend" is programs on the analyst's own laptop.

## 1. What it is

```
Upload (mp3 / wav / m4a), or a recording sent from a phone
  → decode + resample to 16 kHz            (Web Audio API, in the tab)
  → transcribe, word by word                (Whisper large-v3-turbo through whisper.cpp,
                                             or Whisper base in a Web Worker)
  → tell the speakers apart                 (stereo: by channel; mono: pyannote segmentation)
  → find details to hide                    (patterns, then qwen2.5:3b for names and addresses)
  → score each scorecard rule               (qwen2.5:3b through Ollama, yes/no questions)
  → quote check + card-number override      (code, no model)
  → store                                   (SQLite through the server, or IndexedDB)
  → review in the app, export a redacted PDF
```

| Stage | Tech | Runs where |
|---|---|---|
| Speech-to-text | Whisper large-v3-turbo (whisper.cpp), started by `npm run whisper` | `localhost:8178` |
| Speech-to-text, fallback | Whisper base ONNX (`@huggingface/transformers`), Web Worker | Browser tab |
| Speaker separation (mono) | pyannote segmentation 3.0 ONNX, Web Worker | Browser tab |
| Scoring, name redaction, coaching notes | qwen2.5:3b through Ollama | `localhost:11434` |
| Pattern redaction and card detection | `lib/pii.ts` | Browser tab |
| Storage | SQLite (`server/`, `node:sqlite`) or Dexie v3 over IndexedDB | `localhost:8787` or the browser |

Card numbers are decided twice on purpose: the model is asked about every other rule, but
whether an agent line holds a card-length number is a fact, so `lib/pii.ts` decides that
rule and overrules the model.

Measured timings and the machines they came from are in the root `README.md`
("Tested hardware" and "Benchmark").

## 2. Requirements

| Requirement | Needed |
|---|---|
| Node.js | 20 or newer; 22.13 or newer for the optional server |
| Ollama | Running, with `qwen2.5:3b` pulled (about 2 GB) |
| Browser | A current Chrome or Edge |
| Disk | About 340 MB for the speech models (`npm run models`); 1.6 GB more for native Whisper |
| GPU | None required. Native Whisper uses the Mac's GPU when available. |
| Internet | Setup only: npm packages and the model downloads |

## 3. Setup

macOS:

```sh
brew install ollama            # or download from ollama.com
ollama pull qwen2.5:3b
ollama serve                   # keep running while the app runs

cd client
npm install
npm run models                 # once: speech models into public/models and public/ort
npm run dev                    # app at http://localhost:5173

# optional
brew install whisper-cpp && npm run whisper     # native Whisper large-v3-turbo
npm --prefix ../server install && npm run server # SQLite storage and phone uploads
```

Windows: run `setup-local.ps1` from the repo root (right-click, Run with PowerShell). It
checks Node, installs Ollama, sets `OLLAMA_ORIGINS`, pulls the model, installs the app's
packages and downloads the speech models. Then `cd client; npm run dev`.

If the app says Ollama is not running while it is, the browser is being refused: start
Ollama with `OLLAMA_ORIGINS=http://localhost:5173`.

Wait for the app header to say **Local AI ready**, upload audio, press
**Transcribe & score**.

## 4. Key files

| File | Owns |
|---|---|
| `src/ai/pipeline.ts` | The whole flow: decode, transcribe, speakers, redact, score, quote check, card override. Start here. |
| `src/ai/whisper.ts` + `src/ai/speech.worker.ts` | Audio decoding, the speech worker, assigning words to speakers, building lines. |
| `src/ai/native-whisper.ts` | Client for the whisper.cpp service. |
| `src/ai/models.ts` | Which speech models are downloaded and loaded. |
| `src/ai/ollama.ts` | The scoring prompt, the built-in plans, custom plans. Prompt work lives here. |
| `src/ai/backend.ts` | The scoring backend interface (`getBackend()`). Ollama is the only one. |
| `src/ai/redaction.ts` | The model pass of redaction and its guardrails. |
| `src/ai/coaching.ts` | The coaching-note prompt. |
| `src/lib/pii.ts` | `redactPII()`, `findHidden()`, `findCardHits()`. |
| `src/lib/scorecard.ts` | `BANK_SUPPORT_V2`, `scoreCall()`, `gradeCall()`. |
| `src/lib/store.ts`, `store.local.ts`, `db.ts` | Storage: the server if it is running, otherwise the browser. |
| `src/lib/export.ts` | The redacted PDF report. |
| `src/lib/agents.ts` | Per-agent numbers for the dashboard. |
| `../server/index.mjs`, `db.mjs` | The optional server: SQLite, recordings, the phone upload queue. |

## 5. Contracts your code must honor

- **Model output:** the model is not asked for a verdict. `ollama.ts` asks yes/no probes one at a time and gets `{why, answer, line}` back (schema-enforced; `line` is the number of a transcript line it was shown). Code maps the answers to `{check_id, verdict: pass|fail|not_applicable, timestamp, evidence, reason}`. Evidence is always a real transcript line. Measure prompt changes with `npm run eval`.
- **Quote check** (`quoteExists`): normalized substring, else at least 80% of the words in order. A rejected or unparseable verdict is asked for once more; if it fails again the rule is stored as `not_applicable` with the reason "Needs manual review" and the rest of the call still completes. Only a backend that is down stops the run.
- **Card detection:** any run of 13 or more digits (spaces, commas, dots or dashes between) counts, whether or not the Luhn checksum passes, because speech-to-text mishears digits. `findCardHits` reports `valid` for the checksum.
- **Scorecard math:** weights sum to 100; N/A rules are excluded and the score rescaled; any failed critical rule makes the call Failed; a call that is not in English is scored by an analyst, not the model.
- **Redaction:** the screen and the PDF show `[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`, `[NAME]`, `[ADDRESS]`, never the raw detail.
- **No network at run time.** Speech models and the ONNX runtime are served from `client/public/`; remote model loading is switched off. The only addresses the app calls are `localhost:11434` (Ollama), `localhost:8178` (native Whisper, optional) and its own origin.

## 6. How to extend

- **New scorecard rule:** add it in the Scorecards tab, or to `BANK_SUPPORT_V2`. The pipeline scores whatever rules the scorecard holds. A rule without a built-in plan is judged with one general question.
- **New scoring model:** `ollama pull <tag>`, change `SCORING_MODEL` in `src/ai/ollama.ts`, then run `npm run eval` and `npm run eval:redaction` before trusting it.
- **New scoring provider:** implement `BackendProvider` in `src/ai/backend.ts` and return it from `getBackend()`. Keep the JSON contract identical.

## 7. How to test

```sh
npm run build && npm run lint   # must pass
npm run eval                    # scoring against scripted transcripts (needs Ollama)
npm run eval:redaction          # redaction against scripted calls (needs Ollama)
npm run benchmark               # times the three sample calls end to end on this machine
node scripts/phase1-e2e.mjs     # drives the app in Chrome (Windows paths are hard-coded)
```

By hand: wait for "Local AI ready", upload `samples/call-147.m4a`, press Transcribe & score.
Expect 62 / 100, Failed, with "Never reads back a full card number" marked Critical at
about 00:14. Reload the page: the call is still there and still plays.

The first call after starting is slower, because Whisper and the scoring model are loaded
on first use.
