// The shape of a scored call. (The file is still called mock.ts from when it also held
// scripted sample calls; those are gone and every call here is a real, scored recording.)
import type { CheckResult } from "./lib/scorecard";
import type { Redaction } from "./lib/pii";

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
  /** Each word's start and end in seconds. Present on transcribed calls; `text` is these joined by spaces. */
  words?: Array<{ start: number; end: number; text: string }>;
}

export interface DemoCall {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  /** File name of an uploaded recording. */
  name?: string;
  /** Call number shown after the agent's name ("Jason Call No. 12"). */
  number?: number;
  /** Customer details found by the local model, hidden wherever they appear. */
  redactions?: Redaction[];
  /** Which Whisper transcribed an uploaded call. */
  engine?: string;
  /** Languages detected in an uploaded call, as codes ("en", "tl"). */
  languages?: string[];
  /** How an uploaded call's speakers were told apart. See SpeakerSource in ai/pipeline.ts. */
  speakers?: "channels" | "voice" | "unknown";
  /** Where this tab can play the recording from. Not stored. */
  audio?: string;
  lines: TranscriptLine[];
  results: CheckResult[];
}

// A call is known by who took it and its number: "Jason Call No. 147".
// A recording dropped in by hand has no agent, so it is just "Call No. 175".
export const callTitle = (c: DemoCall) => `${c.agent === "Uploaded call" ? "" : `${c.agent} `}Call No. ${c.number ?? c.id}`;
