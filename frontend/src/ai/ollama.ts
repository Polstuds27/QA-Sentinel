// Ollama scoring client (localhost CPU). Browser calls need
// OLLAMA_ORIGINS to include the dev origin (set: http://localhost:5173).
// Model choice is measured, not guessed: qwen2.5:3b judges correctly,
// 1.5b quotes well but misjudges criticals. See docs/LOCAL_AI_PLAN.md.
import type { Check, CheckResult, Verdict } from "../lib/scorecard";

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

const SYSTEM =
  "You score call-center calls. Reply with a single JSON object and nothing else. " +
  'Copy "check_id" exactly as given. "verdict" is pass, fail, or not_applicable. ' +
  '"timestamp" is the mm:ss stamp from the transcript line you quote, or "" if none. ' +
  '"evidence" must be a word-for-word quote of one transcript line, without the timestamp. ' +
  'Example: {"check_id": "no_card_readback", "verdict": "fail", "timestamp": "02:13", ' +
  '"evidence": "Okay, so that is my card number, right?", "reason": "Agent repeated the full card number."}';

function cardRule(): string {
  return (
    "A full card number is any run of 13 to 19 digits in one line, no matter the spacing " +
    "(example: '4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1' is 16 digits, so verdict is fail). "
  );
}

export async function scoreCheck(
  check: Check,
  transcript: string,
  piiFacts: string[],
): Promise<CheckResult> {
  const duty =
    check.kind === "must_do"
      ? `The agent MUST do this: ${check.label}. If the transcript shows it, verdict is pass.`
      : `The agent must NEVER do this: ${check.label}. ${check.id === "no_card_readback" ? cardRule() : ""}`;
  const facts =
    piiFacts.length > 0 ? "Known PII scan facts:\n" + piiFacts.map((f) => `- ${f}`).join("\n") + "\n" : "";
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SCORING_MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${duty}\n${facts}Transcript:\n${transcript}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama chat failed: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const raw: string = data.message?.content ?? "";
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
    verdict?: string;
    timestamp?: string;
    evidence?: string;
    reason?: string;
  };
  const verdict: Verdict =
    parsed.verdict === "pass" || parsed.verdict === "fail" || parsed.verdict === "not_applicable"
      ? parsed.verdict
      : "not_applicable";
  return {
    check_id: check.id,
    verdict,
    severity: check.critical ? "critical" : "normal",
    timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
    evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}
