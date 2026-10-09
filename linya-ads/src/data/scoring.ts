// The app's own scoring and redaction rules, ported from frontend/src/lib/scorecard.ts
// and frontend/src/lib/pii.ts so the ad shows the numbers the app shows.

import type { Check, CheckResult } from "./demo";

export type CallStatus = "green" | "amber" | "red";

export const STATUS_LABEL: Record<CallStatus, string> = {
  red: "Red",
  amber: "Amber",
  green: "Green",
};

// Green >= 85, amber 70–84, red < 70. Any critical fail forces red. N/A checks are
// left out and the score is scaled back to 100.
export function scoreCall(
  checks: Check[],
  results: CheckResult[],
): { score: number; status: CallStatus } {
  const byId = new Map(results.map((r) => [r.check_id, r]));
  let earned = 0;
  let possible = 0;
  let criticalFail = false;
  for (const c of checks) {
    const r = byId.get(c.id);
    if (!r || r.verdict === "not_applicable") continue;
    possible += c.weight;
    if (r.verdict === "pass") earned += c.weight;
    if (r.verdict === "fail" && c.critical) criticalFail = true;
  }
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  let status: CallStatus =
    score >= 85 ? "green" : score >= 70 ? "amber" : "red";
  if (criticalFail) status = "red";
  return { score, status };
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// Card numbers only: the sample calls contain no emails or phone numbers.
export function redactPII(text: string): string {
  return text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      return `[CARD •••• ${digits.slice(-4)}]`;
    }
    return m;
  });
}

export function toSeconds(ts: string): number {
  const [m, s] = ts.split(":").map(Number);
  return m * 60 + s;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
