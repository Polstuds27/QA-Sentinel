// Local pipeline dispatcher: upload → Whisper → PII → Ollama 3B scoring.
// Phase 1+2 working piece. AI stays OFF unless the user flips the in-app toggle.
// Critical card-readback is double-decided: the deterministic PII engine (spec §06)
// overrules the LLM whenever an agent-spoken line carries card digits.
import { type Check, type CheckResult } from "../lib/scorecard";
import { findCardHits } from "../lib/pii";
import { getBackend, type BackendProvider } from "./backend";
import { findPersonalDetails } from "./redaction.ts";
import type { Redaction } from "../lib/pii.ts";
import { assignChannels, assignVoices, channelsCarrySameAudio, decodeCall, diarizeAudio, dropSilentWords, mainVoices, mixDown, transcribeAudio, wordsToLines, type Word } from "./whisper";
import type { TranscriptChunk } from "./types";
import { WHISPER } from "./models.ts";
import { NATIVE_WHISPER_NAME, nativeWhisperUp } from "./native-whisper";

// "Xenova/whisper-small" → "Whisper small", for the progress text.
const BROWSER_WHISPER_NAME = `${WHISPER.id.split("/")[1].replace("whisper-", "Whisper ")} (in browser)`;

export type PipelineStage = "decoding" | "transcribing" | "redacting" | "scoring" | "done" | "error";

export interface PipelineProgress {
  stage: PipelineStage;
  detail: string;
}

export interface PipelineLine {
  time: string;
  speaker: string;
  text: string;
  /** Each word's start and end in seconds, for following along with the audio. */
  words?: Array<{ start: number; end: number; text: string }>;
}

/**
 * How the speakers were told apart: "channels" = a stereo recording (certain),
 * "voice" = a mono recording split by voice, with agent/customer worked out from what
 * each voice said (usually right, not certain), "unknown" = could not be told apart.
 */
export type SpeakerSource = "channels" | "voice" | "unknown";

export interface PipelineCallResult {
  lines: PipelineLine[];
  results: CheckResult[];
  duration: string;
  speakers: SpeakerSource;
  /** Which Whisper transcribed the call, for the record: "Whisper large-v3-turbo" or "Whisper base (in browser)". */
  engine: string;
  /** Customer details the model found, to hide wherever they appear. */
  redactions: Redaction[];
  /** Languages Whisper detected, most-heard first, as codes: ["en"] or ["tl", "en"]. */
  languages: string[];
}

// Phrases that mark which of two voices is the agent. English only.
const AGENT_CUES = /thank you for calling|thanks for calling|how (can|may) i help|this is \w+|speaking\b|anything else|may i have|can i (get|have) your|could you (give|tell|confirm)|verify|for security|i understand|i('ve| have) (blocked|filed|reset|unblocked)|i can see/gi;
const CUSTOMER_CUES = /\bi want\b|\bi need\b|i'd like|my card|my account|i was charged|i lost|someone used|i paid|can i get my/gi;
const count = (text: string, cues: RegExp) => text.match(cues)?.length ?? 0;

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Quote-check guard (spec §08): reject verdicts whose evidence is not verbatim.
// Tier 1: normalized substring (case/punctuation-insensitive). Tier 2: fuzzy —
// ≥80% of evidence words in order (Whisper spells "BankCo" as "bank code", etc.).
// The analyst still confirms every flag in the UI.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteExists(transcript: string, evidence: string): boolean {
  const e = norm(evidence);
  if (!e) return false;
  const t = norm(transcript);
  if (t.includes(e)) return true;
  const words = e.split(" ");
  let pos = 0;
  let hit = 0;
  for (const w of words) {
    const idx = t.indexOf(w, pos);
    if (idx >= 0) {
      hit++;
      pos = idx + w.length;
    }
  }
  return hit / words.length >= 0.8;
}

export const MANUAL_REVIEW = "Needs manual review";

