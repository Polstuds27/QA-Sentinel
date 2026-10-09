import Dexie, { type Table } from "dexie";
import type { Check } from "./scorecard";

export interface CallRecord {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  audioUrl?: string;
  fileName?: string;
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
  constructor() {
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
  }
}

export const db = new QADb();
