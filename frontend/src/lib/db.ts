import Dexie, { type Table } from "dexie";

export interface CallRecord {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  audioUrl?: string;
  fileName?: string;
}

export interface TranscriptLine {
  id?: number;
  callId: string;
  time: string;
  speaker: "Agent" | "Customer";
  text: string;
}

class QADb extends Dexie {
  calls!: Table<CallRecord, string>;
  transcripts!: Table<TranscriptLine, number>;
  constructor() {
    super("qa-sentinel");
    this.version(1).stores({
      calls: "id, agent, scorecard",
      transcripts: "++id, callId",
    });
  }
}

export const db = new QADb();
