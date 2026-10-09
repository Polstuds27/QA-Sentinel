// Ollama scoring client (localhost CPU). Browser calls need
// OLLAMA_ORIGINS to include the dev origin (set: http://localhost:5173).
// Model choice is measured, not guessed: qwen2.5:3b judges correctly,
// 1.5b quotes well but misjudges criticals. See docs/LOCAL_AI_PLAN.md.
import { findCardHits } from "../lib/pii.ts";
import { BANK_SUPPORT_V2, type Check, type CheckResult, type Verdict } from "../lib/scorecard.ts";

export const OLLAMA_URL = "http://localhost:11434";
export const SCORING_MODEL = "qwen2.5:3b";

export async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

// How scoring works: the model is never asked for a verdict. A small model reasons well
// about a narrow question but often picks a verdict label that contradicts its own
// reasoning. So each check is broken into yes/no "probes". Each probe is asked on its own,
// and is shown only the lines that can answer it (the agent's lines, the customer's lines,
// or just the first or last agent line), which removes "who said it" mistakes. The model
// gives one sentence of reasoning, then true or false, then the number of the line it
// relied on, and the verdict is worked out here in code. Reasoning has to come first:
// asked to quote first, this model returns an empty quote and then argues for "false".
// `scripts/eval-scoring.mjs` measures any change to this file.

const SYSTEM =
  "You answer one yes/no question about lines from a call-center call. " +
  'Reply in JSON with three fields in this order: "why", "answer", "line". ' +
  '"why": one short sentence that looks at what the lines actually say. ' +
  '"answer": true or false, agreeing with "why". ' +
  '"line": the number of the ONE line that best supports your answer, or 0 if the answer is false.';

interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

/** Which lines a probe is shown. Falls back to every line when the speakers are unknown (mono recording). */
type Scope = "agent" | "customer" | "first_agent" | "last_agent";

interface Probe {
  key: string;
  scope: Scope;
  ask: string;
}

interface Answer {
  yes: boolean;
  /** The transcript line the model quoted for this probe, if it is really in the transcript. */
  line?: TranscriptLine;
  quote: string;
}

interface Outcome {
  verdict: Verdict;
  reason: string;
  /** Line to show as evidence. Omitted when the verdict is about something never said. */
  line?: TranscriptLine;
  quote?: string;
}

interface Plan {
  probes: Probe[];
  decide(a: Record<string, Answer>, ctx: { lines: TranscriptLine[]; firstAgent?: TranscriptLine; lastAgent?: TranscriptLine }): Outcome;
}

const ACCOUNT_WORDS = /\b(card|account|balance|charge[ds]?|transaction|payment|statement|loan|deposit|withdraw\w*|refund|fee|password)\b/i;

const IDENTITY_WORDS = /\b(date of birth|birth ?date|birthday|account id|maiden name|security question|verify you|verify your identity|confirm your identity|for verification)\b/i;

const shown = (a: Answer) => ({ line: a.line, quote: a.line ? a.quote : "" });

