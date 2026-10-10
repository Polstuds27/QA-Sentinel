# Linewise — the local AI pipeline, stage by stage

What each stage of the on-device pipeline does and where it lives. Every stage is built
and in use. Hard rule throughout: no cloud AI APIs, and audio never leaves the machine.

For setup, contracts and tests see `BACKEND_CAPSULE.md`. For measured timings and the
machines they came from see the root `README.md`.

## 1. Speech-to-text

- Web Audio decodes an upload and resamples it to 16 kHz, keeping the two channels apart.
- Two engines, picked per call and recorded on it:
  - Whisper large-v3-turbo through whisper.cpp on `localhost:8178` (`npm run whisper`,
    macOS), used whenever it is running.
  - Whisper base (ONNX, Transformers.js) inside a Web Worker, so the interface never
    blocks. Used when the native service is not running.
- Both return a time for every word. The language is detected per call.
- Code: `src/ai/whisper.ts`, `src/ai/speech.worker.ts`, `src/ai/native-whisper.ts`,
  `src/ai/models.ts`.

## 2. Speakers

- Stereo recordings: the channels are mixed and transcribed once, and each phrase goes to
  the channel that is louder while it is said. Left is the agent, right is the customer.
- Mono recordings: pyannote segmentation 3.0 marks who speaks when, each word goes to the
  voice speaking at that moment, and the voice that talks like an agent is labelled Agent.
- A file with the same audio on both channels is treated as mono.
- Code: `assignChannels`, `assignVoices`, `wordsToLines` in `src/ai/whisper.ts`; the
  agent/customer decision in `src/ai/pipeline.ts`.

## 3. Redaction and the quote check

- Patterns in `src/lib/pii.ts` hide card numbers, emails, phone numbers, dates of birth,
  account IDs, other long numbers, spelled-out words and addresses, with no model involved.
- qwen2.5:3b finds names, addresses and security answers (`src/ai/redaction.ts`). It only
  returns short strings; code accepts one only if it is literally in the transcript, and
  does the replacing itself.
- Quote check (`quoteExists` in `src/ai/pipeline.ts`): a verdict that claims something was
  said must come with a quote that is in the transcript. Otherwise the rule is asked once
  more, then left for manual review.
- A card-length number on an agent line is both hidden and a compliance failure, decided
  by code.

## 4. Scoring

- qwen2.5:3b through Ollama on `localhost:11434` (`src/ai/ollama.ts`).
- The model answers yes/no questions about only the lines that can answer them; code turns
  the answers into Pass, Fail or N/A, a reason and an evidence line.
- Model choice was measured, not guessed: the 3B size judged the critical rules correctly
  where the 1.5B size did not, so 3B is the one used.
- Coaching notes come from the same model (`src/ai/coaching.ts`).
- A call that is not in English is scored by an analyst in the app, not by the model.

## 5. Storage and offline

- With the server running, calls live in one SQLite file and recordings beside it
  (`server/`). Without it, the app stores everything in the browser with Dexie
  (`src/lib/db.ts`, `src/lib/store.local.ts`). `src/lib/store.ts` picks.
- `npm run models` puts the speech models and the ONNX runtime in `client/public/`, and
  remote model loading is switched off, so after setup the app makes no request to any
  other machine.
- The redacted PDF report is built in the browser (`src/lib/export.ts`).

## 6. Checks

- `npm run eval`: scripted transcripts with expected verdicts. Run it before and after any
  prompt change, and add new cases instead of fitting to old ones.
- `npm run eval:redaction`: scripted calls with details that must be hidden and details
  that must stay.
- `npm run benchmark`: times the sample recordings end to end on the current machine.
