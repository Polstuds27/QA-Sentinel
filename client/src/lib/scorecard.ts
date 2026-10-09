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

/** True when a call was detected as anything other than English only ("en"). */
export const notInEnglish = (languages?: string[]) => !!languages?.some((code) => code !== "en");

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

/** An analyst's verdicts per check, keyed "callId:checkId". */
export type Decisions = Record<string, Verdict>;

export interface Grade {
  /** Null while the call is waiting for an analyst. */
  score: number | null;
  status: CallStatus;
  /** The verdicts that count: the model's, or the analyst's on a call scored by hand. */
  results: CheckResult[];
  /** True when the call is scored by an analyst instead of the model. */
  byHand: boolean;
  /** Checks the analyst has not marked yet. */
  pending: number;
}

/** Shown on screen and in exports while a call that is not in English waits for its review. */
export const NOT_ENGLISH_NOTE = "Not in English: Linewise scores English calls only for now. Mark each check as Pass, Fail or N/A to score this call by hand.";
/** And once every check has been marked. */
export const BY_HAND_NOTE = "Not in English: scored by an analyst, not by the model.";

// A call's score and status. Scoring is tuned for English (prompts, keyword lists, the
// eval set), so the model's verdicts on a call in any other language are not used: that
// call is scored by hand. It stays unscored and amber, "Needs review", until an analyst
// has marked every check, and then takes its score from those marks alone.
export function gradeCall(call: { id: string; results: CheckResult[]; languages?: string[] }, checks: Check[], decisions: Decisions): Grade {
  if (!notInEnglish(call.languages)) return { ...scoreCall(checks, call.results), results: call.results, byHand: false, pending: 0 };
  const results = checks.flatMap((c): CheckResult[] => {
    const verdict = decisions[`${call.id}:${c.id}`];
    return verdict ? [{ check_id: c.id, verdict, severity: c.critical ? "critical" : "normal" }] : [];
  });
  const pending = checks.length - results.length;
  if (pending > 0) return { score: null, status: "amber", results, byHand: true, pending };
  return { ...scoreCall(checks, results), results, byHand: true, pending: 0 };
}
