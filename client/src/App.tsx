import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckIcon, MinusIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AudioPlayer } from "@/components/audio-player";
import { Logo } from "@/components/logo";
import { Transcript } from "@/components/transcript";
import { Devices } from "@/components/devices";
import { PhoneUploads } from "@/components/phone-uploads";
import { fetchRecordingAudio, getInfo, listAgents, listRecordings, setRecordingStatus, takeNextRecording, type Agent, type Recording, type ServerInfo } from "@/lib/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_CALLS, type DemoCall } from "./mock";
import { isAIEnabled, runLocalPipeline, setAIEnabled, type PipelineProgress } from "./ai/pipeline";
import { getBackend } from "./ai/backend";
import { generateCoachingNote } from "./ai/coaching";
import { BANK_SUPPORT_V2, STATUS_LABEL, scoreCall, type CallStatus, type Check } from "./lib/scorecard";
import { redactPII } from "./lib/pii";
import { deleteAICall, getCoaching, getScorecard, loadAICalls, loadOverrides, saveAICall, saveCoaching, saveScorecard, setOverride } from "./lib/store";
import { downloadCSV, exportPDF } from "./lib/export";
import { agentStats } from "./lib/agents";

type Tab = "calls" | "detail" | "scorecards" | "agents" | "export";

interface QueueItem {
  id: number;
  name: string;
  status: string;
  url: string;
  file: File;
}

let queueSeq = 0;

function toSeconds(ts: string): number {
  const [m, s] = ts.split(":").map(Number);
  return m * 60 + s;
}

// Stands in when there is no call to show, so the detail screen can render its empty state.
const NO_CALL: DemoCall = { id: "", agent: "", duration: "0:00", scorecard: "", lines: [], results: [] };

