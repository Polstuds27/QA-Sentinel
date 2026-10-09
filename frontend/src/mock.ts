import { BANK_SUPPORT_V2, scoreCall, type CheckResult } from "./lib/scorecard";

export interface TranscriptLine {
  time: string;
  speaker: "Agent" | "Customer";
  text: string;
}

export interface DemoCall {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  /** Recording in public/samples/, built by scripts/make_sample_calls.py. */
  audio?: string;
  lines: TranscriptLine[];
  results: CheckResult[];
}

// Line times and durations come from the generated recordings (synthetic voices,
// scripted calls). Re-run scripts/make_sample_calls.py and copy its output here if a
// script changes. Transcripts and verdicts are still hand-written, not model output.
const sample = (id: string) => `${import.meta.env.BASE_URL}samples/call-${id}.m4a`;

// Spec §05 scenario: Call #147 (critical violations, 62/100 RED).
const CALL_147: DemoCall = {
  id: "147",
  agent: "Jason",
  duration: "0:31",
  scorecard: "Bank Support v2",
  audio: sample("147"),
  lines: [
    { time: "00:00", speaker: "Agent", text: "Thank you for calling, this is Jason." },
    { time: "00:03", speaker: "Customer", text: "Hi, I want to dispute a charge on my card." },
    { time: "00:06", speaker: "Agent", text: "Sure! What's the card number?" },
    { time: "00:09", speaker: "Customer", text: "It's 4111 1111 1111 1111." },
    { time: "00:14", speaker: "Agent", text: "Okay, so that's 4111 1111 1111 1111, right?" },
    { time: "00:22", speaker: "Agent", text: "I understand how frustrating that is." },
    { time: "00:25", speaker: "Agent", text: "Is there anything else I can help with?" },
    { time: "00:27", speaker: "Agent", text: "Thanks for calling BankCo, bye!" },
  ],
  results: [
    { check_id: "greeting", verdict: "pass", severity: "normal", timestamp: "00:00", evidence: "Thank you for calling, this is Jason." },
    { check_id: "verify_identity", verdict: "fail", severity: "critical", speaker: "agent", timestamp: "00:06", evidence: "Asked for card details with no security question", reason: "No identity verification before account access." },
    { check_id: "empathy", verdict: "pass", severity: "normal", timestamp: "00:22", evidence: "I understand how frustrating that is." },
    { check_id: "no_card_readback", verdict: "fail", severity: "critical", speaker: "agent", timestamp: "00:14", evidence: "Okay, so that's 4111 1111 1111 1111, right?", reason: "Agent repeated the full card number aloud." },
    { check_id: "no_refund_promise", verdict: "pass", severity: "normal", evidence: "No refund promised" },
    { check_id: "further_help", verdict: "pass", severity: "normal", timestamp: "00:25", evidence: "Is there anything else I can help with?" },
    { check_id: "closing", verdict: "pass", severity: "normal", timestamp: "00:27", evidence: "Thanked customer, used brand name" },
  ],
};

const CALL_CLEAN: DemoCall = {
  id: "148",
  agent: "Maria",
  duration: "0:17",
  scorecard: "Bank Support v2",
  audio: sample("148"),
  lines: [
    { time: "00:00", speaker: "Agent", text: "Thank you for calling BankCo, this is Maria. May I have your account ID and date of birth to verify you?" },
    { time: "00:07", speaker: "Customer", text: "Sure, it's AC-48291, June 4 1990." },
    { time: "00:13", speaker: "Agent", text: "Is there anything else I can help with? Thanks for calling BankCo!" },
  ],
  results: BANK_SUPPORT_V2.map((c) => ({ check_id: c.id, verdict: "pass" as const, severity: c.critical ? ("critical" as const) : ("normal" as const) })),
};

const CALL_BORDERLINE: DemoCall = {
  id: "149",
  agent: "Rico",
  duration: "0:07",
  scorecard: "Bank Support v2",
  audio: sample("149"),
  lines: [
    { time: "00:00", speaker: "Agent", text: "Hello, how can I help?" },
    { time: "00:02", speaker: "Customer", text: "This is so frustrating, nobody helps me." },
    { time: "00:05", speaker: "Agent", text: "Okay noted." },
  ],
  results: [
    { check_id: "greeting", verdict: "fail", severity: "normal", reason: "No name or company given." },
    { check_id: "verify_identity", verdict: "not_applicable", severity: "critical" },
    { check_id: "empathy", verdict: "fail", severity: "normal", timestamp: "00:05", evidence: "Okay noted." },
    { check_id: "no_card_readback", verdict: "pass", severity: "critical" },
    { check_id: "no_refund_promise", verdict: "pass", severity: "normal" },
    { check_id: "further_help", verdict: "pass", severity: "normal" },
    { check_id: "closing", verdict: "pass", severity: "normal" },
  ],
};

export const DEMO_CALLS: DemoCall[] = [CALL_147, CALL_CLEAN, CALL_BORDERLINE];

export function demoScore(call: DemoCall) {
  return scoreCall(BANK_SUPPORT_V2, call.results);
}
