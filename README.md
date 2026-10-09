# Linewise

Local-AI quality checks for call center calls. Formerly QA Sentinel.

AppBuildersPH Hackathon 2026, Local AI track. Team Busseng.

## Problem

In call centers, every call is supposed to be checked: did the agent verify the
customer's identity, follow the script, say the required disclosures, and actually solve
the problem? QA analysts do this by listening to recordings one by one and filling in a
scorecard. That is slow, so only a small sample of calls ever gets reviewed and coaching
comes days late.

## Brief description

Linewise automates that check. Upload a recording and it transcribes the call, redacts
customer PII, scores it against the QA rubric, and flags the exact moments that need
coaching, all on the analyst's own device.

For every call it:

1. writes the transcript, with each line tagged Agent or Customer and timed to the audio;
2. hides card numbers, emails, phone numbers, account IDs, names and addresses;
3. checks the call against a scorecard, one rule at a time, and gives each rule a Pass,
   Fail or N/A with the quoted line as evidence;
4. scores the call out of 100 and marks it Passed (85 to 100), Needs review (70 to 84) or
   Failed (below 70, or any critical rule broken);
5. lets the analyst click a flag to hear that exact moment, confirm or dismiss it, and
   export a redacted PDF report.

It also has a scorecard editor, a per-agent dashboard, coaching notes, and a way for
agents to send recordings from their phones over the office Wi-Fi.

It analyzes recordings only. It does not listen to live calls.

## Why does this product benefit from running AI locally?

Call QA is a daily job across the Philippine IT-BPM industry. Its industry association,
IBPAP, started 2026 with an outlook of about $42 billion in export revenue and close to
2 million jobs for the year
([SunStar](https://www.sunstar.com.ph/cebu/it-bpm-eyes-42b-exports-near-2-million-jobs-in-2026)).
Scoring protects the business: it catches compliance misses, keeps client contracts safe,
and tells team leads who needs coaching.

But call recordings are full of sensitive customer data such as names, addresses and
account numbers. Sending that audio to a third-party cloud AI creates privacy risk under
the Data Privacy Act and can break client data rules.

- **Privacy.** Linewise runs transcription, redaction and scoring on the device, so the
  audio never leaves the machine.
- **No per-minute cost.** There is no API bill, so a team can afford to score every call
  instead of a sample.
- **Works offline.** Once the models are downloaded, it keeps working when the internet
  drops. The app makes no request to any other machine.

### What runs locally

Everything: speech-to-text, speaker separation, redaction, scoring, coaching notes,
storage, the PDF export and the interface.

### What requires internet

Setup only: `npm install`, `npm run models` (speech models, about 340 MB),
`ollama pull qwen2.5:3b` (about 2 GB) and, on macOS, the first `npm run whisper`
(1.6 GB). Running the app needs none.

## Models

| Model | What it does | Where it runs |
|---|---|---|
| Whisper large-v3-turbo | Speech-to-text, used when `npm run whisper` is running (macOS) | whisper.cpp on `localhost:8178` |
| Whisper base (`Xenova/whisper-base`, ONNX) | Speech-to-text when the native one is not running | In the browser, in a Web Worker, through Transformers.js |
| pyannote segmentation 3.0 (`onnx-community/pyannote-segmentation-3.0`, ONNX) | Tells the two voices apart on mono recordings | In the browser |
| qwen2.5:3b | Answers yes/no questions about the transcript for scoring, finds names and addresses to hide, writes coaching notes | Ollama on `localhost:11434` |

The call screen says which speech model transcribed each call.

The scoring model never gives a verdict directly. Each rule is split into yes/no questions
asked over only the lines that can answer them; code turns the answers into the verdict
and the evidence line, and rejects a quote that is not in the transcript.

WebLLM (`@mlc-ai/web-llm`) was tried for in-browser scoring and did not run on our test
hardware. It is not used.

## Tools

**App (`client/`):** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI,
Transformers.js with ONNX Runtime Web, Dexie (IndexedDB), Recharts, jsPDF, qrcode,
Lucide icons.

**Local services:** Ollama, whisper.cpp.

**Server (`server/`, optional):** Node.js, Express, Multer, SQLite through Node's built-in
`node:sqlite`. It stores calls in one database file on the laptop and receives recordings
from phones on the same network.

**Testing:** puppeteer-core (browser end-to-end test), oxlint.

**Demo video (`linya-ads/`):** Remotion.

**APIs and cloud services:** none.

**AI development tools:** Claude Code.

## Assets

- **Logo and favicon:** made by the team for this project.
- **Font:** Schibsted Grotesk (SIL Open Font License), self-hosted.
- **Icons:** Lucide.
- **Interface components:** shadcn/ui source, restyled.
- **Test recordings:** the three calls in `client/samples/` are scripted and spoken by
  macOS text-to-speech voices, generated by `client/scripts/make_sample_calls.py`. The card
  number in them is the standard test number 4111 1111 1111 1111. They are test input,
  not a benchmark, and the app does not ship with them loaded.
- **Demo video:** the app footage is a screen recording of the real app. The music and
  sound effects are synthesized by `linya-ads/scripts/make-audio.mjs`.
- No stock media, datasets or third-party recordings.

## Existing code

The project was started for this hackathon; there was no earlier codebase. Starting
points were the Vite React TypeScript template, shadcn/ui component source and the
Remotion blank template, plus the open-source libraries listed above.

## Run it

Needs Node.js 20 or newer (22.13 or newer for the optional server) and
[Ollama](https://ollama.com).

```sh
ollama pull qwen2.5:3b
ollama serve

cd client
npm install
npm run models   # once: downloads the speech models
npm run dev      # then open http://localhost:5173
```

If the header says "Ollama is not running" while it is, start Ollama with the app's
address allowed: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`. On Windows,
`setup-local.ps1` installs and configures everything.

Then try it: on the Calls tab, upload `client/samples/call-147.m4a` and press
**Transcribe & score**. The agent in that call reads a card number back and never checks
the caller's identity, so it should come out as 62 / 100, Failed, with two critical flags.

Optional:

```sh
npm run whisper  # macOS: Whisper large-v3-turbo through whisper.cpp (brew install whisper-cpp)
npm --prefix ../server install && npm run server  # SQLite storage and uploads from phones
```

Without the server, calls are stored in the browser (IndexedDB).

## Limits

- Scoring is tuned for English. A call in another language is still transcribed, but it
  is left unscored and marked Needs review until an analyst marks each rule by hand.
- We do not claim an accuracy rate. The test recordings are scripted with synthetic
  voices; `npm run eval` and `npm run eval:redaction` are regression checks on scripted
  transcripts, not a measure of accuracy on real calls.
- Rules you write yourself in the scorecard editor are judged with one general question
  each, which is cruder than the seven built-in rules.
- Phone uploads stay private only on the same Wi-Fi or a hotspot. A public tunnel would
  route the audio through that tunnel company's servers.
- The native Whisper path is macOS only. Elsewhere the smaller Whisper base runs in the
  browser and makes more transcription mistakes.

## Repository

- `client/`: the app. Developer notes are in `client/README.md`; the design system is in
  `client/DESIGN.md`.
- `server/`: optional storage and phone-upload server.
- `docs/`: build notes, and the phone upload guide (`docs/PHONE_UPLOADS.md`).
- `linya-ads/`: the demo video project.

## Team

Team Busseng: John Patrick Soriaga and Polstuds27.