// Preset checks: what to ask and how the answers become a verdict.
const PLANS: Record<string, Plan> = {
  greeting: {
    probes: [
      {
        key: "gives_name",
        scope: "first_agent",
        ask:
          "Does the speaker say their own first name in this line? " +
          "A line may also name a company; that still counts as long as a person's name is given.",
      },
    ],
    decide: (a, ctx) =>
      a.gives_name.yes
        ? { verdict: "pass", reason: "The agent's greeting gives their own name.", line: ctx.firstAgent, quote: ctx.firstAgent?.text }
        : { verdict: "fail", reason: "The agent's greeting does not give their own name.", line: ctx.firstAgent, quote: ctx.firstAgent?.text },
  },
  verify_identity: {
    probes: [
      {
        key: "asks_identity",
        scope: "agent",
        ask:
          "Does any line ask the customer to prove who they are, by asking for their date of birth, account ID, " +
          "mother's maiden name, or a security question? Asking for a card number does NOT count.",
      },
    ],
    decide: (a, ctx) => {
      // Whether the call touches a card or account is a matter of vocabulary, so it is read
      // from the words (English only) rather than asked of the model, which wavered on it.
      const touchesAccount = (l: TranscriptLine) => ACCOUNT_WORDS.test(l.text) || findCardHits(l.text).length > 0;
      // Backstop for the model saying "no" to a plainly worded identity question (seen in testing).
      const asked = a.asks_identity.line ?? ctx.lines.find((l) => l.speaker === "Agent" && IDENTITY_WORDS.test(l.text));
      const agentDetail = ctx.lines.find((l) => l.speaker === "Agent" && l !== asked && touchesAccount(l));
      if (asked) {
        const before = !agentDetail || ctx.lines.indexOf(asked) < ctx.lines.indexOf(agentDetail);
        return before
          ? { verdict: "pass", reason: "The agent asked an identity question before going into card or account details.", line: asked, quote: asked.text }
          : { verdict: "fail", reason: "The agent went into card or account details before asking an identity question.", line: agentDetail, quote: agentDetail?.text };
      }
      const anyDetail = agentDetail ?? ctx.lines.find(touchesAccount);
      if (anyDetail)
        return { verdict: "fail", reason: "Card or account details were discussed and the agent never asked an identity question.", line: anyDetail, quote: anyDetail.text };
      return { verdict: "not_applicable", reason: "No card or account details were discussed, so there was nothing to verify for." };
    },
  },
  empathy: {
    probes: [
      {
        key: "customer_upset",
        scope: "customer",
        ask:
          "Does any line show the customer is emotionally upset in their own words, for example angry, frustrated, worried or stressed? " +
          "Simply describing a problem, asking for something, or a short answer like 'No.' is NOT being upset.",
      },
      {
        key: "acknowledges",
        scope: "agent",
        ask:
          "Does any line express sympathy or understanding for how the customer feels, such as an apology or saying they understand? " +
          "Stating facts or giving a status is NOT sympathy.",
      },
    ],
    decide: (a) => {
      if (a.acknowledges.yes && a.acknowledges.line)
        return { verdict: "pass", reason: "The agent acknowledged how the customer felt.", ...shown(a.acknowledges) };
      if (a.customer_upset.yes && a.customer_upset.line)
        return { verdict: "fail", reason: "The customer was upset and the agent did not acknowledge it.", ...shown(a.customer_upset) };
      return { verdict: "not_applicable", reason: "The customer did not sound upset." };
    },
  },
  no_card_readback: {
    probes: [
      {
        key: "agent_says_card",
        scope: "agent",
        ask:
          "Does any line contain a full card number, meaning a run of 13 to 19 digits? " +
          "Dates, account IDs, amounts and the last four digits of a card are not a full card number.",
      },
    ],
    decide: (a) =>
      a.agent_says_card.yes && a.agent_says_card.line
        ? { verdict: "fail", reason: "The agent said a full card number aloud.", ...shown(a.agent_says_card) }
        : { verdict: "pass", reason: "No agent line contains a full card number." },
  },
  no_refund_promise: {
    probes: [
      {
        key: "promises_refund",
        scope: "agent",
        ask:
          "Does any line promise or guarantee that the customer WILL get a refund or their money back? " +
          "Saying a refund has to be reviewed or approved, or that it cannot be promised, is NOT a promise.",
      },
    ],
    decide: (a) =>
      a.promises_refund.yes && a.promises_refund.line
        ? { verdict: "fail", reason: "The agent promised a refund.", ...shown(a.promises_refund) }
        : { verdict: "pass", reason: "The agent did not promise a refund." },
  },
  further_help: {
    probes: [
      {
        key: "offers_more_help",
        scope: "agent",
        ask:
          "Does any line ask whether the customer needs anything else or any more help before ending the call?",
      },
    ],
    decide: (a, ctx) =>
      a.offers_more_help.yes && a.offers_more_help.line
        ? { verdict: "pass", reason: "The agent offered further help.", ...shown(a.offers_more_help) }
        : { verdict: "fail", reason: "The agent never offered further help.", line: ctx.lastAgent, quote: ctx.lastAgent?.text },
  },
  closing: {
    probes: [
      { key: "thanks", scope: "last_agent", ask: "Does this line thank the listener?" },
      { key: "names_company", scope: "last_agent", ask: "Does this line say the name of a company, bank or brand?" },
    ],
    decide: (a, ctx) => {
      const base = { line: ctx.lastAgent, quote: ctx.lastAgent?.text };
      if (a.thanks.yes && a.names_company.yes) return { verdict: "pass", reason: "The agent's last line thanks the customer and names the company.", ...base };
      const missing = [!a.thanks.yes && "a thank-you", !a.names_company.yes && "the company name"].filter(Boolean).join(" and ");
      return { verdict: "fail", reason: `The agent's last line is missing ${missing}.`, ...base };
    },
  },
};

// A custom or reworded check: one question built from its wording and the analyst's note.
function customPlan(check: Check): Plan {
  const note = check.guide?.trim() ? ` How to judge it: ${check.guide.trim()}` : "";
  return {
    probes: [{ key: "agent_does_it", scope: "agent", ask: `Does any line show the agent doing this: "${check.label}"?${note}` }],
    decide: (a) => {
      const did = a.agent_does_it.yes && !!a.agent_does_it.line;
      if (check.kind === "must_do")
        return did
          ? { verdict: "pass", reason: "An agent line does this.", ...shown(a.agent_does_it) }
          : { verdict: "fail", reason: "No agent line does this." };
      return did
        ? { verdict: "fail", reason: "An agent line does this, which the rule forbids.", ...shown(a.agent_does_it) }
        : { verdict: "pass", reason: "No agent line does this." };
    },
  };
}

function planFor(check: Check): Plan {
  // The built-in plan only fits while a preset check keeps its original wording and has
  // no note of its own; once the analyst rewrites it, ask about their wording instead.
  const preset = BANK_SUPPORT_V2.find((c) => c.id === check.id);
  const untouched = preset && preset.label === check.label && preset.kind === check.kind && !check.guide?.trim();
  return (untouched && PLANS[check.id]) || customPlan(check);
}