// Evidence rule (spec §08): a verdict only counts if its quote is in the transcript.
// A rejected or unparseable answer is asked for once more; if it fails again the check
// is left unscored for the analyst rather than failing the whole call.
async function scoreGuarded(
  backend: BackendProvider,
  check: Check,
  transcript: string,
  piiFacts: string[],
): Promise<CheckResult> {
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await backend.score(check, transcript, piiFacts);
      const evidence = r.evidence ?? "";
      if (r.verdict === "not_applicable") return { ...r, evidence: "", timestamp: "" };
      // A claim that something WAS said (a duty done, a ban broken) must come with the
      // quote. A claim that something was never said has nothing to quote, so it may
      // arrive empty. Any quote that is given must be in the transcript.
      const claimsItWasSaid =
        (check.kind === "must_do" && r.verdict === "pass") || (check.kind === "must_not" && r.verdict === "fail");
      if (!evidence && !claimsItWasSaid) return r;
      if (evidence && quoteExists(transcript, evidence)) return r;
      problem = evidence
        ? "the model's evidence quote was not found in the transcript"
        : "the model gave no quote for something it says was said";
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e; // backend down: stop, do not guess
      problem = "the model did not return valid JSON";
    }
  }
  return {
    check_id: check.id,
    verdict: "not_applicable",
    severity: check.critical ? "critical" : "normal",
    timestamp: "",
    evidence: "",
    reason: `${MANUAL_REVIEW}: ${problem}.`,
  };
}

