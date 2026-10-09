import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckIcon, MinusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AudioPlayer } from "@/components/audio-player";
import { Logo } from "@/components/logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_CALLS, type DemoCall } from "./mock";
import { isAIEnabled, runLocalPipeline, setAIEnabled, type PipelineProgress } from "./ai/pipeline";
import { getBackend } from "./ai/backend";
import { generateCoachingNote } from "./ai/coaching";
import { BANK_SUPPORT_V2, scoreCall, type CallStatus, type Check } from "./lib/scorecard";
import { redactPII } from "./lib/pii";
import { getCoaching, getScorecard, loadAICalls, saveAICall, saveCoaching, saveScorecard, setOverride } from "./lib/store";
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

const STATUS_LABEL: Record<CallStatus, string> = { red: "Red", amber: "Amber", green: "Green" };

// One accent only (DESIGN.md): status reads from the word and the weight of the
// edge, not from a traffic-light hue. Red is the one error state.
function StatusBadge({ status, children }: { status: CallStatus; children: ReactNode }) {
  const variant = status === "red" ? "destructive" : status === "amber" ? "strong" : "outline";
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
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    void loadAICalls().then(setAiCalls).catch(() => {});
    void getScorecard().then(setChecks).catch(() => {});
  }, []);

  const calls: DemoCall[] = useMemo(() => [...aiCalls, ...DEMO_CALLS], [aiCalls]);
  const selected = calls.find((c) => c.id === selectedId) ?? calls[0];
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

  async function runAI(item: QueueItem) {
    setAiError("");
    const onStage = (p: PipelineProgress) => patchQueue(item.id, `${p.stage}: ${p.detail}`);
    try {
      onStage({ stage: "decoding", detail: "starting" });
      const out = await runLocalPipeline(item.file, checks, onStage);
      const call: DemoCall = {
        id: `ai-${item.id}`,
        agent: "Uploaded call",
        duration: out.duration,
        scorecard: "Bank Support v2",
        lines: out.lines,
        results: out.results,
      };
      await saveAICall(call);
      setAiCalls((cs) => [call, ...cs.filter((c) => c.id !== call.id)]);
      patchQueue(item.id, "done — open in Calls list below");
      setSelectedId(call.id);
    } catch (e) {
      patchQueue(item.id, "ready");
      setAiError(e instanceof Error ? e.message : String(e));
    }
  }

  async function overrideVerdict(callId: string, checkId: string, verdict: "pass" | "fail") {
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
        .map((r) => ({ label: labelOf(r.check_id), evidence: r.evidence, timestamp: r.timestamp }));
      const strengths = selected.results
        .filter((r) => r.verdict === "pass")
        .map((r) => labelOf(r.check_id));
      const note = await generateCoachingNote(selected.agent, failures, strengths);
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

  // A demo call plays its own recording; an analysed upload plays the file it came from.
  const audioUrl = selected.audio ?? queue.find((q) => `ai-${q.id}` === selected.id)?.url ?? queue[0]?.url;
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

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-x-10 px-5 sm:px-8 md:h-16 md:flex-row md:items-center md:justify-between">
          <div className="flex h-14 min-w-0 items-center gap-4">
            <Logo className="shrink-0" />
            <span className="label flex min-w-0 items-center gap-2 text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground" />
              <span className="truncate">{aiOn ? "Local AI on (Whisper + Ollama 3B)" : "Offline ready (UI shell — mock data)"}</span>
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
              {queue.length > 0 && (
                <ul className="border-b border-border">
                  {queue.map((q) => (
                    <li key={q.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-3 text-sm">
                      <span className="min-w-0 font-medium break-words">{q.name}</span>
                      <span className="flex items-center gap-4">
                        <span data-testid={`queue-status-${q.id}`} className="text-muted-foreground">{q.status}</span>
                        {aiOn && q.status === "ready" && (
                          <Button size="sm" data-testid={`transcribe-${q.id}`} onClick={() => void runAI(q)}>
                            Transcribe &amp; score
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className={SECTION}>
            <div className="flex flex-col gap-6 lg:col-span-5">
              <h2 className={HEADING}>2 · Calls list</h2>
              <Field orientation="horizontal">
                <Checkbox id="flagged-only" checked={flaggedOnly} onCheckedChange={(v) => setFlaggedOnly(v)} />
                <FieldLabel htmlFor="flagged-only">Flagged (red) only</FieldLabel>
              </Field>
            </div>
            <div className="lg:col-span-7">
              {visible.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No red calls</EmptyTitle>
                    <EmptyDescription>Nothing here scored below 70 or failed a critical check. Clear the filter to see every call.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="border-b border-border">
                  {visible.map((c) => {
                    const s = scoreCall(checks, c.results);
                    const flags = c.results.filter((r) => r.verdict === "fail").length;
                    return (
                      <li key={c.id} className="border-t border-border">
                        <button
                          data-testid={`call-${c.id}`}
                          onClick={() => void openCall(c.id)}
                          className="group flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 text-left"
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
                              <span className="text-xl font-medium tracking-tight">Call #{c.id}</span>
                              <span className="label text-muted-foreground">Agent: {c.agent} · {c.duration} · {c.scorecard}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-4 max-sm:pl-5">
                            <span className="label text-muted-foreground tabular-nums">{flags} flags</span>
                            <StatusBadge status={s.status}>{s.score} / 100 · {STATUS_LABEL[s.status]}</StatusBadge>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="detail" className={PANEL}>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div className="flex flex-col gap-3">
              <h2 className="display text-4xl sm:text-5xl">Call #{selected.id}</h2>
              <p className="text-muted-foreground">Agent: {selected.agent} · {selected.duration} · {selected.scorecard}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="display text-4xl tabular-nums sm:text-5xl">
                <span className={cn(status === "red" && "text-destructive")}>{score}</span>
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
          <p className="label mt-3 text-muted-foreground">{selected.audio ? "Sample recording with computer-generated voices; the transcript and scores are scripted." : "Transcribed and scored on this machine."} Click any timestamp or flag tick to play from there.</p>
          <div className="mt-16 grid gap-x-10 gap-y-16 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h3 className="mb-5 text-xl font-medium tracking-tight">Transcript (PII redacted)</h3>
              <ul className="border-b border-border">
                {selected.lines.map((l, i) => (
                  <li key={i} className="grid grid-cols-[3rem_4.5rem_1fr] items-baseline gap-x-3 border-t border-border py-3">
                    <button className="label text-left text-muted-foreground underline underline-offset-4 transition-colors duration-200 hover:text-primary" onClick={() => seek(l.time, audioUrl)}>{l.time}</button>
                    <span className="label">{l.speaker}</span>
                    <span className="max-w-[60ch]">{redactPII(l.text)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-5">
              <h3 className="mb-5 text-xl font-medium tracking-tight">Scorecard</h3>
              <ul className="border-b border-border">
                {checks.map((c) => {
                  const r = selected.results.find((x) => x.check_id === c.id);
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
                      {r && r.verdict === "fail" && (
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
        </TabsContent>

        <TabsContent value="scorecards" className={cn(PANEL, SECTION)}>
          <div className="flex flex-col gap-5 lg:col-span-5">
            <h2 className={HEADING}>4 · Scorecard editor — Bank Support v2</h2>
            <p className="max-w-[48ch] text-muted-foreground">Preset from spec §08. Total must equal 100. Edits persist to IndexedDB.</p>
          </div>
          <div className="lg:col-span-7">
            <ul>
              {checks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border py-4">
                  <span className="min-w-0 flex-1 basis-64 font-medium">{c.label}</span>
                  <div className="flex items-center gap-6">
                    <Field orientation="horizontal" className="w-auto">
                      <FieldLabel htmlFor={`weight-${c.id}`}>Weight</FieldLabel>
                      <Input id={`weight-${c.id}`} type="number" value={c.weight} min={0} max={100}
                        onChange={(e) => save(checks.map((x) => x.id === c.id ? { ...x, weight: Number(e.target.value) } : x))}
                        className="w-20" />
                    </Field>
                    <Field orientation="horizontal" className="w-auto">
                      <Checkbox id={`critical-${c.id}`} checked={c.critical}
                        onCheckedChange={(v) => save(checks.map((x) => x.id === c.id ? { ...x, critical: v } : x))} />
                      <FieldLabel htmlFor={`critical-${c.id}`}>Critical</FieldLabel>
                    </Field>
                  </div>
                </li>
              ))}
            </ul>
            <p className={cn("border-t border-foreground pt-5 text-xl font-medium tracking-tight", total !== 100 && "text-destructive")}>Total: <span className="tabular-nums">{total} / 100</span></p>
          </div>
        </TabsContent>

        <TabsContent value="agents" className={cn(PANEL, SECTION)}>
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
                        <span className="text-muted-foreground"> · {s.calls} call(s) · avg {s.avg} · {s.reds} red</span>
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
        </TabsContent>

        <TabsContent value="export" className={cn(PANEL, SECTION)}>
          <h2 className={cn(HEADING, "lg:col-span-5")}>6 · Export (redacted)</h2>
          <div className="flex flex-col gap-8 lg:col-span-7">
            <p className="max-w-[48ch] text-muted-foreground">Card numbers, emails and PH mobiles are redacted via regex + Luhn. Names/addresses LLM pass is AI-phase TODO.</p>
            <div className="flex flex-wrap gap-2">
              {calls.map((c) => (
                <span key={c.id} className="flex gap-1">
                  <Button variant="outline" onClick={() => exportCSV(c)}>Call #{c.id} CSV</Button>
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