function parseTranscript(transcript: string): TranscriptLine[] {
  return [...transcript.matchAll(/^\[(\d\d:\d\d)\] (\w+): "(.*)"$/gm)].map((m) => ({
    time: m[1],
    speaker: m[2],
    text: m[3],
  }));
}

const SCOPE_INTRO: Record<Scope, string> = {
  agent: "Lines spoken by the AGENT during the call",
  customer: "Lines spoken by the CUSTOMER during the call",
  first_agent: "The first line the AGENT says in the call",
  last_agent: "The last line the AGENT says in the call",
};

function scoped(scope: Scope, lines: TranscriptLine[]): { intro: string; shown: TranscriptLine[] } {
  const agent = lines.filter((l) => l.speaker === "Agent");
  const customer = lines.filter((l) => l.speaker === "Customer");
  // Mono recording: nobody is labelled, so every probe has to read the whole call.
  if (agent.length === 0) return { intro: "Lines from the call (speakers are not labelled)", shown: lines };
  const shown =
    scope === "agent" ? agent : scope === "customer" ? customer : scope === "first_agent" ? agent.slice(0, 1) : agent.slice(-1);
  return { intro: SCOPE_INTRO[scope], shown };
}

async function askProbe(probe: Probe, lines: TranscriptLine[], piiFacts: string[]): Promise<Answer> {
  const { intro, shown } = scoped(probe.scope, lines);
  if (shown.length === 0) return { yes: false, quote: "" };
  const facts =
    probe.key === "agent_says_card" && piiFacts.length > 0
      ? "Facts from an automatic scan (trust these):\n" + piiFacts.map((f) => `- ${f}`).join("\n") + "\n\n"
      : "";
  // Lines are numbered so the model points at one instead of copying it out, which it does unreliably.
  const user = `${intro}:\n${shown.map((l, i) => `${i + 1}. "${l.text}"`).join("\n")}\n\n${facts}Question: ${probe.ask}`;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: SCORING_MODEL,
      stream: false,
      keep_alive: "30m",
      format: {
        type: "object",
        properties: { why: { type: "string" }, answer: { type: "boolean" }, line: { type: "integer" } },
        required: ["why", "answer", "line"],
      },
      // A long call must fit in the context window or its end is silently cut off:
      // size the window to the prompt (about 3 characters per token), within the model's limit.
      options: { temperature: 0, seed: 7, num_ctx: Math.min(32768, Math.max(4096, Math.ceil((SYSTEM.length + user.length) / 3) + 1024)) },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama chat failed: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const raw: string = data.message?.content ?? "";
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { why?: unknown; answer?: unknown; line?: unknown };
  const yes = parsed.answer === true;
  // `node scripts/eval-scoring.mjs … debug` prints each probe's reasoning.
  if ((globalThis as { SCORING_DEBUG?: boolean }).SCORING_DEBUG) console.log(`    · ${probe.key}=${yes} line ${String(parsed.line)}: ${String(parsed.why)}`);
  // The evidence is always a real transcript line, picked by number: nothing the model
  // writes is ever shown as a quote, so a quote cannot be invented.
  const picked = shown.length === 1 ? shown[0] : typeof parsed.line === "number" ? shown[parsed.line - 1] : undefined;
  const line = yes ? picked : undefined;
  return { yes, line, quote: line?.text ?? "" };
}

export async function scoreCheck(
  check: Check,
  transcript: string,
  piiFacts: string[],
): Promise<CheckResult> {
  const lines = parseTranscript(transcript);
  const plan = planFor(check);
  const ctx = {
    lines,
    firstAgent: lines.find((l) => l.speaker === "Agent"),
    lastAgent: lines.findLast((l) => l.speaker === "Agent"),
  };
  const answers: Record<string, Answer> = {};
  for (const probe of plan.probes) {
    if (probe.key === "agent_says_card") {
      // A card number is digits, not a matter of opinion: the detector answers this probe.
      // With labelled speakers the model is not asked at all; on a mono recording it is
      // asked which line, and a "yes" only stands if that line really holds a card-length number.
      const agentLines = lines.filter((l) => l.speaker === "Agent");
      const hit = agentLines.find((l) => findCardHits(l.text).length > 0);
      if (agentLines.length > 0) {
        answers[probe.key] = { yes: !!hit, line: hit, quote: hit?.text ?? "" };
        continue;
      }
      const guess = await askProbe(probe, lines, piiFacts);
      const real = guess.line && findCardHits(guess.line.text).length > 0;
      answers[probe.key] = real ? guess : { yes: false, quote: "" };
      continue;
    }
    answers[probe.key] = await askProbe(probe, lines, piiFacts);
  }
  const outcome = plan.decide(answers, ctx);
  const speaker = outcome.line?.speaker;
  return {
    check_id: check.id,
    verdict: outcome.verdict,
    severity: check.critical ? "critical" : "normal",
    speaker: speaker === "Agent" ? "agent" : speaker === "Customer" ? "customer" : undefined,
    timestamp: outcome.line?.time ?? "",
    evidence: outcome.quote ?? "",
    reason: outcome.reason,
  };
}
