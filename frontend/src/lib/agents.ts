// Agent analytics over scored calls: averages, red-call counts, most-missed checks.
// Feeds the Agents dashboard tab. Pure functions over in-memory calls.
import { scoreCall, type Check, type CheckResult } from "./scorecard";

export interface MissedCheck {
  checkId: string;
  label: string;
  count: number;
}

export interface AgentStat {
  agent: string;
  calls: number;
  avg: number;
  reds: number;
  missed: MissedCheck[];
}

export function agentStats(
  calls: Array<{ agent: string; results: CheckResult[] }>,
  checks: Check[],
): AgentStat[] {
  const byAgent = new Map<string, Array<CheckResult[]>>();
  for (const c of calls) {
    const list = byAgent.get(c.agent) ?? [];
    list.push(c.results);
    byAgent.set(c.agent, list);
  }
  const labelOf = (id: string) => checks.find((c) => c.id === id)?.label ?? id;
  return [...byAgent.entries()].map(([agent, all]) => {
    const scores = all.map((r) => scoreCall(checks, r));
    const avg = Math.round(scores.reduce((a, s) => a + s.score, 0) / Math.max(1, scores.length));
    const reds = scores.filter((s) => s.status === "red").length;
    const missCount = new Map<string, number>();
    for (const r of all) {
      for (const v of r) {
        if (v.verdict === "fail") missCount.set(v.check_id, (missCount.get(v.check_id) ?? 0) + 1);
      }
    }
    const missed: MissedCheck[] = [...missCount.entries()]
      .map(([checkId, count]) => ({ checkId, label: labelOf(checkId), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return { agent, calls: all.length, avg, reds, missed };
  });
}
