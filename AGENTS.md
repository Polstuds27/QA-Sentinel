# AGENTS.md — Linewise

Linewise is the product's name. It was QA Sentinel until Oct 9, 2026, then Linya until
Oct 10 (old database and model folders are renamed automatically on start). The concept PDF, the
repo folder, the GitHub repo and some internal keys (`qa-sentinel` IndexedDB name,
`qa-ai-enabled` localStorage key) still use the old name; use Linewise everywhere new. The promo video project is still the folder `linya-ads/`.

Local-AI call-center QA (AppBuildersPH Hackathon 2026, Local AI track): batch-upload
call recordings, transcribe + score + flag every call on-device, export redacted reports.
One-liner: "A robot QA checker for call center calls that never sends customer data anywhere."
Submission due 10:00 AM Oct 10 — working product over slides.

## Layout

- `client/` — Vite 8 + React 19 + TS + Tailwind v4 SPA. The app.
- `client/src/App.tsx` — all 5 screens. The scorecard editor can add, reword, retype
  and remove checks (each with an optional "how to judge it" note that is sent to the
  model); uploaded calls can be deleted from the Calls list or call detail, which also
  removes the stored recording; a queue row shows a spinner and a progress line while it
  is processed. `mock.ts` — only the types of a scored call now (`DemoCall`,
  `TranscriptLine`, `callTitle`). The app ships with no sample data: every call shown was
  really transcribed and scored, and a fresh install starts empty.
- `client/src/ai/` — working local pipeline: `whisper.ts` + `speech.worker.ts`
  (Whisper base and pyannote speaker separation, Web Worker), `ollama.ts` (qwen2.5:3b scoring), `backend.ts`
  (provider abstraction: Ollama live, WebLLM stubbed), `coaching.ts` (notes),
  `pipeline.ts` (dispatcher, two-tier quote guard, deterministic critical override). A
  verdict that fails the quote guard is asked for once more, then left unscored as
  "Needs manual review" instead of failing the whole call.
  Behind the in-app Local AI toggle (`localStorage qa-ai-enabled`). OFF = stored calls
  can be read but nothing new is scored; ON = uploads and phone recordings are scored.
- `client/src/lib/` — `scorecard.ts`, `pii.ts` (`redactPII` + `findCardHits`: any run
  of 13–19 digits is redacted and flagged even if Luhn fails, because Whisper mishears
  digits; `valid` says whether the checksum matched),
  `db.ts` (Dexie v3: calls, transcripts, results, overrides, scorecards, audio),
  `store.ts` (persistence service), `export.ts` (redacted PDF report; CSV export was removed),
  `agents.ts` (per-agent stats).
- `client/DESIGN.md` — the Gallery White design system (off-white wall, black type,
  cobalt as the only accent, square corners, no shadows). Read it before touching UI.
- `client/src/components/ui/` — shadcn/ui (Base UI, `base-nova`) components, restyled in
  place for Gallery White. Add more with `npx shadcn@latest add <name>`, then restyle to
  match. Imports use the `@/` alias (`@/components/ui/button`, `@/lib/utils`).
- `client/src/index.css` — all colour tokens (`:root` and `.dark`); dark mode follows the
  system setting via `main.tsx`.
- `client/src/components/logo.tsx` — the Linewise logo (an L with a cobalt dot, plus the
  wordmark). PNG exports and the favicon are in `client/public/` (`logo.png`,
  `logo-dark.png`, `logo-mark.png`, `favicon.svg`).
- `client/src/components/transcript.tsx` — the transcript on call detail. It follows the
  audio and shows the word being spoken in cobalt; clicking a word plays from it. Uses the
  per-word times stored on each line (`words`); calls scored before those were kept have
  none, so theirs are estimated from the line times.
- `client/src/components/audio-player.tsx` + `waveform.tsx` — custom player for call
  detail: hairline track, cobalt playhead, a tick at each flagged timestamp, and a canvas
  waveform decoded from the recording (agent channel above the line, customer below) that
  moves at the playhead during playback. Plain `<audio>` underneath; `wavesurfer.js` is
  still unwired and no longer needed for this.
