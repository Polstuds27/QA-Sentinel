import { BANK_SUPPORT_V2, scoreCall, type CheckResult } from "./lib/scorecard";

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface DemoCall {
  id: string;
  agent: string;
  duration: string;
  scorecard: string;
  lines: TranscriptLine[];
  results: CheckResult[];
}

// Spec §05 scenario: Call #147 (critical violations, 62/100 RED).
const CALL_147: DemoCall = {
  id: "147",
  agent: "Jason",
  duration: "4:58",
  scorecard: "Bank Support v2",
  lines: [
    { time: "00:03", speaker: "Agent", text: "Thank you for calling, this is Jason." },
    { time: "01:52", speaker: "Customer", text: "Hi, I want to dispute a charge on my card." },
    { time: "01:58", speaker: "Agent", text: "Sure! What's the card number?" },
    { time: "02:05", speaker: "Customer", text: "It's 4111 1111 1111 1111." },
    { time: "02:13", speaker: "Agent", text: "Okay, so that's 4111 1111 1111 1111, right?" },
    { time: "02:40", speaker: "Agent", text: "I understand how frustrating that is." },
    { time: "04:41", speaker: "Agent", text: "Is there anything else I can help with?" },
    { time: "04:55", speaker: "Agent", text: "Thanks for calling BankCo, bye!" },
  ],
  results: [
    { check_id: "greeting", verdict: "pass", severity: "normal", timestamp: "00:03", evidence: "Thank you for calling, this is Jason." },
    { check_id: "verify_identity", verdict: "fail", severity: "critical", speaker: "agent", timestamp: "01:58", evidence: "Asked for card details with no security question", reason: "No identity verification before account access." },
    { check_id: "empathy", verdict: "pass", severity: "normal", timestamp: "02:40", evidence: "I understand how frustrating that is." },
    { check_id: "no_card_readback", verdict: "fail", severity: "critical", speaker: "agent", timestamp: "02:13", evidence: "Okay, so that's 4111 1111 1111 1111, right?", reason: "Agent repeated the full card number aloud." },
    { check_id: "no_refund_promise", verdict: "pass", severity: "normal", evidence: "No refund promised" },
    { check_id: "further_help", verdict: "pass", severity: "normal", timestamp: "04:41", evidence: "Is there anything else I can help with?" },
    { check_id: "closing", verdict: "pass", severity: "normal", timestamp: "04:55", evidence: "Thanked customer, used brand name" },
  ],
};

const CALL_CLEAN: DemoCall = {
  id: "148",
  agent: "Maria",
  duration: "3:12",
  scorecard: "Bank Support v2",
  lines: [
    { time: "00:02", speaker: "Agent", text: "Thank you for calling BankCo, this is Maria. May I have your account ID and date of birth to verify you?" },
    { time: "00:20", speaker: "Customer", text: "Sure, it's AC-48291, June 4 1990." },
    { time: "02:50", speaker: "Agent", text: "Is there anything else I can help with? Thanks for calling BankCo!" },
  ],
  results: BANK_SUPPORT_V2.map((c) => ({ check_id: c.id, verdict: "pass" as const, severity: c.critical ? ("critical" as const) : ("normal" as const) })),
};

const CALL_BORDERLINE: DemoCall = {
  id: "149",
  agent: "Rico",
  duration: "5:20",
  scorecard: "Bank Support v2",
  lines: [
    { time: "00:15", speaker: "Agent", text: "Hello, how can I help?" },
    { time: "03:00", speaker: "Customer", text: "This is so frustrating, nobody helps me." },
    { time: "03:10", speaker: "Agent", text: "Okay noted." },
  ],
  results: [
    { check_id: "greeting", verdict: "fail", severity: "normal", reason: "No name or company given." },
    { check_id: "verify_identity", verdict: "not_applicable", severity: "critical" },
    { check_id: "empathy", verdict: "fail", severity: "normal", timestamp: "03:10", evidence: "Okay noted." },
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
