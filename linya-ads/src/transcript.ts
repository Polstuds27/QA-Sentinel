import type { Caption } from "@remotion/captions";
import transcriptJson from "./transcript.json";

// Written by scripts/transcribe.mjs. Until a voiceover has been transcribed there is
// no audio file and no captions.
export const transcript = transcriptJson as {
  audioFile: string | null;
  durationSec: number | null;
  captions: Caption[];
};
