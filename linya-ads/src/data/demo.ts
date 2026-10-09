// All sample data shown in the ad. Copied from the app's mock calls
// (frontend/src/mock.ts) and its scorecard preset (frontend/src/lib/scorecard.ts).
// The calls are scripted and the verdicts hand-written: sample data, not model output
// and not a benchmark. Edit here and every scene follows.

export type Verdict = "pass" | "fail" | "not_applicable";

export interface Check {
  id: string;
  label: string;
  weight: number;
  critical: boolean;
}

export interface CheckResult {
  check_id: string;
  verdict: Verdict;
  timestamp?: string;
}

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
  file: string;
  lines: TranscriptLine[];
  results: CheckResult[];
}

// Bank Support v2: weights sum to 100.
export const CHECKS: Check[] = [
  {
    id: "greeting",
    label: "Greets the customer with own name and company",
    weight: 10,
    critical: false,
  },
  {
    id: "verify_identity",
    label: "Verifies identity before discussing the account",
    weight: 18,
    critical: true,
  },
  {
    id: "empathy",
    label: "Shows empathy when the customer is upset",
    weight: 14,
    critical: false,
  },
  {
    id: "no_card_readback",
    label: "Never reads back a full card number",
    weight: 20,
    critical: true,
  },
  {
    id: "no_refund_promise",
    label: "Never promises a refund without approval",
    weight: 12,
    critical: false,
  },
  {
    id: "further_help",
    label: "Offers further help before closing",
    weight: 12,
    critical: false,
  },
  {
    id: "closing",
    label: "Closes properly: thanks the customer, uses brand name",
    weight: 14,
    critical: false,
  },
];

const allPass: CheckResult[] = CHECKS.map((c) => ({
  check_id: c.id,
  verdict: "pass",
}));

export const CALLS: DemoCall[] = [
  {
    id: "147",
    agent: "Jason",
    duration: "0:31",
    scorecard: "Bank Support v2",
    file: "call-147.m4a",
    lines: [
      {
        time: "00:00",
        speaker: "Agent",
        text: "Thank you for calling, this is Jason.",
      },
      {
        time: "00:03",
        speaker: "Customer",
        text: "Hi, I want to dispute a charge on my card.",
      },
      {
        time: "00:06",
        speaker: "Agent",
        text: "Sure! What's the card number?",
      },
      { time: "00:09", speaker: "Customer", text: "It's 4111 1111 1111 1111." },
      {
        time: "00:14",
        speaker: "Agent",
        text: "Okay, so that's 4111 1111 1111 1111, right?",
      },
      {
        time: "00:22",
        speaker: "Agent",
        text: "I understand how frustrating that is.",
      },
      {
        time: "00:25",
        speaker: "Agent",
        text: "Is there anything else I can help with?",
      },
      {
        time: "00:27",
        speaker: "Agent",
        text: "Thanks for calling BankCo, bye!",
      },
    ],
    results: [
      { check_id: "greeting", verdict: "pass", timestamp: "00:00" },
      { check_id: "verify_identity", verdict: "fail", timestamp: "00:06" },
      { check_id: "empathy", verdict: "pass", timestamp: "00:22" },
      { check_id: "no_card_readback", verdict: "fail", timestamp: "00:14" },
      { check_id: "no_refund_promise", verdict: "pass" },
      { check_id: "further_help", verdict: "pass", timestamp: "00:25" },
      { check_id: "closing", verdict: "pass", timestamp: "00:27" },
    ],
  },
  {
    id: "148",
    agent: "Maria",
    duration: "0:17",
    scorecard: "Bank Support v2",
    file: "call-148.m4a",
    lines: [
      {
        time: "00:00",
        speaker: "Agent",
        text: "Thank you for calling BankCo, this is Maria. May I have your account ID and date of birth to verify you?",
      },
      {
        time: "00:07",
        speaker: "Customer",
        text: "Sure, it's AC-48291, June 4 1990.",
      },
      {
        time: "00:13",
        speaker: "Agent",
        text: "Is there anything else I can help with? Thanks for calling BankCo!",
      },
    ],
    results: allPass,
  },
  {
    id: "149",
    agent: "Rico",
    duration: "0:07",
    scorecard: "Bank Support v2",
    file: "call-149.m4a",
    lines: [
      { time: "00:00", speaker: "Agent", text: "Hello, how can I help?" },
      {
        time: "00:02",
        speaker: "Customer",
        text: "This is so frustrating, nobody helps me.",
      },
      { time: "00:05", speaker: "Agent", text: "Okay noted." },
    ],
    results: [
      { check_id: "greeting", verdict: "fail" },
      { check_id: "verify_identity", verdict: "not_applicable" },
      { check_id: "empathy", verdict: "fail", timestamp: "00:05" },
      { check_id: "no_card_readback", verdict: "pass" },
      { check_id: "no_refund_promise", verdict: "pass" },
      { check_id: "further_help", verdict: "pass" },
      { check_id: "closing", verdict: "pass" },
    ],
  },
];

// The call the how-it-works scenes walk through.
export const FEATURED_CALL: DemoCall = CALLS[0];

// The customer line the problem scene quotes, unredacted on purpose: it is the
// sensitive detail a recording carries. 4111 1111 1111 1111 is the standard test number.
export const SENSITIVE_LINE: TranscriptLine = FEATURED_CALL.lines[3];

// Shown beside every recreated app screen.
export const SAMPLE_NOTE = "Sample calls, scripted data";