export async function runLocalPipeline(
  file: Blob,
  checks: Check[],
  onStage: (p: PipelineProgress) => void,
): Promise<PipelineCallResult> {
  const backend = getBackend();
  if (!(await backend.check())) {
    throw new Error(`${backend.label} not reachable — start the backend first (Ollama: \`ollama serve\`).`);
  }
  onStage({ stage: "decoding", detail: "Decoding + resampling to 16 kHz mono" });
  const { channels, durationS } = await decodeCall(file);

  // Prefer the native Whisper service; without it, Whisper runs in the browser.
  const native = await nativeWhisperUp();
  const WHISPER_NAME = native ? NATIVE_WHISPER_NAME : BROWSER_WHISPER_NAME;

  // Two channels only mean two people when they carry different audio.
  const stereo = channels.length > 1 && !channelsCarrySameAudio(channels[0], channels[1]);
  const mono = stereo ? channels[0] : channels.length > 1 ? mixDown(channels[0], channels[1]) : channels[0];
  let speakers: SpeakerSource = stereo ? "channels" : "unknown";
  type Spoken = Word & { speaker: TranscriptChunk["speaker"] };
  const spoken: Spoken[] = [];
  const heardIn: string[] = [];
  const heard = (language: string, words: Word[]) => {
    if (words.length > 0 && !heardIn.includes(language)) heardIn.push(language);
  };
  if (stereo) {
    // Each channel is one person. The two are mixed and transcribed once, so Whisper hears
    // the whole conversation; then each phrase goes to the channel that is louder while
    // it is said. Left is the agent, right is the customer.
    onStage({ stage: "transcribing", detail: `${WHISPER_NAME}: 2 channels` });
    const mix = mixDown(channels[0], channels[1]);
    const { words: raw, language } = await transcribeAudio(mix, native);
    const words = dropSilentWords(raw, mix);
    heard(language, words);
    const channelOf = assignChannels(words, channels[0], channels[1]);
    spoken.push(...words.map((w, i) => ({ ...w, speaker: channelOf[i] === 0 ? ("agent" as const) : ("customer" as const) })));
  } else {
    // One channel: transcribe the whole recording once, then give each word to whichever
    // voice is speaking at that moment. No word can end up under both speakers.
    onStage({ stage: "transcribing", detail: "Telling the two voices apart" });
    const segments = await diarizeAudio(mono);
    onStage({ stage: "transcribing", detail: `${WHISPER_NAME}: word by word` });
    const { words: raw, language } = await transcribeAudio(mono, native);
    const words = dropSilentWords(raw, mono);
    heard(language, words);
    const voices = mainVoices(segments);
    if (voices && words.length > 0) {
      const voiceOf = assignVoices(words, segments, voices);
      // Which voice is the agent: the one that talks like one. On a tie, whoever speaks
      // first (the agent answers the call).
      const lean = [0, 1].map((v) => {
        const text = words.filter((_, i) => voiceOf[i] === v).map((w) => w.text).join(" ");
        return count(text, AGENT_CUES) - count(text, CUSTOMER_CUES);
      });
      const agent = lean[0] === lean[1] ? voiceOf[0] : lean[0] > lean[1] ? 0 : 1;
      spoken.push(...words.map((w, i) => ({ ...w, speaker: voiceOf[i] === agent ? ("agent" as const) : ("customer" as const) })));
      speakers = "voice";
    } else {
      spoken.push(...words.map((w) => ({ ...w, speaker: "unknown" as const })));
    }
  }
  const all = wordsToLines(spoken);
  const lines: PipelineLine[] = all.map((l) => ({
    time: fmtTime(l.start),
    speaker: l.speaker === "agent" ? "Agent" : l.speaker === "customer" ? "Customer" : "Unknown",
    text: l.text,
    words: l.words?.map((w) => ({ start: Math.round(w.start * 100) / 100, end: Math.round(w.end * 100) / 100, text: w.text })),
  }));
  if (lines.length === 0) throw new Error("Transcription came back empty — try a louder/clearer clip.");

  const transcript = lines.map((l) => `[${l.time}] ${l.speaker}: "${l.text}"`).join("\n");
  const piiFacts = lines.flatMap((l) =>
    findCardHits(l.text).map(
      (h) => `Line ${l.time} (${l.speaker}) contains a ${h.digits.length}-digit card number ending ${h.last4}.`,
    ),
  );

  onStage({ stage: "redacting", detail: "Finding names and other customer details to hide" });
  const redactions = await findPersonalDetails(lines);

  const results: CheckResult[] = [];
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    onStage({ stage: "scoring", detail: `${backend.label}: ${i + 1}/${checks.length} ${check.id}` });
    results.push(await scoreGuarded(backend, check, transcript, piiFacts));
  }

  // Deterministic card-readback verdict (spec §06). When the speakers are known (stereo
  // recording), whether an agent line carries a card-length number is a fact, not a
  // judgment, so the PII engine decides this check both ways and the LLM is overruled.
  const speakersKnown = lines.some((l) => l.speaker === "Agent");
  // When the speakers are not certain (mono), a rule that needs no labels backs them up:
  // the customer says the number once, so the same number turning up again is a readback.
  const cardLines = lines.filter((l) => findCardHits(l.text).length > 0);
  const repeated =
    speakers === "channels"
      ? undefined
      : cardLines.find((l, i) => cardLines.slice(0, i).some((p) => findCardHits(p.text).some((a) => findCardHits(l.text).some((b) => a.last4 === b.last4))));
  const agentCardLine = lines.find((l) => l.speaker === "Agent" && findCardHits(l.text).length > 0) ?? repeated;
  const idx = results.findIndex((r) => r.check_id === "no_card_readback");
  if (idx >= 0 && agentCardLine) {
    results[idx] = {
      check_id: "no_card_readback",
      verdict: "fail",
      severity: results[idx].severity,
      speaker: "agent",
      timestamp: agentCardLine.time,
      evidence: agentCardLine.text,
      reason: findCardHits(agentCardLine.text).some((h) => h.valid)
        ? "Deterministic PII engine: agent spoke a full card number."
        : "Deterministic PII engine: agent spoke a card-length number. The checksum did not match, so a digit may have been misheard.",
    };
  } else if (idx >= 0 && speakersKnown) {
    results[idx] = {
      check_id: "no_card_readback",
      verdict: "pass",
      severity: results[idx].severity,
      timestamp: "",
      evidence: "",
      reason: "Deterministic PII engine: no agent line contains a card-length number.",
    };
  }

  const mins = Math.floor(durationS / 60);
  return { lines, results, duration: `${mins}:${String(Math.floor(durationS % 60)).padStart(2, "0")}`, speakers, engine: WHISPER_NAME, languages: heardIn, redactions };
}
