// Persistence service over the Dexie `qa-sentinel` database.
// Demo calls stay in-memory (mock.ts); everything the analyst produces —
// AI-processed calls, verdict overrides, edited scorecards, coaching notes —
// is stored here and reloaded on startup.
import { db } from "./db";
import { BANK_SUPPORT_V2, type Check } from "./scorecard";
import type { DemoCall } from "../mock";

export const SCORECARD_ID = "bank-support-v2";

// `recording` is the uploaded file. It is stored in this browser only, never sent anywhere.
export async function saveAICall(call: DemoCall, recording?: Blob): Promise<void> {
  await db.transaction("rw", db.calls, db.transcripts, db.results, db.audio, async () => {
    if (recording) await db.audio.put({ callId: call.id, blob: recording });
    await db.transcripts.where("callId").equals(call.id).delete();
    await db.results.where("callId").equals(call.id).delete();
    await db.calls.put({
      id: call.id,
      agent: call.agent,
      duration: call.duration,
      scorecard: call.scorecard,
      fileName: call.name,
      speakers: call.speakers,
      languages: call.languages,
      engine: call.engine,
      redactions: call.redactions,
      source: "ai",
      createdAt: Date.now(),
    });
    await db.transcripts.bulkAdd(
      call.lines.map((l) => ({ callId: call.id, time: l.time, speaker: l.speaker, text: l.text, words: l.words })),
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
    const recording = await db.audio.get(rec.id);
    calls.push({
      id: rec.id,
      agent: rec.agent,
      duration: rec.duration,
      scorecard: rec.scorecard,
      name: rec.fileName,
      speakers: rec.speakers,
      languages: rec.languages,
      engine: rec.engine,
      redactions: rec.redactions,
      audio: recording ? URL.createObjectURL(recording.blob) : undefined,
      lines: lines.map((l) => ({ time: l.time, speaker: l.speaker, text: l.text, words: l.words })),
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

// Removes an uploaded call and everything stored with it, including the recording.
export async function deleteAICall(callId: string): Promise<void> {
  await db.transaction("rw", [db.calls, db.transcripts, db.results, db.overrides, db.audio], async () => {
    await db.calls.delete(callId);
    await db.transcripts.where("callId").equals(callId).delete();
    await db.results.where("callId").equals(callId).delete();
    await db.overrides.where("callId").equals(callId).delete();
    await db.audio.delete(callId);
  });
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

// Latest analyst decision per check, keyed "callId:checkId".
export async function loadOverrides(): Promise<Record<string, "pass" | "fail">> {
  const rows = await db.overrides.orderBy("id").toArray();
  return Object.fromEntries(rows.map((r) => [`${r.callId}:${r.check_id}`, r.verdict as "pass" | "fail"]));
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
