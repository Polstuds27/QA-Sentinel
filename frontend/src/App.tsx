import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_CALLS, type DemoCall } from "./mock";
import {
  isAIEnabled,
  runLocalPipeline,
  setAIEnabled,
  type PipelineProgress,
} from "./ai/pipeline";
import { getBackend } from "./ai/backend";
import { generateCoachingNote } from "./ai/coaching";
import { BANK_SUPPORT_V2, scoreCall, type Check } from "./lib/scorecard";
import { redactPII } from "./lib/pii";
import {
  getCoaching,
  getScorecard,
  loadAICalls,
  saveAICall,
  saveCoaching,
  saveScorecard,
  setOverride,
} from "./lib/store";
import { downloadCSV, exportPDF } from "./lib/export";
import { agentStats } from "./lib/agents";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

function statusColor(s: string) {
  return s === "red"
    ? "bg-red-100 text-red-700"
    : s === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";
}

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
      if (audioRef.current.src !== url) audioRef.current.src = url;
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

  return (
    <div className="min-h-screen bg-[#0a1628] text-slate-200">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white">QA Sentinel</span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
            ● {aiOn ? "Local AI on (Whisper + Ollama 3B)" : "Offline ready (UI shell — mock data)"}
          </span>
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input
              type="checkbox"
              data-testid="ai-toggle"
              checked={aiOn}
              disabled={aiChecking}
              onChange={(e) => void toggleAI(e.target.checked)}
            />
            Local AI{aiChecking ? "…" : ""}
          </label>
        </div>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-3 py-1.5 text-sm ${tab === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {tab === "calls" && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white">1 · Upload &amp; queue</h2>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-white/15 p-8 text-center hover:border-emerald-400">
              <span className="text-sm">Drop MP3 / WAV / M4A here or click to browse (batch)</span>
              <input type="file" data-testid="upload" accept="audio/*,.mp3,.wav,.m4a" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {aiError && <p className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-300">{aiError}</p>}
            {queue.length > 0 && (
              <ul className="space-y-1 text-sm">
                {queue.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 rounded bg-white/5 px-3 py-2">
                    <span>{q.name}</span>
                    <span className="flex items-center gap-2">
                      <span data-testid={`queue-status-${q.id}`} className="text-emerald-300">{q.status}</span>
                      {aiOn && q.status === "ready" && (
                        <button
                          data-testid={`transcribe-${q.id}`}
                          onClick={() => void runAI(q)}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
                        >
                          Transcribe &amp; score
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="pt-4 text-xl font-semibold text-white">2 · Calls list</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
              Flagged (red) only
            </label>
            <ul className="space-y-2">
              {visible.map((c) => {
                const s = scoreCall(checks, c.results);
                const flags = c.results.filter((r) => r.verdict === "fail").length;
                return (
                  <li key={c.id}>
                    <button
                      data-testid={`call-${c.id}`}
                      onClick={() => void openCall(c.id)}
                      className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left text-slate-900 hover:ring-2 hover:ring-emerald-500"
                    >
                      <span><b>Call #{c.id}</b> <span className="text-sm text-slate-500">Agent: {c.agent} · {c.duration} · {c.scorecard}</span></span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{flags} flags</span>
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusColor(s.status)}`}>{s.score} / 100</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tab === "detail" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Call #{selected.id} <span className="text-sm font-normal text-slate-500">Agent: {selected.agent} · {selected.duration} · {selected.scorecard}</span></h2>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusColor(status)}`}>{score} / 100 · {status.toUpperCase()}</span>
            </div>
            <audio ref={audioRef} controls className="mt-4 w-full" />
            <p className="mt-1 text-xs text-slate-500">Demo transcripts are built-in. Uploaded files play here after upload; click any timestamp to seek.</p>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-500">TRANSCRIPT (PII REDACTED)</h3>
                <ul className="space-y-2">
                  {selected.lines.map((l, i) => (
                    <li key={i} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
                      <button className="mr-2 font-mono text-xs text-slate-500 underline" onClick={() => seek(l.time, queue[0]?.url)}>{l.time}</button>
                      <b className="mr-2 text-xs">{l.speaker}</b>
                      {redactPII(l.text)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-500">SCORECARD</h3>
                <ul className="space-y-2">
                  {checks.map((c) => {
                    const r = selected.results.find((x) => x.check_id === c.id);
                    const badge = !r || r.verdict === "not_applicable" ? "N/A" : r.verdict === "pass" ? "PASS" : c.critical ? "CRIT" : "FAIL";
                    return (
                      <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className={`w-12 text-xs font-bold ${badge === "PASS" ? "text-emerald-600" : badge === "N/A" ? "text-slate-400" : "text-red-600"}`}>{badge}</span>
                          <span className="flex-1">{c.label} <span className="text-xs text-slate-400">({c.weight})</span></span>
                          {r?.timestamp && <span className="font-mono text-xs text-slate-500">{r.timestamp}</span>}
                        </div>
                        {r && r.verdict === "fail" && (
                          <div className="mt-1 flex items-center gap-2 pl-12 text-xs">
                            <span className="text-slate-500">Analyst:</span>
                            <button onClick={() => void overrideVerdict(selected.id, c.id, "fail")} className="rounded bg-slate-900 px-2 py-0.5 text-white">Confirm</button>
                            <button onClick={() => void overrideVerdict(selected.id, c.id, "pass")} className="rounded bg-slate-200 px-2 py-0.5">Dismiss</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => exportCSV(selected)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Export CSV</button>
                  <button onClick={() => exportPDF(selected, checks)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Export PDF</button>
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-500">COACHING NOTE</h3>
                  {coaching[selected.id] ? (
                    <p className="text-sm italic">“{coaching[selected.id]}”</p>
                  ) : (
                    <p className="text-sm text-slate-500">No note yet for this call.</p>
                  )}
                  <button
                    disabled={!aiOn || coachingBusy}
                    onClick={() => void makeCoachingNote()}
                    className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-40"
                  >
                    {coachingBusy ? "Writing…" : "Generate with local model"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "scorecards" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">4 · Scorecard editor — Bank Support v2</h2>
            <p className="text-sm text-slate-500">Preset from spec §08. Total must equal 100. Edits persist to IndexedDB.</p>
            <ul className="mt-4 space-y-2">
              {checks.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{c.label}</span>
                  <label className="flex items-center gap-1 text-xs">weight
                    <input type="number" value={c.weight} min={0} max={100}
                      onChange={(e) => {
                        const next = checks.map((x) => x.id === c.id ? { ...x, weight: Number(e.target.value) } : x);
                        setChecks(next);
                        void saveScorecard(next).catch(() => {});
                      }}
                      className="w-16 rounded border px-1 py-0.5" />
                  </label>
                  <label className="flex items-center gap-1 text-xs">critical
                    <input type="checkbox" checked={c.critical}
                      onChange={(e) => {
                        const next = checks.map((x) => x.id === c.id ? { ...x, critical: e.target.checked } : x);
                        setChecks(next);
                        void saveScorecard(next).catch(() => {});
                      }} />
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-bold">Total: {checks.reduce((a, c) => a + c.weight, 0)} / 100</p>
          </section>
        )}

        {tab === "agents" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">5 · Agent dashboard</h2>
            <p className="text-sm text-slate-500">Averages and most-missed checks across all calls on this machine.</p>
            {(() => {
              const stats = agentStats(calls, checks);
              if (stats.length === 0) return <p className="mt-4 text-sm">No calls yet.</p>;
              return (
                <div className="mt-4 space-y-6">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.map((s) => ({ agent: s.agent, avg: s.avg }))}>
                        <XAxis dataKey="agent" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="avg" name="Avg score" fill="#059669" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-2">
                    {stats.map((s) => (
                      <li key={s.agent} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <b>{s.agent}</b>
                        <span className="text-slate-500"> · {s.calls} call(s) · avg {s.avg} · {s.reds} red</span>
                        {s.missed.length > 0 && (
                          <span className="block text-xs text-slate-500">
                            Most missed: {s.missed.map((m) => `${m.label} (×${m.count})`).join("; ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </section>
        )}

        {tab === "export" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">6 · Export (redacted)</h2>
            <p className="text-sm text-slate-500">Card numbers, emails and PH mobiles are redacted via regex + Luhn. Names/addresses LLM pass is AI-phase TODO.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {calls.map((c) => (
                <span key={c.id} className="flex gap-1">
                  <button onClick={() => exportCSV(c)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Call #{c.id} CSV</button>
                  <button onClick={() => exportPDF(c, checks)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">PDF</button>
                </span>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
