// The sound mix, and how it makes room for the voiceover. The music is two stems: mid
// (what both speakers share: bass, kick, the dry notes) and side (what differs between
// them: the width of the pad, the echoes). While the voice is speaking the mid stem
// drops well back and the side stem comes up, so the music opens out to the sides and
// leaves the middle to the voice. Between lines it closes back in at full level.

import { transcript } from "./transcript";

// Volumes while nobody is speaking, and while the voiceover is.
export const MIX = {
  musicMid: { idle: 0.85, voice: 0.22 },
  musicSide: { idle: 1, voice: 1.2 },
  effects: { idle: 0.8, voice: 0.5 },
} as const;

// The side stem is stored this much louder than it really is, which leaves room to
// widen it without a volume above 1. Keep in sync with scripts/make-audio.mjs.
const SIDE_FILE_GAIN = 2;

// Words closer together than this (seconds) count as one stretch of speech.
const SAME_LINE_GAP = 0.6;
// The music starts moving this long before a line and settles this long after it.
const LEAD = 0.3;
const TAIL = 0.6;

const speech: { from: number; to: number }[] = [];
for (const caption of transcript.captions) {
  const from = caption.startMs / 1000;
  const to = caption.endMs / 1000;
  const last = speech[speech.length - 1];
  if (last && from - last.to < SAME_LINE_GAP) last.to = Math.max(last.to, to);
  else speech.push({ from, to });
}

const smoothstep = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

// 0 while nobody is speaking, 1 while the voiceover is, easing between the two.
export const voicePresence = (seconds: number): number => {
  let presence = 0;
  for (const { from, to } of speech) {
    const rise = smoothstep((seconds - (from - LEAD)) / LEAD);
    const fall = 1 - smoothstep((seconds - to) / TAIL);
    presence = Math.max(presence, Math.min(rise, fall));
  }
  return presence;
};

const between = (level: { idle: number; voice: number }, seconds: number) =>
  level.idle + (level.voice - level.idle) * voicePresence(seconds);

export const musicMidVolume = (seconds: number) =>
  between(MIX.musicMid, seconds);
export const musicSideVolume = (seconds: number) =>
  between(MIX.musicSide, seconds) / SIDE_FILE_GAIN;
export const effectsVolume = (seconds: number) => between(MIX.effects, seconds);
