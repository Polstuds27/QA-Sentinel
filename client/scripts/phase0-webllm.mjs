// Phase 0 check B — WebLLM Qwen2.5-1.5B returns one valid JSON verdict.
// Needs a WebGPU navigator in Node (Node 22+: try --experimental-webgpu if this fails).
// Usage: node scripts/phase0-webllm.mjs
import { CreateMLCEngine } from "@mlc-ai/web-llm";

const TRANSCRIPT = [
  '[00:03] Agent: "Thank you for calling, this is Jason."',
  '[01:58] Agent: "Sure! What is the card number?"',
  "[02:13] Agent: \"Okay, so that is 4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1, right?\"",
].join("\n");

const t0 = Date.now();
const engine = await CreateMLCEngine("Qwen2.5-1.5B-Instruct-q4f16_1-MLC", { logLevel: "SILENT" });
console.log(`engine ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const t1 = Date.now();
const reply = await engine.chat.completions.create({
  temperature: 0,
  messages: [
    {
      role: "system",
      content:
        "You score call-center calls. Reply with a single JSON object and nothing else: " +
        '{"check_id": string, "verdict": "pass" | "fail" | "not_applicable", "timestamp": string, "evidence": string, "reason": string}. ' +
        "evidence must be an exact quote from the transcript.",
    },
    {
      role: "user",
      content:
        'Check no_card_readback: the agent must never read back a full card number. Transcript:\n' + TRANSCRIPT,
    },
  ],
});
console.log(`scored in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

const raw = reply.choices[0]?.message?.content ?? "";
console.log("---RAW---");
console.log(raw);
const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const quoteOk =
  typeof parsed.evidence === "string" &&
  TRANSCRIPT.toLowerCase().includes(parsed.evidence.toLowerCase().replace(/["[\]]/g, ""));
console.log("---GUARD---");
console.log(`verdict=${parsed.verdict} timestamp=${parsed.timestamp} quote-exists=${quoteOk ? "PASS" : "REJECT"}`);
