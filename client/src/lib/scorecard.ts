// Bank Support v2 preset from spec §08. Weights sum to 100.
// Status: green >= 85, amber 70–84, red < 70. Any critical fail forces red.

export type Verdict = "pass" | "fail" | "not_applicable";

export interface Check {
  id: string;
  label: string;
  kind: "must_do" | "must_not";
  weight: number;
  critical: boolean;
  /** Optional plain-language note for the scoring model: what counts as pass or fail. */
  guide?: string;
}

export interface CheckResult {
  check_id: string;
  verdict: Verdict;
  severity: "critical" | "normal";
  speaker?: "agent" | "customer";
  timestamp?: string;
  evidence?: string;
  reason?: string;
}

export const BANK_SUPPORT_V2: Check[] = [
  { id: "greeting", label: "Greets the customer with own name and company", kind: "must_do", weight: 10, critical: false },
  { id: "verify_identity", label: "Verifies identity before discussing the account", kind: "must_do", weight: 18, critical: true },
  { id: "empathy", label: "Shows empathy when the customer is upset", kind: "must_do", weight: 14, critical: false },
  { id: "no_card_readback", label: "Never reads back a full card number", kind: "must_not", weight: 20, critical: true },
  { id: "no_refund_promise", label: "Never promises a refund without approval", kind: "must_not", weight: 12, critical: false },
  { id: "further_help", label: "Offers further help before closing", kind: "must_do", weight: 12, critical: false },
  { id: "closing", label: "Closes properly: thanks the customer, uses brand name", kind: "must_do", weight: 14, critical: false },
];

export type CallStatus = "green" | "amber" | "red";

/** What each status is called on screen and in exports. The colour carries the same meaning. */
export const STATUS_LABEL: Record<CallStatus, string> = { green: "Passed", amber: "Needs review", red: "Failed" };

export function scoreCall(checks: Check[], results: CheckResult[]): { score: number; status: CallStatus } {
  const byId = new Map(results.map((r) => [r.check_id, r]));
  let earned = 0;
  let possible = 0;
  let criticalFail = false;
  for (const c of checks) {
    const r = byId.get(c.id);
    if (!r || r.verdict === "not_applicable") continue; // excluded, scaled later
    possible += c.weight;
    if (r.verdict === "pass") earned += c.weight;
    if (r.verdict === "fail" && c.critical) criticalFail = true;
  }
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  let status: CallStatus = score >= 85 ? "green" : score >= 70 ? "amber" : "red";
  if (criticalFail) status = "red";
  return { score, status };
}