- `client/samples/call-*.m4a` — three scripted test recordings to upload and score, built
  by `client/scripts/make_sample_calls.py` (macOS `say` voices; stereo, agent left,
  customer right). They are not part of the app and are not served by it. Synthetic voices
  on scripted calls: test input, never a benchmark. `call-147.m4a` is the spec's scenario
  (card read back, no identity check) and should score 62 with the preset scorecard.
- `client/scripts/` — `phase0-*.mjs` (model checks), `phase1-e2e.mjs` (full
  upload→transcribe→score browser test; it finds elements by `data-testid` and by the
  header text "Local AI on (Whisper + Ollama 3B)", so keep those when restyling).
  `phase0.html` = WebLLM harness (blocked HW).
- `docs/LOCAL_AI_PLAN.md` — phased local AI/backend plan. `docs/BACKEND_CAPSULE.md` —
  backend notes.
- `server/` — Linewise's server (Node, Express, `npm run server` from `client/`, port 8787).
  Two jobs. (1) Storage: one SQLite database, `server/data/linewise.db`, through Node's
  built-in `node:sqlite` (no install). Tables in `server/db.mjs`: `agents`, `uploads`
  (recordings phones sent), `calls`, `transcript_lines`, `results`, `decisions`,
  `scorecards`, `settings`. Audio is files beside it: `server/data/uploads/` (from phones,
  named by SHA-256) and `server/data/calls/` (dragged into the app, named by call id).
  (2) Phone uploads: one token per agent, `POST /api/uploads`, duplicates dropped by hash,
  a queue the app (Local AI on) works through one at a time via the Vite `/api` proxy.
  `server/data/` is git-ignored (tokens and recordings). Admin routes answer only to the
  laptop itself and refuse anything that came through a tunnel.
- `client/src/lib/store.ts` — the app's storage. Uses the server's database when it is
  running, else falls back to IndexedDB in the browser (`store.local.ts`, the old way). The
  first time it finds the server it copies the browser's calls into the database and
  leaves the browser copy in place. UI for phones: `devices.tsx` (Agents tab),
  `phone-uploads.tsx` (Calls tab), `lib/server.ts`. Guide, shortcut steps, curl and test
  checklist: `docs/PHONE_UPLOADS.md`. The shortcut works on two real iPhones (Oct 10).
- `linya-ads/` — Remotion project for the promo video. Separate package, not part of the app.
- Local backend only: Ollama on localhost (qwen2.5:3b) + IndexedDB in the browser.
  No hosted servers, no cloud APIs — audio never leaves the machine.
  `recharts` wired (dashboard); `wavesurfer.js` installed but unwired.
- The repo root (this folder) is the git repo; run git here, npm inside `client/`.

## Commands

The npm commands are the same in zsh, bash and PowerShell.

```sh
cd client; npm install
npm run models                             # once per machine: fetch speech models (needs internet)
npm run dev                                # the app; tick Local AI to score recordings
npm run build                              # tsc -b + vite build (must pass)
npm run lint                               # oxlint
npm run whisper                            # optional: native Whisper large-v3-turbo (macOS, whisper.cpp)
npm run server                             # the server: SQLite storage and uploads from phones
node scripts/phase1-e2e.mjs                # whole-piece E2E (needs dev + ollama up)
npm run eval                               # scoring regression check (needs ollama up)
npm run eval:redaction                     # redaction regression check (needs ollama up)
```

`phase1-e2e.mjs` has a Windows Chrome path and profile directory hard-coded; change them
to run it on another machine.

Ollama (required when the AI toggle is on): `ollama serve` must run with
`OLLAMA_ORIGINS` including `http://localhost:5173` (on Windows set via `setx`, then
restart the server; recent Ollama versions allow `http://localhost:*` by default).
Models: `qwen2.5:3b` for scoring.

Speech to text has two engines; the pipeline picks per call and records which one ran
(`engine` on the call, shown on call detail):

- Native (preferred): `npm run whisper` starts whisper.cpp with Whisper large-v3-turbo on
  `localhost:8178` (`scripts/native-whisper.mjs`, `src/ai/native-whisper.ts`). Needs
  `brew install whisper-cpp`; the 1.6 GB model lives in `~/.linewise/`, outside the repo.
  Runs with `-dtw large.v3.turbo -nfa`: the app reads each word's end time from `t_dtw`,
  because the service's ordinary word times stamp a sentence's first word in the silence
  before it. Use the name `localhost`, not `127.0.0.1`, in the URL.
