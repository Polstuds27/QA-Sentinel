// Pipeline contracts for the planned local-AI phase.
// Types only — no model code, no workers, no network. See docs/LOCAL_AI_PLAN.md.
import type { CheckResult } from "../lib/scorecard";

export type PipelineStage = "queued" | "transcribing" | "scoring" | "done" | "error";

export interface TranscriptChunk {
  start: number; // seconds
  end: number; // seconds
  speaker: "agent" | "customer" | "unknown"; // unknown = mono fallback, split is Phase 3
  text: string;
  /** The words of `text`, each with its own time. `text` is these joined by single spaces. */
  words?: Array<{ start: number; end: number; text: string }>;
}

export interface PipelineJob {
  callId: string;
  stage: PipelineStage;
  progress: number; // 0–100
  transcript: TranscriptChunk[];
  results: CheckResult[];
  error?: string;
}

export type { CheckResult };
