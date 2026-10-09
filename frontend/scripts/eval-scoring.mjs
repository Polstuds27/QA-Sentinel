// Measures the scoring prompt against labelled transcripts, using the app's real
// scoring code (src/ai/ollama.ts) and the local model. Needs `ollama serve` running.
//
//   node scripts/eval-scoring.mjs            # both sets
//   node scripts/eval-scoring.mjs dev        # the set the prompt was tuned on
//   node scripts/eval-scoring.mjs holdout    # looked at once while tuning
//   node scripts/eval-scoring.mjs final      # written after the prompt was frozen; the number to quote
//   node scripts/eval-scoring.mjs holdout 3  # repeat 3 times to see run-to-run drift
//
// The transcripts are scripted by the team, in the shape Whisper produces. This is a
// regression check for prompt changes, not a benchmark of real calls: quote its numbers
// only with that caveat. Tune on `dev`; report `final`, and add new cases there rather
// than adjusting the prompt to fit it.
import { scoreCheck, SCORING_MODEL } from "../src/ai/ollama.ts";
import { BANK_SUPPORT_V2 } from "../src/lib/scorecard.ts";
import { findCardHits } from "../src/lib/pii.ts";

const P = "pass", F = "fail", NA = "not_applicable";
// expected: one entry per check, in scorecard order:
// greeting, verify_identity, empathy, no_card_readback, no_refund_promise, further_help, closing.
// An array means either verdict is acceptable.
const CASES = [
  { set: "dev", name: "card read back, no identity check", expected: [P, F, P, F, P, P, P], lines: [
    ["A", "Thank you for calling. This is Jason."], ["C", "Hi, I want to dispute a charge on my card."], ["A", "Sure, what's the card number?"],
    ["C", "It's 4111, 11111, 11111, 11111. you"], ["A", "Okay, so that's 411111111111111111, right?"],
    ["A", "I understand how frustrating that is. Is there anything else I can help with?"], ["A", "Thanks for calling Bankco, bye."]] },
  { set: "dev", name: "clean short call", expected: [P, P, [NA, P], P, P, P, P], lines: [
    ["A", "Thank you for calling Bankco, this is Maria. May I have your account ID and date of birth to verify you?"],
    ["C", "Sure, it's AC48291, June 4th, 1990."], ["A", "Is there anything else I can help with? Thanks for calling Bankco."]] },
  { set: "dev", name: "cold agent", expected: [F, [NA, F], F, P, P, F, F], lines: [
    ["A", "Hello, how can I help?"], ["C", "This is so frustrating, nobody helps me."], ["A", "Okay, noted."]] },
  { set: "dev", name: "refund promised", expected: [P, P, P, P, F, P, P], lines: [
    ["A", "Good afternoon, BankCo support, Liza speaking. Can I get your date of birth and account ID to verify you?"],
    ["C", "March 3, 1988, account AC-11872."], ["A", "Thank you, you're verified. How can I help?"],
    ["C", "I was charged twice for one purchase, I'm really annoyed."],
    ["A", "I'm sorry about that, I know that's annoying. Don't worry, I'll make sure you get a full refund today."],
    ["C", "Great."], ["A", "Is there anything else I can help you with?"], ["C", "No."], ["A", "Thank you for calling BankCo, have a nice day."]] },
  { set: "dev", name: "upset customer ignored, no offer of help", expected: [P, P, F, P, P, F, P], lines: [
    ["A", "Thanks for calling BankCo, this is Paolo. Before we start, can you confirm your date of birth?"],
    ["C", "July 9, 1985. I've been on hold for forty minutes, this is ridiculous!"], ["A", "What is the issue with your account?"],
    ["C", "My card was declined at the store."], ["A", "Your card was blocked for a suspicious transaction. I have unblocked it."],
    ["C", "Fine."], ["A", "Thank you for calling BankCo. Goodbye."]] },
  { set: "dev", name: "customer says card, agent does not repeat it, no agent name", expected: [F, P, NA, P, P, P, P], lines: [
    ["A", "BankCo customer service, how may I help you today?"], ["C", "I'd like to check my card balance."],
    ["A", "Sure. For security, what's your mother's maiden name?"], ["C", "Santos."], ["A", "Thanks. And the card number please?"],
    ["C", "5500 0000 0000 0004."], ["A", "Got it, the card ending in 0004 has a balance of twelve thousand pesos."],
    ["C", "Thanks."], ["A", "Anything else I can do for you?"], ["C", "No, that's all."], ["A", "Thank you for calling BankCo, take care."]] },

  { set: "holdout", name: "verified, then card read back, bare goodbye", expected: [P, P, NA, F, P, P, F], lines: [
    ["A", "Hello, thank you for calling BankCo, my name is Carlo. May I have your account ID to verify your identity?"],
    ["C", "It's AC-77410."], ["A", "Thank you. What can I do for you?"],
    ["C", "I need to update the card on file. The new one is 4012 8888 8888 1881."],
    ["A", "Let me repeat that: 4012 8888 8888 1881. Is that correct?"], ["C", "Yes."],
    ["A", "Done. Will there be anything else?"], ["C", "No."], ["A", "Okay, bye."]] },
  { set: "holdout", name: "account discussed with no identity check, refund handled properly", expected: [P, F, P, P, P, P, P], lines: [
    ["A", "Good morning, this is Bea from BankCo."], ["C", "Hi, there's a charge on my account I don't recognize and I'm quite worried."],
    ["A", "I completely understand, that would worry me too. I can see the charge of two thousand pesos on your account from yesterday."],
    ["C", "Can I get my money back?"], ["A", "I can file a dispute for review, but I can't promise a refund until it is approved."],
    ["C", "Okay."], ["A", "Is there anything else you need help with?"], ["C", "No thanks."], ["A", "Thank you for calling BankCo, have a great day."]] },
  { set: "holdout", name: "furious customer, curt agent", expected: [P, NA, F, P, P, F, F], lines: [
    ["A", "Support, Mark speaking."], ["C", "Your app has been down all day and I can't pay my bills, I am furious!"],
    ["A", "The app is under maintenance."], ["C", "That's it? No apology?"], ["A", "It will be back tomorrow."],
    ["C", "Unbelievable."], ["A", "Thanks, bye."]] },
  { set: "holdout", name: "model call", expected: [P, P, P, P, P, P, P], lines: [
    ["A", "Thank you for calling BankCo, this is Ana. To verify your identity, could you tell me your date of birth?"],
    ["C", "October 12, 1992."], ["A", "Thank you, Ms. Reyes. How can I help?"], ["C", "I lost my card and I'm stressed out about it."],
    ["A", "I'm so sorry to hear that, I know losing a card is stressful. I've blocked the card and a replacement will arrive in five days."],
    ["C", "Thank you."], ["A", "Is there anything else I can help you with today?"], ["C", "No, that's it."],
    ["A", "Thank you for calling BankCo. Have a wonderful day!"]] },
  { set: "holdout", name: "refund guaranteed and card read back", expected: [P, F, NA, F, F, P, P], lines: [
    ["A", "Hi, this is Dan."], ["C", "I want a refund for a wrong charge on card 4242 4242 4242 4242."],
    ["A", "Okay, card 4242 4242 4242 4242, yes you will get your money back within three days, guaranteed."],
    ["C", "Thanks."], ["A", "Anything else?"], ["C", "No."], ["A", "Thank you for calling BankCo."]] },
  { set: "holdout", name: "general enquiry, nameless greeting", expected: [F, NA, NA, P, P, F, P], lines: [
    ["A", "Good day, you've reached BankCo."], ["C", "Hi, I want to know my branch's opening hours."],
    ["A", "The branch is open from nine to five on weekdays."], ["C", "Thanks."], ["A", "Thank you for calling BankCo, goodbye."]] },

  // Written after the prompt was frozen and never used to adjust it.
  { set: "final", name: "fraud scare handled well", expected: [P, P, P, P, P, P, P], lines: [
    ["A", "BankCo, good evening, Rhea speaking. How can I help?"], ["C", "I think someone used my card without my permission, I'm scared."],
    ["A", "I'm sorry, that sounds scary. Let me help. First, can you tell me your date of birth and account ID?"], ["C", "May 2, 1991, AC-55021."],
    ["A", "Thank you. I've blocked the card and opened a fraud report."], ["C", "Thank you so much."],
    ["A", "Is there anything else I can assist you with?"], ["C", "No."], ["A", "Thank you for calling BankCo. Stay safe."]] },
  { set: "final", name: "careless agent", expected: [F, F, NA, P, P, F, F], lines: [
    ["A", "Yes, hello?"], ["C", "Hi, is this BankCo? I need my balance."], ["A", "Your balance is eight thousand pesos."], ["C", "Okay thanks."], ["A", "Bye."]] },
  { set: "final", name: "late fee argument, refund promised", expected: [P, P, F, P, F, F, P], lines: [
    ["A", "Thank you for calling BankCo, I'm Joel. Could you give me your account ID for verification?"],
    ["C", "AC-30911. You people charged me a late fee I don't owe, this is so unfair!"], ["A", "The fee was applied because the payment arrived on the sixth."],
    ["C", "I paid on time!"], ["A", "I will refund the fee right now, you'll have the money back tomorrow."], ["C", "Finally."], ["A", "Thanks for calling BankCo."]] },
  { set: "final", name: "card activation, last four only", expected: [P, [P, F], NA, P, P, P, P], lines: [
    ["A", "Good morning, BankCo card services, this is Tina."], ["C", "Morning. I'd like to activate my new card, the number is 4539 1488 0343 6467."],
    ["A", "Thanks. To confirm, the card ending in 6467. Can you verify your date of birth?"], ["C", "August 20, 1979."],
    ["A", "Your card is now active. Do you need help with anything else?"], ["C", "That's all."], ["A", "Thank you for choosing BankCo. Goodbye."]] },
  { set: "final", name: "password reset, weak ending", expected: [P, P, P, P, P, F, F], lines: [
    ["A", "Hello, this is Sam from BankCo support."], ["C", "My online banking password isn't working and I'm getting really frustrated."],
    ["A", "I understand, that's frustrating. Let me reset it. What is your mother's maiden name?"], ["C", "Cruz."],
    ["A", "Done, you'll get an email shortly."], ["C", "Thanks."], ["A", "You're welcome. Have a good day."]] },
  { set: "final", name: "dispute with card read back, no name", expected: [F, F, NA, F, P, P, P], lines: [
    ["A", "Thank you for calling BankCo. How can I help you?"], ["C", "I want to dispute a transaction. My card number is 6011 0009 9013 9424."],
    ["A", "I have it: 6011 0009 9013 9424. Which transaction?"], ["C", "The one for five hundred pesos at a gas station."],
    ["A", "I've filed the dispute. It will be reviewed within ten days."], ["C", "Okay."], ["A", "Anything else I can help with today?"], ["C", "No."], ["A", "Thanks for calling BankCo!"]] },
];