- In browser (fallback when the service is not running): Whisper base, set in
  `src/ai/models.ts`. Small is available but slow; medium does not fit in a tab
  (8-bit build ran out of memory, `std::bad_alloc`).

Measured Oct 9 on the M4 Pro Mac, sample calls, upload to scored call: turbo 7 to 9 s,
base in browser 10 to 16 s, small in browser about 60 s. Turbo wrote the card number and
"BankCo" correctly where base did not. The Intel laptop has no fast path for turbo: it
stays on base in the browser.

Offline by construction: the app makes no request to any machine but this one
(`localhost:11434` for Ollama, `localhost:8178` for native Whisper, its own origin).
`npm run models` puts Whisper base and pyannote segmentation 3.0 in `client/public/models/`
and the ONNX WebAssembly runtime in `client/public/ort/` (both git-ignored, about 340 MB; one file
is over GitHub's 100 MB limit). `speech.worker.ts` sets `allowRemoteModels = false`
and points the runtime at `/ort/`; without that the library pulls it from cdn.jsdelivr.net.
`localModelPath` must stay a relative path (a full URL makes the library skip tokenizers).
`vite.config.ts` returns 404 for missing files under `/models` and `/ort`, because Vite's
index.html fallback breaks the library's probing. Verified Oct 9: fresh browser profile,
all non-localhost DNS blocked, stereo and mono calls both transcribed and scored.

Language: the library assumes English when no language is given, so `speech.worker.ts`
detects it the way Whisper does (one decoding step, highest language token) for each
channel or voice, then transcribes in that language. The call shows what was detected
("English", "Filipino", "Spanish + English"). Detection was right on English, Spanish,
Tagalog and Japanese test clips (Oct 9). Everything after transcription is still tuned
for English: the keyword lists in `ollama.ts` and `pipeline.ts`, and the eval set.
Whisper base transcribes Tagalog poorly; a larger Whisper is the fix, not the prompt.

Transcription is word by word (`whisper.ts`): both engines return a time for every word.
A two-channel file only counts as stereo when the channels carry different audio
(`channelsCarrySameAudio`): files saved from video sites or converted to MP3 hold one
recording on both channels, and are mixed down and handled as mono.
Stereo: the two channels are mixed and transcribed once, words "heard" over silence are
dropped by loudness (`dropSilentWords`), and each phrase goes to the channel that is louder
while it is said (`assignChannels`). Mono: the recording is transcribed once and each word goes to
the voice pyannote says is speaking (`assignVoices`, voted per phrase so a sentence is not
split between people), and a word cannot appear under both speakers; the voice that talks like an agent (phrase cues, else first to speak) is
labelled Agent and the call is marked `speakers: "voice"`. If two voices are not found,
lines stay "Unknown". Lines break on a speaker change, or a finished sentence followed by
a pause. On mono, a card number that appears a second time also counts as a readback.
Measured Oct 9 on the three sample calls, stereo and mono: every script word under the
right speaker except spelling variants ("Bank Co" for "BankCo", "Ok" for "Okay"), no
duplicated or invented words. Synthetic voices with no overlap: an easy case.

## Rules from the spec doc

Source: `QA-Sentinel-Concept.pdf` (concept, build plan and pitch, prepared Oct 9, 2026).
Its navy/teal mockups are superseded by `client/DESIGN.md`; everything else stands.

- Scorecard `BANK_SUPPORT_V2` (7 checks, weights sum to 100): green ≥85, amber 70–84,
  red <70; any critical fail forces red; N/A checks excluded and score scaled to 100.
- Evidence rule: every verdict needs a transcript quote; reject it if the quote is not
  in the transcript (then re-run or mark for manual review). Claim only measured accuracy
  numbers, never invented ones.
- Per-check LLM output matches `CheckResult` in `src/lib/scorecard.ts`: `check_id`,
  `verdict` (pass | fail | not_applicable), `severity`, `speaker`, `timestamp`, `evidence`,
  `reason`.
- PII: two layers, both applied by `redactPII` / `findHidden` in `lib/pii.ts`. Patterns:
  card-length numbers, emails, phones, dates with a year, account IDs, any 6+ digit run, a
  name after Mr/Ms/Mrs. Model pass (`ai/redaction.ts`): names, addresses and security
  answers, stored on the call as `redactions`. The model only returns short strings; code
  accepts one only if it is literally in the transcript and is not the agent's name, and
  does the replacing itself. The agent's name and the company name stay visible.
  `npm run eval:redaction` checks eight scripted calls (22 details hidden of 22, 17 of 17
  kept, Oct 9). Scripted English; real names and addresses will slip through sometimes.
- Prompts live in three files: `ai/ollama.ts` (scoring: `SYSTEM`, the per-check `PLANS`,
  `customPlan`), `ai/redaction.ts` (`SYSTEM`), `ai/coaching.ts` (the coaching note). Exports must
  stay redacted (`[CARD •••• 1111]`, `[EMAIL]`, `[PHONE]`). A card number spoken by the
  agent is both a redaction span and a compliance flag.
- Hard constraints: no cloud AI APIs, audio never leaves the machine, offline after first
  load (the demo runs in airplane mode).
- Phone uploads keep that promise only on the same Wi-Fi or a hotspot, where audio goes
  phone → laptop. A Cloudflare or ngrok tunnel sends it through that company's servers:
  say so if it is used, and do not demo the privacy claim over a tunnel.
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
fast but wrong on criticals; Ollama 3B correct (~26 s cold). On the Mac (Oct 9), real
pipeline ran end to end in the browser on the M4 Pro Mac with `samples/call-147.m4a`:
about 22 s to transcribe both channels, about 6 s to score all 7 checks, result 62/100 RED
with both critical flags, the same as the spec scenario.

Scoring design (`ollama.ts`): the model never returns a verdict. Each check is split into
yes/no probes, each asked on its own over only the lines that can answer it (agent lines,
customer lines, or the first/last agent line). The model replies `why`, then `answer`,
then the number of the supporting line; code turns the answers into the verdict, the
reason text and the evidence line. Order matters: asked to quote first, qwen2.5:3b returns
an empty quote and argues "false". Card numbers and "does the call touch an account" are
read by regex, not asked. Custom or reworded checks get one generic probe built from their
wording and "how to judge it" note.

`node scripts/eval-scoring.mjs` (needs `ollama serve`) replays 18 scripted transcripts
with expected verdicts. Measured Oct 9 on the Mac: the first prompt scored 81% on the
held-out set; the probe design scored 41/42 (98%) on six transcripts written after the
prompt was frozen. That one miss led to a keyword backstop for identity questions, after
which all 126 verdicts matched over two runs, but those sets are no longer unseen. These
are scripted English transcripts, not real calls: never quote them as product accuracy.
Change the prompt only with this script, and add new cases instead of fitting to old ones. Still TODO (gated):
a full Wi-Fi-off rehearsal on the demo laptop, WebLLM revisit on stronger hardware. That E2E run was before the Gallery White
restyle was merged in; re-run it once on the merged UI.

The spec's original plan was WebLLM in the browser (Qwen2.5-3B-Instruct or
Llama-3.2-3B-Instruct, 1.5B fallback) with Ollama as the optional switch. Ollama is the
working backend because WebLLM is blocked on the test hardware.

## Submission (10:00 AM Oct 10, one submission, no extensions)

- Public GitHub repo by the deadline; judges review it as of then.
- README with setup steps for judges and the disclosures. Today that is
  `client/README.md`; there is no README at the repo root, where judges land first.
- About 1 minute of demo video, and an X / LinkedIn post tagging Devin / Cognition with
  #AppBuildersPH.
- List only models and tools actually used. Fake benchmarks can get a result disputed.

## Env notes

- Two machines work on this repo: one macOS (zsh), one Windows (PowerShell). On Windows:
  no Unix-isms (`head` fails), chain with `;`, quote spaced paths.
- Keep `.ps1` files ASCII-only: PS 5.1 misreads BOM-less UTF-8, and em-dash bytes
  decode as a quote character that breaks parsing (measured on `setup-local.ps1`).
