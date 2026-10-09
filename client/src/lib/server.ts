// Client for the upload server (../server): the part of Linya that receives recordings
// sent from agents' phones. The app works without it; these calls just fail and the
// phone features say the server is not running.

export interface Agent {
  id: string;
  name: string;
  device: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
  lastUploadAt: string | null;
}

export type RecordingStatus = "uploaded" | "processing" | "scored" | "failed";

export interface Recording {
  id: string;
  name: string;
  size: number;
  agentId: string;
  agent: string;
  device: string;
  uploadedAt: string;
  status: RecordingStatus;
  callId?: string;
  score?: number;
  callStatus?: "green" | "amber" | "red";
  error?: string;
}

export interface ServerInfo {
  lanUrls: string[];
  publicUrl: string;
  maxMb: number;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  // With the server stopped, the dev server answers /api with an error page, not JSON.
  if (!res.headers.get("content-type")?.includes("json")) throw new Error("The upload server is not running.");
  const data = (await res.json()) as T & { ok?: boolean; message?: string };
  if (!res.ok || data.ok === false) throw new Error(data.message ?? `Upload server error ${res.status}`);
  return data;
}

export const getInfo = () => call<ServerInfo>("/info");
export const setPublicUrl = (publicUrl: string) => call<{ publicUrl: string }>("/info", { publicUrl });
export const listAgents = async () => (await call<{ agents: Agent[] }>("/agents")).agents;
export const addAgent = async (name: string, device: string) => (await call<{ agent: Agent }>("/agents", { name, device })).agent;
export const revokeAgent = (id: string) => call(`/agents/${id}/revoke`, {});
export const listRecordings = async () => (await call<{ recordings: Recording[] }>("/recordings")).recordings;
/** Takes the oldest waiting recording off the queue, or null if there is none or one is already being scored. */
export const takeNextRecording = async () => (await call<{ recording: Recording | null }>("/recordings/next", {})).recording;
export const setRecordingStatus = (id: string, update: { status: RecordingStatus; callId?: string; score?: number; callStatus?: string; error?: string }) =>
  call(`/recordings/${id}/status`, update);

export async function fetchRecordingAudio(recording: Recording): Promise<File> {
  const res = await fetch(`/api/recordings/${recording.id}/audio`);
  if (!res.ok) throw new Error("Could not load the recording from the upload server.");
  return new File([await res.blob()], recording.name, { type: res.headers.get("content-type") ?? "audio/mp4" });
}

/** What an agent pastes into the "Send to Linya" shortcut: where to send, and who they are. */
export const uploadLink = (base: string, agent: Agent) => `${base}/api/uploads?token=${agent.token}`;