// How far through the pipeline a queue row is, from its status text ("scoring: … 3/7 empathy").
function queueProgress(status: string): number | null {
  if (status.startsWith("decoding")) return 0.05;
  if (status.startsWith("transcribing")) return 0.2;
  if (status.startsWith("redacting")) return 0.45;
  const step = status.match(/^scoring.*?(\d+)\/(\d+)/);
  if (step) return 0.5 + (0.5 * (Number(step[1]) - 1)) / Number(step[2]);
  return null;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
// "tl" → "Filipino". An unknown code is shown as it is.
function languageLabel(codes: string[]): string {
  return codes.map((code) => { try { return languageNames.of(code) ?? code; } catch { return code; } }).join(" + ");
}

const callName = (c: DemoCall) => c.name ?? `Call #${c.id}`;


// Call status is shown in its own colour (green, amber, red) and always with the word,
// so it does not rely on colour alone.
const STATUS_TEXT: Record<CallStatus, string> = { red: "text-destructive", amber: "text-status-amber", green: "text-status-green" };

function StatusBadge({ status, children }: { status: CallStatus; children: ReactNode }) {
  const variant = status === "red" ? "destructive" : status;
  return <Badge variant={variant}>{children}</Badge>;
}

const VERDICTS = {
  pass: { label: "Pass", icon: CheckIcon, className: "text-foreground" },
  fail: { label: "Fail", icon: XIcon, className: "text-destructive" },
  critical: { label: "Critical", icon: XIcon, className: "text-destructive" },
  na: { label: "N/A", icon: MinusIcon, className: "text-muted-foreground" },
};

const SECTION = "grid gap-x-10 gap-y-8 lg:grid-cols-12";
const PANEL = "animate-hang pt-12 pb-32 sm:pt-20";
const HEADING = "display text-3xl sm:text-4xl";

export default function App() {
  const [tab, setTab] = useState<Tab>("detail");
  const [selectedId, setSelectedId] = useState("147");
  const [checks, setChecks] = useState<Check[]>(BANK_SUPPORT_V2);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [aiOn, setAiOn] = useState(isAIEnabled());
  const [aiChecking, setAiChecking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiCalls, setAiCalls] = useState<DemoCall[]>([]);
  const [coaching, setCoaching] = useState<Record<string, string>>({});
  const [coachingBusy, setCoachingBusy] = useState(false);
  // Analyst decisions per check, keyed "callId:checkId". Demo-call decisions last for the session.
  // The scorecard being edited. Null means the saved scorecard is shown read-only.
  const [draft, setDraft] = useState<Check[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "pass" | "fail">>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const [phones, setPhones] = useState<{ online: boolean; info: ServerInfo | null; agents: Agent[]; recordings: Recording[] }>({ online: false, info: null, agents: [], recordings: [] });
  const [phoneStage, setPhoneStage] = useState("");
  const scoringPhone = useRef(false);
  const scoringPhoneId = useRef<string | null>(null);
  // The scorecard as it is now, for work that outlives one render (the phone queue).
  const checksRef = useRef(checks);
  useEffect(() => { checksRef.current = checks; }, [checks]);

  useEffect(() => {
    void loadAICalls().then(setAiCalls).catch(() => {});
    void getScorecard().then(setChecks).catch(() => {});
    void loadOverrides().then((saved) => setDecisions((d) => ({ ...saved, ...d }))).catch(() => {});
  }, []);

  // Keep an eye on the upload server, and while Local AI is on, work through its queue.
  useEffect(() => {
    const tick = () => {
      void refreshPhones();
      // While a recording is being scored, keep telling the server so. If this tab is
      // closed or reloaded mid-way, the server notices the silence and queues it again.
      if (scoringPhoneId.current) void setRecordingStatus(scoringPhoneId.current, { status: "processing" }).catch(() => {});
      if (aiOn) void scoreNextFromPhones();
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
    // refreshPhones and scoreNextFromPhones read their state through refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOn]);

  const calls: DemoCall[] = useMemo(
    () => [
      ...aiCalls,
      // The scripted sample calls are for demo mode only: with Local AI on, the app
      // shows just the calls that were really transcribed and scored.
      ...(aiOn ? [] : DEMO_CALLS).map((c) => ({
        ...c,
        results: c.results.map((r) => {
          const decided = decisions[`${c.id}:${r.check_id}`];
          return decided ? { ...r, verdict: decided } : r;
        }),
      })),
    ],
    [aiCalls, decisions, aiOn],
  );
  const selected = calls.find((c) => c.id === selectedId) ?? calls[0] ?? NO_CALL;
  const { score, status } = scoreCall(checks, selected.results);

  const visible = calls.filter((c) => {
    if (!flaggedOnly) return true;
    return scoreCall(checks, c.results).status === "red";
  });

  function onFiles(files: FileList | null) {
    if (!files) return;
    const items: QueueItem[] = [...files].map((f) => ({
      id: ++queueSeq,
      name: f.name,
      status: "ready",
      url: URL.createObjectURL(f),
      file: f,
    }));
    setQueue((q) => [...items, ...q]);
  }

  async function toggleAI(on: boolean) {
    setAiError("");
    if (!on) {
      setAiOn(false);
      setAIEnabled(false);
      return;
    }
    setAiChecking(true);
    const backend = getBackend();
    const ok = await backend.check();
    setAiChecking(false);
    if (!ok) {
      setAiError(`${backend.label} not reachable — start the backend first (Ollama: \`ollama serve\`).`);
      return;
    }
    setAiOn(true);
    setAIEnabled(true);
  }

  function patchQueue(id: number, status: string) {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  // Transcribes, redacts and scores one recording and stores the result as a call.
  async function scoreRecording(file: File, about: { name: string; agent: string; audio: string }, onStage: (p: PipelineProgress) => void): Promise<DemoCall> {
    // A check that has no wording yet cannot be judged, so it is not sent to the model.
    const out = await runLocalPipeline(file, checksRef.current.filter((c) => c.label.trim()), onStage);
    const call: DemoCall = {
      // Unique across reloads, so a new upload never overwrites a stored call.
      id: `ai-${Date.now().toString(36)}${++queueSeq}`,
      name: about.name,
      audio: about.audio,
      speakers: out.speakers,
      languages: out.languages,
      engine: out.engine,
      redactions: out.redactions,
      agent: about.agent,
      duration: out.duration,
      scorecard: "Bank Support v2",
      lines: out.lines,
      results: out.results,
    };
    await saveAICall(call, file);
    setAiCalls((cs) => [call, ...cs.filter((c) => c.id !== call.id)]);
    return call;
  }

  async function runAI(item: QueueItem) {
    setAiError("");
    const onStage = (p: PipelineProgress) => patchQueue(item.id, `${p.stage}: ${p.detail}`);
    try {
      onStage({ stage: "decoding", detail: "starting" });
      const call = await scoreRecording(item.file, { name: item.name, agent: "Uploaded call", audio: item.url }, onStage);
      patchQueue(item.id, "done — open in Calls list below");
      setSelectedId(call.id);
    } catch (e) {
      patchQueue(item.id, "ready");
      setAiError(e instanceof Error ? e.message : String(e));
    }
  }

  // ---- recordings sent from phones (the upload server, ../server) ----
  async function refreshPhones() {
    try {
      const [info, agents, recordings] = await Promise.all([getInfo(), listAgents(), listRecordings()]);
      setPhones({ online: true, info, agents, recordings });
    } catch {
      setPhones((p) => (p.online ? { ...p, online: false } : p));
    }
  }

  // The queue: one recording at a time, oldest first, however many phones are sending.
  async function scoreNextFromPhones() {
    if (scoringPhone.current) return;
    scoringPhone.current = true;
    let taken: Recording | null = null;
    try {
      taken = await takeNextRecording();
      if (!taken) return;
      scoringPhoneId.current = taken.id;
      void refreshPhones();
      const file = await fetchRecordingAudio(taken);
      const call = await scoreRecording(file, { name: taken.name, agent: taken.agent, audio: URL.createObjectURL(file) }, (p) => setPhoneStage(`${p.stage}: ${p.detail}`));
      const { score, status } = scoreCall(checksRef.current, call.results);
      await setRecordingStatus(taken.id, { status: "scored", callId: call.id, score, callStatus: status });
    } catch (e) {
      if (taken) await setRecordingStatus(taken.id, { status: "failed", error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    } finally {
      scoringPhone.current = false;
      scoringPhoneId.current = null;
      setPhoneStage("");
      void refreshPhones();
    }
  }

  async function removeCall(callId: string) {
    setPendingDelete(null);
    try {
      await deleteAICall(callId);
      const gone = aiCalls.find((c) => c.id === callId);
      if (gone?.audio) URL.revokeObjectURL(gone.audio);
      setAiCalls((cs) => cs.filter((c) => c.id !== callId));
      setDecisions((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith(`${callId}:`))));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAll() {
    for (const item of queue.filter((q) => q.status === "ready").reverse()) await runAI(item);
  }

  async function overrideVerdict(callId: string, checkId: string, verdict: "pass" | "fail") {
    setDecisions((d) => ({ ...d, [`${callId}:${checkId}`]: verdict }));
    setAiCalls((cs) =>
      cs.map((c) =>
        c.id === callId
          ? { ...c, results: c.results.map((r) => (r.check_id === checkId ? { ...r, verdict } : r)) }
          : c,
      ),
    );
    if (callId.startsWith("ai-")) {
      await setOverride(callId, checkId, verdict).catch((e: unknown) =>
        setAiError(e instanceof Error ? e.message : String(e)),
      );
    }
  }

  async function makeCoachingNote() {
    if (!aiOn) {
      setAiError("Flip Local AI on first — coaching notes come from the local model.");
      return;
    }
    setCoachingBusy(true);
    try {
      const labelOf = (id: string) => checks.find((c) => c.id === id)?.label ?? id;
      const failures = selected.results
        .filter((r) => r.verdict === "fail")
        .map((r) => ({
          label: labelOf(r.check_id),
          kind: checks.find((c) => c.id === r.check_id)?.kind,
          evidence: redactPII(r.evidence ?? "", selected.redactions),
          timestamp: r.timestamp,
        }));
      const strengths = selected.results
        .filter((r) => r.verdict === "pass")
        .map((r) => labelOf(r.check_id));
      const note = redactPII(await generateCoachingNote(selected.agent, failures, strengths), selected.redactions);
      setCoaching((m) => ({ ...m, [selected.id]: note }));
      if (selected.id.startsWith("ai-")) await saveCoaching(selected.id, note);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setCoachingBusy(false);
    }
  }

  async function openCall(callId: string) {
    setSelectedId(callId);
    setTab("detail");
    if (!coaching[callId] && callId.startsWith("ai-")) {
      const saved = await getCoaching(callId).catch(() => "");
      if (saved) setCoaching((m) => ({ ...m, [callId]: saved }));
    }
  }

  // Play the selected call's recording from an exact second.
  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !selected.audio) return;
    if (audio.src !== new URL(selected.audio, location.href).href) audio.src = selected.audio;
    audio.currentTime = seconds;
    void audio.play().catch(() => {});
  }

  function seek(ts: string, url?: string) {
    if (url && audioRef.current) {
      if (audioRef.current.src !== new URL(url, location.href).href) audioRef.current.src = url;
      audioRef.current.currentTime = toSeconds(ts);
      void audioRef.current.play().catch(() => {});
    }
  }

  function exportCSV(call: DemoCall) {
    downloadCSV(call);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "calls", label: "Calls" },
    { id: "detail", label: "Call detail" },
    { id: "scorecards", label: "Scorecards" },
    { id: "agents", label: "Agents" },
    { id: "export", label: "Export" },
  ];

  // A demo call plays its sample recording; an analysed upload plays the file it came from.
  const audioUrl = selected.audio;
  const isUpload = selected.id.startsWith("ai-");
  const busy = queue.some((q) => queueProgress(q.status) !== null);
  const readyCount = queue.filter((q) => q.status === "ready").length;
  const save = (next: Check[]) => { setChecks(next); void saveScorecard(next).catch(() => {}); };
  const stats = agentStats(calls, checks);

  const flagMarkers = selected.results
    .filter((r) => r.verdict === "fail" && r.timestamp)
    .map((r) => ({
      ts: r.timestamp!,
      seconds: toSeconds(r.timestamp!),
      label: checks.find((c) => c.id === r.check_id)?.label ?? r.check_id,
    }));

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const draftTotal = (draft ?? []).reduce((a, c) => a + c.weight, 0);
  // Why the draft cannot be saved yet, if anything.
  const draftProblem = !draft
    ? ""
    : draft.length === 0
      ? "Add at least one check."
      : draft.some((c) => !c.label.trim())
        ? "Every check needs wording. Fill it in or remove the empty check."
        : draftTotal !== 100
          ? `Weights add up to ${draftTotal}. They must total 100.`
          : "";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-x-10 px-5 sm:px-8 md:h-16 md:flex-row md:items-center md:justify-between">
          <div className="flex h-14 min-w-0 items-center gap-4">
            <Logo className="shrink-0" />
            <span className="label flex min-w-0 items-center gap-2 text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground" />
              <span className="truncate">{aiOn ? "Local AI on (Whisper + Ollama 3B)" : "Local AI off — sample calls"}</span>
            </span>
            <label className="label flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                data-testid="ai-toggle"
                checked={aiOn}
                disabled={aiChecking}
                onChange={(e) => void toggleAI(e.target.checked)}
                className="size-4 cursor-pointer appearance-none border border-foreground transition-colors duration-200 checked:border-primary checked:bg-primary disabled:opacity-50"
              />
              Local AI{aiChecking ? "…" : ""}
            </label>
          </div>
          <nav className="-mx-5 shrink-0 overflow-x-auto px-5 sm:-mx-8 sm:px-8 md:mx-0 md:px-0">
            <TabsList className="w-max min-w-full">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <TabsContent value="calls" className={cn(PANEL, "flex flex-col gap-24")}>
          <section className={SECTION}>
            <h2 className={cn(HEADING, "lg:col-span-5")}>1 · Upload &amp; queue</h2>
            <div className="flex flex-col gap-6 lg:col-span-7">
              <label className="relative flex min-h-48 cursor-pointer items-center justify-center border border-dashed border-muted-foreground p-8 text-center transition-colors duration-200 hover:border-foreground has-focus-visible:border-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
                <span className="max-w-[38ch] font-medium">Drop MP3 / WAV / M4A here or click to browse (batch)</span>
                <input type="file" data-testid="upload" accept="audio/*,.mp3,.wav,.m4a" multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => onFiles(e.target.files)} />
              </label>
              {aiError && <p role="alert" className="border border-destructive px-4 py-3 text-sm text-destructive">{aiError}</p>}
              {aiOn && readyCount > 1 && (
                <Button className="self-start" disabled={busy} onClick={() => void runAll()}>Transcribe &amp; score all ({readyCount})</Button>
              )}
              {queue.length > 0 && (
                <ul className="border-b border-border">
                  {queue.map((q) => {
                    const progress = queueProgress(q.status);
                    return (
                      <li key={q.id} className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-3 text-sm">
                        <span className="min-w-0 font-medium break-words">{q.name}</span>
                        <span className="flex items-center gap-3">
                          {progress !== null && <Spinner className="text-primary" aria-label="Working" />}
                          <span data-testid={`queue-status-${q.id}`} className={cn(progress !== null ? "text-foreground" : "text-muted-foreground")}>{q.status}</span>
                          {aiOn && q.status === "ready" && (
                            <Button size="sm" variant={readyCount > 1 ? "outline" : "default"} disabled={busy} data-testid={`transcribe-${q.id}`} onClick={() => void runAI(q)}>
                              Transcribe &amp; score
                            </Button>
                          )}
                        </span>
                        {progress !== null && (
                          <span
                            role="progressbar"
                            aria-label={`Processing ${q.name}`}
                            aria-valuenow={Math.round(progress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="absolute inset-x-0 -bottom-px h-px origin-left bg-primary transition-transform duration-700 ease-out"
                            style={{ transform: `scaleX(${progress})` }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {phones.online && (phones.agents.length > 0 || phones.recordings.length > 0) && (
            <section className={SECTION}>
              <div className="flex flex-col gap-5 lg:col-span-5">
                <h2 className={HEADING}>Sent from phones</h2>
                <p className="max-w-[48ch] text-muted-foreground">Recordings agents send with the “Send to Linya” shortcut. They are scored one at a time while Local AI is on.</p>
              </div>
              <div className="lg:col-span-7">
                <PhoneUploads
                  recordings={phones.recordings}
                  agents={phones.agents}
                  stage={phoneStage}
                  aiOn={aiOn}
                  onOpen={(callId) => void openCall(callId)}
                  onRetry={(r) => void setRecordingStatus(r.id, { status: "uploaded" }).then(refreshPhones)}
                />
              </div>
            </section>
          )}

          <section className={SECTION}>
            <div className="flex flex-col gap-6 lg:col-span-5">
              <h2 className={HEADING}>2 · Calls list</h2>
              <Field orientation="horizontal">
                <Checkbox id="flagged-only" checked={flaggedOnly} onCheckedChange={(v) => setFlaggedOnly(v)} />
                <FieldLabel htmlFor="flagged-only">Failed calls only</FieldLabel>
              </Field>
            </div>
            <div className="lg:col-span-7">
              {visible.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{calls.length === 0 ? "No calls yet" : "No failed calls"}</EmptyTitle>
                    <EmptyDescription>
                      {calls.length === 0
                        ? "Upload a recording above and press Transcribe & score. Untick Local AI to see the sample calls."
                        : "Nothing here scored below 70 or failed a critical check. Clear the filter to see every call."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="border-b border-border">
                  {visible.map((c) => {
                    const s = scoreCall(checks, c.results);
                    const flags = c.results.filter((r) => r.verdict === "fail").length;
                    return (
                      <li key={c.id} className="flex items-center gap-2 border-t border-border">
                        <button
                          data-testid={`call-${c.id}`}
                          onClick={() => void openCall(c.id)}
                          className="group flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 text-left"
                        >
                          <span className="flex items-start gap-3">
                            <span
                              aria-hidden
                              className={cn(
                                "mt-2.5 size-2 shrink-0 rounded-full border border-foreground transition-colors duration-200 group-hover:border-primary group-hover:bg-primary",
                                c.id === selectedId && "border-primary bg-primary",
                              )}
                            />
                            <span className="flex flex-col gap-1">
                              <span className="text-xl font-medium tracking-tight break-all">{callName(c)}</span>
                              <span className="label text-muted-foreground">Agent: {c.agent} · {c.duration} · {c.scorecard}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-4 max-sm:pl-5">
                            <span className="label text-muted-foreground tabular-nums">{flags} flags</span>
                            <StatusBadge status={s.status}>{s.score} / 100 · {STATUS_LABEL[s.status]}</StatusBadge>
                          </span>
                        </button>
                        {c.id.startsWith("ai-") &&
                          (pendingDelete === c.id ? (
                            <span className="flex shrink-0 items-center gap-1">
                              <Button size="xs" variant="destructive" onClick={() => void removeCall(c.id)}>Delete</Button>
                              <Button size="xs" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
                            </span>
                          ) : (
                            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${callName(c)}`} onClick={() => setPendingDelete(c.id)}>
                              <Trash2Icon />
                            </Button>
                          ))}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="detail" className={PANEL}>
          {calls.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No calls yet</EmptyTitle>
                <EmptyDescription>Upload a recording on the Calls tab and press Transcribe &amp; score. Untick Local AI to see the sample calls.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
          <>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div className="flex flex-col gap-3">
              <h2 className={cn("display break-words", isUpload ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl")}>{callName(selected)}</h2>
              <p className="text-muted-foreground">Agent: {selected.agent} · {selected.duration} · {selected.scorecard}{selected.languages?.length ? ` · ${languageLabel(selected.languages)}` : ""}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="display text-4xl tabular-nums sm:text-5xl">
                <span className={STATUS_TEXT[status]}>{score}</span>
                <span className="text-muted-foreground"> / 100</span>
              </p>
              <StatusBadge status={status}>{STATUS_LABEL[status]}</StatusBadge>
            </div>
          </div>
          <div className="mt-10">
            <AudioPlayer
              audioRef={audioRef}
              src={audioUrl}
              fallbackDuration={toSeconds(selected.duration)}
              markers={flagMarkers}
              onMarkerClick={(m) => seek(m.ts, audioUrl)}
            />
          </div>
          <p className="label mt-3 text-muted-foreground">{isUpload ? `Transcribed${selected.engine ? ` with ${selected.engine}` : ""} and scored on this machine. The recording is stored in this browser only.` : "Sample recording with computer-generated voices; the transcript and scores are scripted."}{" "}
            {selected.speakers === "voice" && "Mono recording: the two voices were told apart by sound, and which one is the agent was worked out from what they said, so check the speaker labels. "}
            {selected.speakers === "unknown" && "The speakers could not be told apart, so the checks are less reliable. "} Click any timestamp or flag tick to play from there.</p>
          <div className="mt-16 grid gap-x-10 gap-y-16 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h3 className="mb-5 text-xl font-medium tracking-tight">Transcript</h3>
              <Transcript
                lines={selected.lines}
                duration={toSeconds(selected.duration)}
                redactions={selected.redactions}
                audioRef={audioRef}
                onSeek={seekTo}
              />
            </div>
            <div className="lg:col-span-5">
              <h3 className="mb-5 text-xl font-medium tracking-tight">Scorecard</h3>
              <ul className="border-b border-border">
                {checks.map((c) => {
                  const r = selected.results.find((x) => x.check_id === c.id);
                  const decided = decisions[`${selected.id}:${c.id}`];
                  const verdict = VERDICTS[!r || r.verdict === "not_applicable" ? "na" : r.verdict === "pass" ? "pass" : c.critical ? "critical" : "fail"];
                  return (
                    <li key={c.id} className="flex flex-col gap-2 border-t border-border py-3 text-sm leading-relaxed">
                      <div className="flex items-start gap-3">
                        <span className={cn("flex w-20 shrink-0 items-center gap-1.5 font-medium", verdict.className)}>
                          <verdict.icon aria-hidden className="size-3.5" />
                          {verdict.label}
                        </span>
                        <span className="flex-1">{c.label} <span className="text-muted-foreground tabular-nums">({c.weight})</span></span>
                        {r?.timestamp && <span className="text-muted-foreground">{r.timestamp}</span>}
                      </div>
                      {r && r.verdict !== "pass" && (r.evidence || r.reason) && (
                        <p className="label pl-23 text-muted-foreground">
                          {r.evidence && <span className="text-foreground">“{redactPII(r.evidence, selected.redactions)}” </span>}
                          {r.reason}
                        </p>
                      )}
                      {decided ? (
                        <p className="label pl-23 text-muted-foreground">Analyst {decided === "fail" ? "confirmed this flag" : "dismissed this flag"}</p>
                      ) : r && r.verdict === "fail" && (
                        <div className="flex items-center gap-2 pl-23">
                          <span className="label text-muted-foreground">Analyst:</span>
                          <Button size="xs" variant="secondary" onClick={() => void overrideVerdict(selected.id, c.id, "fail")}>Confirm</Button>
                          <Button size="xs" variant="outline" onClick={() => void overrideVerdict(selected.id, c.id, "pass")}>Dismiss</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8 flex flex-wrap gap-2">
                <Button onClick={() => exportCSV(selected)}>Export CSV</Button>
                <Button variant="outline" onClick={() => exportPDF(selected, checks)}>Export PDF</Button>
                {isUpload &&
                  (pendingDelete === selected.id ? (
                    <>
                      <Button variant="destructive" onClick={() => { void removeCall(selected.id); setTab("calls"); }}>Delete this call and its recording</Button>
                      <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setPendingDelete(selected.id)}>Delete call</Button>
                  ))}
              </div>
              <div className="mt-12 flex flex-col items-start gap-4">
                <h3 className="text-xl font-medium tracking-tight">Coaching note</h3>
                {coaching[selected.id] ? (
                  <p className="max-w-[48ch]">“{coaching[selected.id]}”</p>
                ) : (
                  <p className="text-muted-foreground">No note yet for this call.</p>
                )}
                <Button variant="secondary" disabled={!aiOn || coachingBusy} onClick={() => void makeCoachingNote()}>
                  {coachingBusy ? "Writing…" : "Generate with local model"}
                </Button>
              </div>
            </div>
          </div>
          </>
          )}
        </TabsContent>

        <TabsContent value="scorecards" className={cn(PANEL, SECTION)}>
          <div className="flex flex-col gap-5 lg:col-span-5">
            <h2 className={HEADING}>4 · Scorecard editor — Bank Support v2</h2>
            <p className="max-w-[48ch] text-muted-foreground">The rules every call is checked against. Weights must total 100. Changes are saved in this browser and apply to the next call you score.</p>
            {draft ? (
              <Button variant="outline" className="self-start" onClick={() => setDraft(BANK_SUPPORT_V2)}>Reset to preset</Button>
            ) : (
              <Button variant="outline" className="self-start" onClick={() => setDraft(checks)}>Edit scorecard</Button>
            )}
          </div>
          <div className="lg:col-span-7">
            {draft ? (
              <>
                <ul>
                  {draft.map((c) => {
                    const patch = (change: Partial<Check>) => setDraft(draft.map((x) => (x.id === c.id ? { ...x, ...change } : x)));
                    return (
                      <li key={c.id} className="flex flex-col gap-3 border-t border-border py-5">
                        <div className="flex items-center gap-2">
                          <Input aria-label="Check" value={c.label} placeholder="What the agent must or must not do" onChange={(e) => patch({ label: e.target.value })} className="font-medium" />
                          <Button size="icon" variant="ghost" aria-label={`Remove check: ${c.label}`} onClick={() => setDraft(draft.filter((x) => x.id !== c.id))}>
                            <XIcon />
                          </Button>
                        </div>
                        <Input aria-label="How to judge it" value={c.guide ?? ""} placeholder="How to judge it (optional): what counts as a pass, what counts as a fail" onChange={(e) => patch({ guide: e.target.value })} />
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                          <Field orientation="horizontal" className="w-auto">
                            <FieldLabel htmlFor={`kind-${c.id}`}>Type</FieldLabel>
                            <select
                              id={`kind-${c.id}`}
                              value={c.kind}
                              onChange={(e) => patch({ kind: e.target.value as Check["kind"] })}
                              className="h-10 border border-input bg-background px-3 text-base transition-colors duration-200 hover:border-foreground md:text-sm"
                            >
                              <option value="must_do">Must do</option>
                              <option value="must_not">Must not</option>
                            </select>
                          </Field>
                          <Field orientation="horizontal" className="w-auto">
                            <FieldLabel htmlFor={`weight-${c.id}`}>Weight</FieldLabel>
                            <Input
                              id={`weight-${c.id}`}
                              // A plain box you type a number into: digits only, 0 to 100, no stepper arrows.
                              type="text"
                              inputMode="numeric"
                              value={String(c.weight)}
                              onChange={(e) => patch({ weight: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                              onFocus={(e) => e.target.select()}
                              className="w-20 tabular-nums"
                            />
                          </Field>
                          <Field orientation="horizontal" className="w-auto">
                            <Checkbox id={`critical-${c.id}`} checked={c.critical} onCheckedChange={(v) => patch({ critical: v })} />
                            <FieldLabel htmlFor={`critical-${c.id}`}>Critical</FieldLabel>
                          </Field>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-foreground pt-5">
                  <p className={cn("text-xl font-medium tracking-tight", draftProblem && "text-destructive")}>
                    Total: <span className="tabular-nums">{draftTotal} / 100</span>
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setDraft([...draft, { id: `custom-${Date.now().toString(36)}`, label: "", kind: "must_do", weight: 0, critical: false }])}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Add check
                  </Button>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-2">
                  <Button disabled={!!draftProblem} onClick={() => { save(draft); setDraft(null); }}>Save changes</Button>
                  <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                  {draftProblem && <p role="status" className="label text-destructive">{draftProblem}</p>}
                </div>
              </>
            ) : (
              <>
                <ul>
                  {checks.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-border py-4">
                      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
                        <span className="font-medium">{c.label}</span>
                        {c.guide?.trim() && <span className="label text-muted-foreground">{c.guide}</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        {c.critical && <Badge variant="strong">Critical</Badge>}
                        <span className="label text-muted-foreground">{c.kind === "must_do" ? "Must do" : "Must not"}</span>
                        <span className="w-8 text-right font-medium tabular-nums">{c.weight}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className={cn("border-t border-foreground pt-5 text-xl font-medium tracking-tight", total !== 100 && "text-destructive")}>
                  Total: <span className="tabular-nums">{total} / 100</span>
                </p>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="agents" className={cn(PANEL, "flex flex-col gap-24")}>
          <section className={SECTION}>
            <div className="flex flex-col gap-5 lg:col-span-5">
              <h2 className={HEADING}>Agents and their phones</h2>
              <p className="max-w-[48ch] text-muted-foreground">Add an agent to get their own upload link. They paste it once into the “Send to Linya” shortcut, and every recording they send arrives under their name.</p>
            </div>
            <div className="lg:col-span-7">
              <Devices online={phones.online} info={phones.info} agents={phones.agents} onChange={() => void refreshPhones()} />
            </div>
          </section>
          <section className={SECTION}>
          <div className="flex flex-col gap-5 lg:col-span-5">
            <h2 className={HEADING}>5 · Agent dashboard</h2>
            <p className="max-w-[48ch] text-muted-foreground">Averages and most-missed checks across all calls on this machine.</p>
          </div>
          <div className="flex flex-col gap-10 lg:col-span-7">
            {stats.length === 0 ? (
              <p>No calls yet.</p>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.map((s) => ({ agent: s.agent, avg: s.avg }))} barCategoryGap="35%">
                      <XAxis dataKey="agent" tick={{ fontSize: 13, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                      <YAxis domain={[0, 100]} width={32} tick={{ fontSize: 13, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        contentStyle={{ background: "var(--background)", border: "1px solid var(--foreground)", borderRadius: 0, fontSize: 13 }}
                        labelStyle={{ color: "var(--foreground)", fontWeight: 500 }}
                        itemStyle={{ color: "var(--foreground)" }}
                      />
                      <Bar dataKey="avg" name="Avg score" fill="var(--foreground)" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="border-b border-border">
                  {stats.map((s) => (
                    <li key={s.agent} className="flex flex-col gap-1 border-t border-border py-4">
                      <span>
                        <span className="font-medium">{s.agent}</span>
                        <span className="text-muted-foreground"> · {s.calls} call(s) · avg {s.avg} · {s.reds} failed</span>
                      </span>
                      {s.missed.length > 0 && (
                        <span className="label text-muted-foreground">
                          Most missed: {s.missed.map((m) => `${m.label} (×${m.count})`).join("; ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          </section>
        </TabsContent>

        <TabsContent value="export" className={cn(PANEL, SECTION)}>
          <h2 className={cn(HEADING, "lg:col-span-5")}>6 · Export (redacted)</h2>
          <div className="flex flex-col gap-8 lg:col-span-7">
            <p className="max-w-[48ch] text-muted-foreground">Card numbers, emails and PH mobiles are redacted via regex + Luhn. Names/addresses LLM pass is AI-phase TODO.</p>
            {calls.length === 0 && <p>No calls yet.</p>}
            <div className="flex flex-wrap gap-2">
              {calls.map((c) => (
                <span key={c.id} className="flex gap-1">
                  <Button variant="outline" onClick={() => exportCSV(c)}>{callName(c)} CSV</Button>
                  <Button variant="ghost" onClick={() => exportPDF(c, checks)}>PDF</Button>
                </span>
              ))}
            </div>
          </div>
        </TabsContent>
      </main>
    </Tabs>
  );
}
