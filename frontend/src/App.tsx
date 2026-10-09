import { useMemo, useRef, useState } from "react";
import { DEMO_CALLS, demoScore, type DemoCall } from "./mock";
import { BANK_SUPPORT_V2, scoreCall, type Check } from "./lib/scorecard";
import { redactPII } from "./lib/pii";

type Tab = "calls" | "detail" | "scorecards" | "agents" | "export";

interface QueueItem {
  name: string;
  status: "queued" | "ready";
  url: string;
}

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
  const audioRef = useRef<HTMLAudioElement>(null);

  const calls: DemoCall[] = useMemo(() => DEMO_CALLS, []);
  const selected = calls.find((c) => c.id === selectedId) ?? calls[0];
  const { score, status } = scoreCall(checks, selected.results);
  void demoScore;

  const visible = calls.filter((c) => {
    if (!flaggedOnly) return true;
    return scoreCall(checks, c.results).status === "red";
  });

  function onFiles(files: FileList | null) {
    if (!files) return;
    const items: QueueItem[] = [...files].map((f) => ({
      name: f.name,
      status: "ready",
      url: URL.createObjectURL(f),
    }));
    setQueue((q) => [...items, ...q]);
  }

  function seek(ts: string, url?: string) {
    if (url && audioRef.current) {
      if (audioRef.current.src !== url) audioRef.current.src = url;
      audioRef.current.currentTime = toSeconds(ts);
      void audioRef.current.play().catch(() => {});
    }
  }

  function exportCSV(call: DemoCall) {
    const rows = [
      ["call_id", "agent", "check_id", "verdict", "timestamp", "evidence_redacted"],
      ...call.results.map((r) => [
        call.id,
        call.agent,
        r.check_id,
        r.verdict,
        r.timestamp ?? "",
        `"${redactPII(r.evidence ?? "").replace(/"/g, "'")}"`,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qa-call-${call.id}-redacted.csv`;
    a.click();
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
            ● Offline ready (UI shell — AI pipeline not wired yet)
          </span>
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
              <input type="file" accept="audio/*,.mp3,.wav,.m4a" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {queue.length > 0 && (
              <ul className="space-y-1 text-sm">
                {queue.map((q, i) => (
                  <li key={i} className="flex justify-between rounded bg-white/5 px-3 py-2">
                    <span>{q.name}</span>
                    <span className="text-emerald-300">{q.status} (transcription TODO — AI phase)</span>
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
                      onClick={() => { setSelectedId(c.id); setTab("detail"); }}
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
                      <li key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span className={`w-12 text-xs font-bold ${badge === "PASS" ? "text-emerald-600" : badge === "N/A" ? "text-slate-400" : "text-red-600"}`}>{badge}</span>
                        <span className="flex-1">{c.label} <span className="text-xs text-slate-400">({c.weight})</span></span>
                        {r?.timestamp && <span className="font-mono text-xs text-slate-500">{r.timestamp}</span>}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Confirm flag</button>
                  <button className="rounded-lg bg-slate-200 px-4 py-2 text-sm">Dismiss</button>
                  <button onClick={() => exportCSV(selected)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Export</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "scorecards" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">4 · Scorecard editor — Bank Support v2</h2>
            <p className="text-sm text-slate-500">Preset from spec §08. Total must equal 100. Stored in IndexedDB (Dexie) — persistence TODO.</p>
            <ul className="mt-4 space-y-2">
              {checks.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{c.label}</span>
                  <label className="flex items-center gap-1 text-xs">weight
                    <input type="number" value={c.weight} min={0} max={100}
                      onChange={(e) => setChecks((ps) => ps.map((x) => x.id === c.id ? { ...x, weight: Number(e.target.value) } : x))}
                      className="w-16 rounded border px-1 py-0.5" />
                  </label>
                  <label className="flex items-center gap-1 text-xs">critical
                    <input type="checkbox" checked={c.critical}
                      onChange={(e) => setChecks((ps) => ps.map((x) => x.id === c.id ? { ...x, critical: e.target.checked } : x))} />
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-bold">Total: {checks.reduce((a, c) => a + c.weight, 0)} / 100</p>
          </section>
        )}

        {tab === "agents" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">5 · Agent dashboard (stretch)</h2>
            <p className="text-sm text-slate-500">Deferred until MVP works end-to-end. Planned: score trend per agent, most-missed checks, auto coaching notes.</p>
          </section>
        )}

        {tab === "export" && (
          <section className="rounded-2xl bg-white p-6 text-slate-900">
            <h2 className="text-xl font-bold">6 · Export (redacted)</h2>
            <p className="text-sm text-slate-500">Card numbers, emails and PH mobiles are redacted via regex + Luhn. Names/addresses LLM pass is AI-phase TODO.</p>
            <div className="mt-4 flex gap-2">
              {calls.map((c) => (
                <button key={c.id} onClick={() => exportCSV(c)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Call #{c.id} CSV</button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
