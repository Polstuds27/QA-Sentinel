// The one line of sample data the animated scenes show. Everything in the demo itself
// is the real app, recorded (src/data/footage.json).

export interface TranscriptLine {
  time: string;
  speaker: "Agent" | "Customer";
  text: string;
}

// The customer line the problem scene quotes, unredacted on purpose: it is the
// sensitive detail a recording carries. It is the line from the scripted test call
// (client/samples/call-147.m4a) with another published test card number in place of
// 4111 1111 1111 1111, so it reads like a real card. Never put a made-up number here:
// random digits could be somebody's card.
export const SENSITIVE_LINE: TranscriptLine = {
  time: "00:09",
  speaker: "Customer",
  text: "It's 4000 0566 5566 5556.",
};