const [only, repeatArg, debugArg] = process.argv.slice(2);
const nameFilter = process.env.CASE; // CASE="furious" runs only cases whose name contains that text
if (debugArg === "debug") globalThis.SCORING_DEBUG = true;
const repeats = Number(repeatArg) || 1;
const stamp = (i) => `${String(Math.floor((i * 4) / 60)).padStart(2, "0")}:${String((i * 4) % 60).padStart(2, "0")}`;
const totals = {};
const misses = [];
const started = Date.now();

for (let run = 0; run < repeats; run++) {
  for (const c of CASES.filter((c) => (!only || only === "all" || c.set === only) && (!nameFilter || c.name.includes(nameFilter)))) {
    if (globalThis.SCORING_DEBUG) console.log(`\n# ${c.name}`);
    const lines = c.lines.map(([who, text], i) => ({ time: stamp(i), speaker: who === "A" ? "Agent" : "Customer", text }));
    const transcript = lines.map((l) => `[${l.time}] ${l.speaker}: "${l.text}"`).join("\n");
    const facts = lines.flatMap((l) => findCardHits(l.text).map((h) => `Line ${l.time} (${l.speaker}) contains a ${h.digits.length}-digit card number ending ${h.last4}.`));
    for (let i = 0; i < BANK_SUPPORT_V2.length; i++) {
      const check = BANK_SUPPORT_V2[i];
      const want = [c.expected[i]].flat();
      if (globalThis.SCORING_DEBUG) console.log(`  ${check.id} (want ${want.join("/")})`);
      let got = "error", detail = "";
      try {
        const r = await scoreCheck(check, transcript, facts);
        got = r.verdict;
        detail = `"${(r.evidence ?? "").slice(0, 50)}" ${r.reason ?? ""}`;
      } catch (e) {
        detail = String(e).slice(0, 120);
      }
      const t = (totals[c.set] ??= { ok: 0, n: 0, byCheck: {} });
      const b = (t.byCheck[check.id] ??= { ok: 0, n: 0 });
      t.n++; b.n++;
      if (want.includes(got)) { t.ok++; b.ok++; }
      else misses.push(`  [${c.set}] ${c.name} / ${check.id}: wanted ${want.join(" or ")}, got ${got}  ${detail.slice(0, 150)}`);
    }
  }
}

console.log(`model ${SCORING_MODEL}, ${repeats} run(s), ${((Date.now() - started) / 1000).toFixed(0)}s`);
for (const [set, t] of Object.entries(totals)) {
  console.log(`\n${set}: ${t.ok}/${t.n} verdicts as expected (${Math.round((100 * t.ok) / t.n)}%)`);
  console.log("  " + Object.entries(t.byCheck).map(([id, b]) => `${id} ${b.ok}/${b.n}`).join(" · "));
}
if (misses.length) console.log(`\nmisses:\n${misses.join("\n")}`);
