// Main-thread audio helpers: decode uploads and talk to the speech worker.
// Stereo calls are transcribed per channel (Agent = ch0, Customer = ch1, per spec §06);
// mono falls back to a single pass labelled Unknown (LLM turn-labelling is Phase 3).
import type { SpeakerSegment, SpeechChunk, SpeechRequest } from "./speech.worker";
import type { TranscriptChunk } from "./types";
import { transcribeNative } from "./native-whisper";

let worker: Worker | null = null;
let seq = 0;
// Resolves with chunks for a transcribe job and segments for a diarize job.
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, chunks, segments, language, error } = e.data as {
        id: number;
        ok: boolean;
        chunks?: SpeechChunk[];
        segments?: SpeakerSegment[];
        language?: string;
        error?: string;
      };
      const job = pending.get(id);
      pending.delete(id);
      if (!job) return;
      if (ok) job.resolve(segments ?? { chunks: chunks ?? [], language: language ?? "en" });
      else job.reject(new Error(error ?? "speech worker failed"));
    };
    worker.onerror = (ev) => {
      for (const [, job] of pending) job.reject(new Error(`speech worker error: ${ev.message}`));
      pending.clear();
    };
  }
  return worker;
}

function run<T>(kind: SpeechRequest["kind"], audio: Float32Array): Promise<T> {
  const w = getWorker();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
    // The buffer is handed over to the worker, so `audio` cannot be used again afterwards.
    w.postMessage({ id, kind, audio } satisfies SpeechRequest, [audio.buffer]);
  });
}

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface Transcription {
  words: Word[];
  /** Language Whisper detected, as a code: "en", "tl", "es"… */
  language: string;
}

/**
 * Every word with its own start and end time. Uses the native Whisper service when it is
 * running, otherwise Whisper in the browser. Works on a copy; `audio` stays usable.
 */
export async function transcribeAudio(audio: Float32Array, native: boolean): Promise<Transcription> {
  if (native) return transcribeNative(audio);
  const { chunks, language } = await run<{ chunks: SpeechChunk[]; language: string }>("transcribe", audio.slice());
  const words = chunks
    .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.2, text: c.text.trim() }))
    .filter((w) => w.text.length > 0);
  return { words, language };
}

/** Who is speaking when, in a mono recording. Works on a copy; `audio` stays usable. */
export function diarizeAudio(audio: Float32Array): Promise<SpeakerSegment[]> {
  return run<SpeakerSegment[]>("diarize", audio.slice());
}

const SAMPLE_RATE = 16000;

// How loud the audio gets around a word: the loudest tenth of a second from a little
// before it to a little after. Whisper's word times can be off by a few tenths, most of
// all on the last word of a sentence, so measuring only the word's own span would throw
// away real words.
function loudness(audio: Float32Array, start: number, end: number): number {
  const frame = SAMPLE_RATE / 10;
  const from = Math.max(0, Math.floor((start - 0.35) * SAMPLE_RATE));
  const to = Math.min(audio.length, Math.ceil((end + 0.35) * SAMPLE_RATE));
  let peak = 0;
  for (let at = from; at < to; at += frame) {
    const stop = Math.min(to, at + frame);
    let sum = 0;
    for (let i = at; i < stop; i++) sum += audio[i] * audio[i];
    peak = Math.max(peak, Math.sqrt(sum / Math.max(1, stop - at)));
  }
  return peak;
}

// Whisper makes up words over silence ("you", "Thank you.") and can hear the other
// channel's speech faintly. A word only counts if this audio is actually loud while it is
// said: at least a fraction of how loud this track's typical word is.
export function dropSilentWords(words: Word[], audio: Float32Array): Array<Word & { level: number }> {
  const measured = words.map((w) => ({ ...w, level: loudness(audio, w.start, w.end) }));
  const levels = measured.map((w) => w.level).sort((a, b) => a - b);
  const typical = levels[Math.floor(levels.length / 2)] ?? 0;
  return measured.filter((w) => w.level >= typical * 0.2 && w.level > 0.0005);
}

// Many "stereo" files are one recording copied onto both channels (anything saved from a
// video site or converted to MP3). Treating those as two people splits each sentence
// between them at random. Real two-party stereo has each side quiet while the other
// talks, so its channels barely correlate; copied audio correlates almost perfectly.
export function channelsCarrySameAudio(a: Float32Array, b: Float32Array): boolean {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 4) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  // One channel silent: the other holds the whole call, which is also "not two people".
  if (aa === 0 || bb === 0) return true;
  return ab / Math.sqrt(aa * bb) > 0.5;
}

