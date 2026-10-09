// Persistence service over the Dexie `qa-sentinel` database.
// Demo calls stay in-memory (mock.ts); everything the analyst produces —
// AI-processed calls, verdict overrides, edited scorecards, coaching notes —
// is stored here and reloaded on startup.
import { db } from "./db";
import { BANK_SUPPORT_V2, type Check } from "./scorecard";
import type { DemoCall } from "../mock";

export const SCORECARD_ID = "bank-support-v2";

export async function saveAICall(call: DemoCall): Promise<void> {
  await db.transaction("rw", db.calls, db.transcripts, db.results, async () => {
    await db.transcripts.where("callId").equals(call.id).delete();
    await db.results.where("callId").equals(call.id).delete();
    await db.calls.put({
      id: call.id,
      agent: call.agent,
      duration: call.duration,
      scorecard: call.scorecard,
      source: "ai",
      createdAt: Date.now(),
    });
    await db.transcripts.bulkAdd(
      call.lines.map((l) => ({ callId: call.id, time: l.time, speaker: l.speaker, text: l.text })),
    );
    await db.results.bulkAdd(
      call.results.map((r) => ({
        callId: call.id,
        check_id: r.check_id,
        verdict: r.verdict,
        severity: r.severity,
        speaker: r.speaker,
        timestamp: r.timestamp,
        evidence: r.evidence,
        reason: r.reason,
      })),
    );
  });
}

export async function loadAICalls(): Promise<DemoCall[]> {
  const recs = await db.calls.where("source").equals("ai").sortBy("createdAt");
  recs.reverse();
  const calls: DemoCall[] = [];
  for (const rec of recs) {
    const lines = await db.transcripts.where("callId").equals(rec.id).sortBy("id");
    const rows = await db.results.where("callId").equals(rec.id).sortBy("id");
    calls.push({
      id: rec.id,
      agent: rec.agent,
      duration: rec.duration,
      scorecard: rec.scorecard,
      lines: lines.map((l) => ({ time: l.time, speaker: l.speaker, text: l.text })),
      results: rows.map((r) => ({
        check_id: r.check_id,
        verdict: r.verdict as "pass" | "fail" | "not_applicable",
        severity: r.severity as "critical" | "normal",
        speaker: r.speaker as "agent" | "customer" | undefined,
        timestamp: r.timestamp,
        evidence: r.evidence,
        reason: r.reason,
      })),
    });
  }
  return calls;
}

// Analyst confirm/dismiss: upserts the override and rewrites the stored verdict.
export async function setOverride(callId: string, checkId: string, verdict: "pass" | "fail"): Promise<void> {
  await db.transaction("rw", db.results, db.overrides, async () => {
    await db.overrides.where("[callId+check_id]").equals([callId, checkId]).delete();
    await db.overrides.add({ callId, check_id: checkId, verdict, decidedAt: Date.now() });
    const row = await db.results.where("[callId+check_id]").equals([callId, checkId]).first();
    if (row?.id !== undefined) await db.results.update(row.id, { verdict });
  });
}

export async function getScorecard(): Promise<Check[]> {
  const row = await db.scorecards.get(SCORECARD_ID);
  return row?.checks ?? BANK_SUPPORT_V2;
}

export async function saveScorecard(checks: Check[]): Promise<void> {
  await db.scorecards.put({ id: SCORECARD_ID, name: "Bank Support v2", checks, updatedAt: Date.now() });
}

export async function saveCoaching(callId: string, note: string): Promise<void> {
  await db.calls.update(callId, { coaching: note });
}

export async function getCoaching(callId: string): Promise<string> {
  return (await db.calls.get(callId))?.coaching ?? "";
}
