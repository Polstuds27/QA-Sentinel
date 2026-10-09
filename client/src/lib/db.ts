import Dexie, { type Table } from "dexie";
import type { Check } from "./scorecard";
import type { Redaction } from "./pii";

export interface CallRecord {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  audioUrl?: string;
  fileName?: string;
  number?: number;
  languages?: string[];
  engine?: string;
  redactions?: Redaction[];
  speakers?: "channels" | "voice" | "unknown";
  source: "demo" | "ai";
  coaching?: string;
  createdAt: number;
}

export interface TranscriptRow {
  id?: number;
  callId: string;
  time: string;
  speaker: string;
  text: string;
  words?: Array<{ start: number; end: number; text: string }>;
}

export interface ResultRow {
  id?: number;
  callId: string;
  check_id: string;
  verdict: string;
  severity: string;
  speaker?: string;
  timestamp?: string;
  evidence?: string;
  reason?: string;
}

export interface OverrideRow {
  id?: number;
  callId: string;
  check_id: string;
  verdict: string;
  decidedAt: number;
}

export interface AudioRow {
  callId: string;
  blob: Blob;
}

export interface ScorecardRow {
  id: string;
  name: string;
  checks: Check[];
  updatedAt: number;
}

class QADb extends Dexie {
  calls!: Table<CallRecord, string>;
  transcripts!: Table<TranscriptRow, number>;
  results!: Table<ResultRow, number>;
  overrides!: Table<OverrideRow, number>;
  scorecards!: Table<ScorecardRow, string>;
  audio!: Table<AudioRow, string>;
  constructor() {
    // Keeps its pre-rename name so calls already stored on a machine are not orphaned.
    super("qa-sentinel");
    this.version(1).stores({
      calls: "id, agent, scorecard",
      transcripts: "++id, callId",
    });
    this.version(2).stores({
      calls: "id, agent, source",
      transcripts: "++id, callId",
      results: "++id, callId, check_id",
      overrides: "++id, callId, check_id",
      scorecards: "id",
    });
    // v3: keep each uploaded recording next to its call so it still plays after a reload.
    // It also adds the compound index the override lookups in store.ts query by.
    this.version(3).stores({
      audio: "callId",
      results: "++id, callId, check_id, [callId+check_id]",
      overrides: "++id, callId, check_id, [callId+check_id]",
    });
  }
}

export const db = new QADb();