export function mixDown(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

// People change over between sentences, not in the middle of one. Words are grouped into
// phrases (up to a sentence end or a pause) and a phrase is given to one speaker as a
// whole. Word times are a little loose, and deciding by phrase stops a word or two at the
// edges from landing on the wrong person. Returns [first, last] word indexes per phrase.
function phrases(words: Word[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const last = i === words.length - 1;
    if (last || /[.?!…]["”']?$/.test(words[i].text) || words[i + 1].start - words[i].end >= 0.5) {
      out.push([from, i]);
      from = i + 1;
    }
  }
  return out;
}

function energy(audio: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const to = Math.min(audio.length, Math.ceil(end * SAMPLE_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio[i] * audio[i];
  return sum;
}

// Stereo: the two channels are mixed and transcribed once, so Whisper hears the whole
// conversation, then each phrase goes to the channel that is louder while it is said.
// That channel is the person speaking. Returns 0 (left) or 1 (right) per word.
export function assignChannels(words: Word[], left: Float32Array, right: Float32Array): number[] {
  const picked: number[] = [];
  for (const [from, to] of phrases(words)) {
    let l = 0;
    let r = 0;
    // A little slack either side, because a word's stamped time can be slightly off.
    for (let i = from; i <= to; i++) {
      l += energy(left, words[i].start - 0.1, words[i].end + 0.1);
      r += energy(right, words[i].start - 0.1, words[i].end + 0.1);
    }
    for (let i = from; i <= to; i++) picked.push(l >= r ? 0 : 1);
  }
  return picked;
}

// Mono: the two voices that speak the most, or nothing if the recording does not clearly
// hold two voices.
export function mainVoices(segments: SpeakerSegment[]): [number, number] | null {
  const seconds = new Map<number, number>();
  for (const s of segments) seconds.set(s.speaker, (seconds.get(s.speaker) ?? 0) + (s.end - s.start));
  const voices = [...seconds.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  // A second voice that says almost nothing is more likely a mistake than a caller.
  if (voices.length < 2 || (seconds.get(voices[1]) ?? 0) < 1.5) return null;
  return [voices[0], voices[1]];
}

// Mono: the recording is transcribed once, then each word goes to whichever voice is
// speaking at that moment. A word therefore exists exactly once and cannot be duplicated
// across speakers. Returns 0 or 1 (index into `voices`) per word.
export function assignVoices(words: Word[], segments: SpeakerSegment[], voices: [number, number]): number[] {
  const mine = segments.filter((s) => voices.includes(s.speaker));
  const overlap = (w: Word, voice: number) =>
    mine.reduce((sum, s) => (s.speaker === voice ? sum + Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start)) : sum), 0);
  const nearest = (w: Word) => {
    const mid = (w.start + w.end) / 2;
    let best = mine[0];
    let bestGap = Infinity;
    for (const s of mine) {
      const gap = mid < s.start ? s.start - mid : mid > s.end ? mid - s.end : 0;
      if (gap < bestGap) {
        bestGap = gap;
        best = s;
      }
    }
    return voices.indexOf(best.speaker);
  };

  const picked: number[] = [];
  for (const [from, to] of phrases(words)) {
    const phrase = words.slice(from, to + 1);
    const time = [0, 1].map((v) => phrase.reduce((sum, w) => sum + overlap(w, voices[v]), 0));
    const voice = time[0] === time[1] ? nearest(phrase[Math.floor(phrase.length / 2)]) : time[0] > time[1] ? 0 : 1;
    for (let k = from; k <= to; k++) picked.push(voice);
  }
  return picked;
}

// Words back into transcript lines. A new line starts when the speaker changes, or when a
// sentence has ended and there is a pause before the same speaker goes on.
export function wordsToLines(words: Array<Word & { speaker: TranscriptChunk["speaker"] }>): TranscriptChunk[] {
  const lines: TranscriptChunk[] = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const last = lines[lines.length - 1];
    const sentenceOver = last && /[.?!…]["”']?$/.test(last.text) && w.start - last.end >= 0.4;
    const word = { start: w.start, end: w.end, text: w.text };
    if (last && last.speaker === w.speaker && !sentenceOver) {
      last.text += ` ${w.text}`;
      last.end = w.end;
      last.words!.push(word);
    } else {
      lines.push({ start: w.start, end: w.end, speaker: w.speaker, text: w.text, words: [word] });
    }
  }
  return lines;
}

export interface DecodedCall {
  channels: Float32Array[];
  durationS: number;
}

export async function decodeCall(file: Blob): Promise<DecodedCall> {
  const AC = window.AudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const target = 16000;
    const channels: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      if (buf.sampleRate === target) {
        channels.push(data.slice());
        continue;
      }
      const outLen = Math.floor((data.length * target) / buf.sampleRate);
      const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = (i * data.length) / outLen;
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        out[i] = data[i0] * (1 - frac) + data[Math.min(i0 + 1, data.length - 1)] * frac;
      }
      channels.push(out);
    }
    return { channels, durationS: buf.duration };
  } finally {
    void ctx.close();
  }
}

