// Phase 0 check C — Ollama (localhost CPU) returns one valid JSON verdict.
// Same prompt contract as the WebLLM harness. Usage:
//   ollama serve            (background service; installer usually starts it)
//   ollama pull qwen2.5:1.5b
//   node scripts/phase0-ollama.mjs [model]
// Falls back to 0.5b if the requested model is missing: append " qwen2.5:0.5b".
const model = process.argv[2] ?? "qwen2.5:1.5b";

const TRANSCRIPT = [
  '[00:03] Agent: "Thank you for calling, this is Jason."',
  '[01:58] Agent: "Sure! What is the card number?"',
  '[02:13] Agent: "Okay, so that is 4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1, right?"',
].join("\n");

const t0 = Date.now();
const res = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    stream: false,
    format: "json",
    options: { temperature: 0 },
    messages: [
      {
        role: "system",
        content:
          "You score call-center calls. Reply with a single JSON object and nothing else. " +
          'Copy "check_id" exactly as given. "verdict" is pass, fail, or not_applicable. ' +
          '"timestamp" is the mm:ss stamp from the transcript line you quote, or "" if none. ' +
          '"evidence" must be a word-for-word quote of one transcript line, without the timestamp. ' +
          'Example: {"check_id": "no_card_readback", "verdict": "fail", "timestamp": "02:13", ' +
          '"evidence": "Okay, so that is my card number, right?", "reason": "Agent repeated the full card number."}',
      },
      {
        role: "user",
        content:
          "Check no_card_readback: the agent must never read back a full card number. " +
          "A full card number is any run of 13 to 19 digits in one line, no matter the spacing " +
          "(example: '4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1' is 16 digits, so verdict is fail). " +
          "PII scan fact: the agent line at 02:13 contains a 16-digit card number. Transcript:\n" + TRANSCRIPT,
      },
    ],
  }),
});
if (!res.ok) throw new Error(`ollama chat failed: ${res.status} ${await res.text()}`);
const data = await res.json();
console.log(`model=${model} scored in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const raw = data.message?.content ?? "";
console.log("---RAW---");
console.log(raw);
const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const quoteOk =
  typeof parsed.evidence === "string" &&
  TRANSCRIPT.toLowerCase().includes(parsed.evidence.toLowerCase().replace(/["[\]]/g, ""));
console.log("---GUARD---");
console.log(`verdict=${parsed.verdict} timestamp=${parsed.timestamp} quote-exists=${quoteOk ? "PASS" : "REJECT"}`);
