// Shared shape of a transcribed stretch of speech.

export interface TranscriptChunk {
  start: number; // seconds
  end: number; // seconds
  speaker: "agent" | "customer" | "unknown"; // unknown = a mono call whose voices could not be told apart
  text: string;
  /** The words of `text`, each with its own time. `text` is these joined by single spaces. */
  words?: Array<{ start: number; end: number; text: string }>;
}
