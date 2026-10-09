// Local pipeline dispatcher: upload → Whisper → PII → Ollama 3B scoring.
// Phase 1+2 working piece. AI stays OFF unless the user flips the in-app toggle.
// Critical card-readback is double-decided: the deterministic PII engine (spec §06)
// overrules the LLM whenever an agent-spoken line carries card digits.
import { type Check, type CheckResult } from "../lib/scorecard";
import { findCardHits } from "../lib/pii";
import { getBackend } from "./backend";
import { chunksToLines, decodeCall, transcribeAudio } from "./whisper";
import type { TranscriptChunk } from "./types";

const FLAG_KEY = "qa-ai-enabled";

export function isAIEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAIEnabled(v: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, v ? "1" : "0");
  } catch {
    // private mode — toggle just won't persist
  }
}

// Back-compat for the header badge; prefer isAIEnabled() in new code.
export const AI_ENABLED = false as const;

export type PipelineStage = "decoding" | "transcribing" | "scoring" | "done" | "error";

export interface PipelineProgress {
  stage: PipelineStage;
  detail: string;
}

export interface PipelineLine {
  time: string;
  speaker: string;
  text: string;
}

export interface PipelineCallResult {
  lines: PipelineLine[];
  results: CheckResult[];
  duration: string;
}

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

  onStage({ stage: "transcribing", detail: `Whisper base: ${channels.length} channel(s)` });
  const stereo = channels.length > 1;
  const channelLabels = stereo ? ["agent", "customer"] : ["unknown"];
  const all: TranscriptChunk[] = [];
  const useChannels = stereo ? channels.slice(0, 2) : channels.slice(0, 1);
  for (let i = 0; i < useChannels.length; i++) {
    const chunks = await transcribeAudio(useChannels[i]);
    all.push(...chunksToLines(chunks, channelLabels[i] ?? "unknown"));
  }
  all.sort((a, b) => a.start - b.start);
  const lines: PipelineLine[] = all.map((l) => ({
    time: fmtTime(l.start),
    speaker: l.speaker === "agent" ? "Agent" : l.speaker === "customer" ? "Customer" : "Unknown",
    text: l.text,
  }));
  if (lines.length === 0) throw new Error("Transcription came back empty — try a louder/clearer clip.");

  const transcript = lines.map((l) => `[${l.time}] ${l.speaker}: "${l.text}"`).join("\n");
  const piiFacts = lines.flatMap((l) =>
    findCardHits(l.text).map(
      (h) => `Line ${l.time} (${l.speaker}) contains a ${h.digits.length}-digit card number ending ${h.last4}.`,
    ),
  );

  const results: CheckResult[] = [];
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    onStage({ stage: "scoring", detail: `${backend.label}: ${i + 1}/${checks.length} ${check.id}` });
    const r = await backend.score(check, transcript, piiFacts);
    if (r.verdict !== "not_applicable" && !quoteExists(transcript, r.evidence ?? "")) {
      throw new Error(`Quote-guard rejected ${r.check_id}: evidence not found in transcript.`);
    }
    results.push(r);
  }

  // Deterministic critical override (spec §06): agent-spoken card digits = fail.
  const agentCardLine = lines.find((l) => l.speaker === "Agent" && findCardHits(l.text).length > 0);
  if (agentCardLine) {
    const idx = results.findIndex((r) => r.check_id === "no_card_readback");
    if (idx >= 0) {
      results[idx] = {
        check_id: "no_card_readback",
        verdict: "fail",
        severity: "critical",
        speaker: "agent",
        timestamp: agentCardLine.time,
        evidence: agentCardLine.text,
        reason: "Deterministic PII engine: agent spoke a full card number.",
      };
    }
  }

  const mins = Math.floor(durationS / 60);
  return { lines, results, duration: `${mins}:${String(Math.floor(durationS % 60)).padStart(2, "0")}` };
}
