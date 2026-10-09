// Where Linewise keeps what the analyst produces: scored calls and their recordings, Confirm
// and Dismiss decisions, the scorecard, coaching notes.
//
// With the server running (`npm run server`) all of it lives in one SQLite database on
// this laptop, server/data/linewise.db, with the audio as files beside it. The calls are then
// the same in any browser and survive clearing one.
//
// Without the server, the app falls back to storage inside this browser (store.local.ts),
// which is how it worked before. The first time the server is found, calls already in the
// browser are copied into the database; the browser's copy is left in place.
import type { DemoCall } from "../mock";
import * as local from "./store.local";
import type { Check } from "./scorecard";

export { FIRST_CALL_NUMBER, SCORECARD_ID } from "./store.local";

// Kept under its first name so calls already copied are not copied a second time.
const MOVED_FLAG = "linya-calls-moved-to-sqlite";

let found: Promise<boolean> | null = null;
/** Is the SQLite server there? A "no" is asked again next time; a "yes" is kept. */
function onServer(): Promise<boolean> {
  found ??= fetch("/api/info", { signal: AbortSignal.timeout(2500) })
    .then(async (r) => r.ok && !!r.headers.get("content-type")?.includes("json") && ((await r.json()) as { storage?: string }).storage === "sqlite")
    .catch(() => false)
    .then((yes) => {
      if (!yes) found = null;
      return yes;
    });
  return found;
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { ok?: boolean; message?: string };
  if (!res.ok || data.ok === false) throw new Error(data.message ?? `Could not reach Linewise's database (${res.status}).`);
  return data;
}

type StoredCall = Omit<DemoCall, "audio"> & { hasAudio?: boolean; coaching?: string };
const notes = new Map<string, string>();

async function putCall(call: DemoCall, extra: { uploadId?: string; createdAt?: string } = {}): Promise<void> {
  // The address of a recording only means something in this tab, so it is not stored.
  const { audio: _audio, ...rest } = call;
  await api(`/calls/${encodeURIComponent(call.id)}`, "PUT", { ...rest, ...extra });
}

async function putAudio(callId: string, recording: Blob, name?: string): Promise<void> {
  const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/audio`, {
    method: "POST",
    headers: { "Content-Type": recording.type || "application/octet-stream", "x-file-name": encodeURIComponent(name ?? "recording.m4a") },
    body: recording,
  });
  if (!res.ok) throw new Error("The call was saved, but its recording could not be stored.");
}

// Copies calls that are only in this browser into the database, once.
async function moveBrowserCalls(): Promise<void> {
  if (localStorage.getItem(MOVED_FLAG)) return;
  const [mine, theirs, decisions] = await Promise.all([local.loadAICalls(), api<{ calls: StoredCall[] }>("/calls"), local.loadOverrides()]);
  const already = new Set(theirs.calls.map((c) => c.id));
  const started = Date.now() - mine.length * 1000;
  // Oldest first, a second apart, so they keep their order in the database.
  for (const [i, call] of [...mine].reverse().entries()) {
    if (already.has(call.id)) continue;
    await putCall(call, { createdAt: new Date(started + i * 1000).toISOString() });
    if (call.audio) await putAudio(call.id, await (await fetch(call.audio)).blob(), call.name).catch(() => {});
    const note = await local.getCoaching(call.id).catch(() => "");
    if (note) await api(`/calls/${encodeURIComponent(call.id)}/coaching`, "PUT", { note });
  }
  for (const [key, verdict] of Object.entries(decisions)) {
    const at = key.indexOf(":");
    if (mine.some((c) => c.id === key.slice(0, at))) await api(`/calls/${encodeURIComponent(key.slice(0, at))}/decision`, "POST", { checkId: key.slice(at + 1), verdict });
  }
  const saved = await api<{ checks: Check[] | null }>(`/scorecards/${local.SCORECARD_ID}`);
  if (!saved.checks) await api(`/scorecards/${local.SCORECARD_ID}`, "PUT", { name: "Bank Support v2", checks: await local.getScorecard() });
  localStorage.setItem(MOVED_FLAG, new Date().toISOString());
}

/** `uploadId` says the recording is one a phone sent, which the server already has on disk. */
export async function saveAICall(call: DemoCall, recording?: Blob, uploadId?: string): Promise<void> {
  if (!(await onServer())) return local.saveAICall(call, recording);
  await putCall(call, { uploadId });
  if (recording && !uploadId) await putAudio(call.id, recording, call.name);
}

export async function loadAICalls(): Promise<DemoCall[]> {
  if (!(await onServer())) return local.loadAICalls();
  await moveBrowserCalls().catch(() => {});
  const { calls } = await api<{ calls: StoredCall[] }>("/calls");
  return calls.map(({ hasAudio, coaching, ...call }) => {
    if (coaching) notes.set(call.id, coaching);
    return { ...call, audio: hasAudio ? `/api/calls/${encodeURIComponent(call.id)}/audio` : undefined };
  });
}

/** Removes a call and everything stored with it. A recording dragged into the app goes too. */
export async function deleteAICall(callId: string): Promise<void> {
  if (!(await onServer())) return local.deleteAICall(callId);
  await api(`/calls/${encodeURIComponent(callId)}`, "DELETE");
  notes.delete(callId);
}

export async function setOverride(callId: string, checkId: string, verdict: "pass" | "fail"): Promise<void> {
  if (!(await onServer())) return local.setOverride(callId, checkId, verdict);
  await api(`/calls/${encodeURIComponent(callId)}/decision`, "POST", { checkId, verdict });
}

export async function loadOverrides(): Promise<Record<string, "pass" | "fail">> {
  if (!(await onServer())) return local.loadOverrides();
  return (await api<{ decisions: Record<string, "pass" | "fail"> }>("/decisions")).decisions;
}

export async function getScorecard(): Promise<Check[]> {
  if (!(await onServer())) return local.getScorecard();
  return (await api<{ checks: Check[] | null }>(`/scorecards/${local.SCORECARD_ID}`)).checks ?? local.getScorecard();
}

export async function saveScorecard(checks: Check[]): Promise<void> {
  if (!(await onServer())) return local.saveScorecard(checks);
  await api(`/scorecards/${local.SCORECARD_ID}`, "PUT", { name: "Bank Support v2", checks });
}

export async function saveCoaching(callId: string, note: string): Promise<void> {
  if (!(await onServer())) return local.saveCoaching(callId, note);
  notes.set(callId, note);
  await api(`/calls/${encodeURIComponent(callId)}/coaching`, "PUT", { note });
}

export async function getCoaching(callId: string): Promise<string> {
  if (!(await onServer())) return local.getCoaching(callId);
  return notes.get(callId) ?? "";
}
