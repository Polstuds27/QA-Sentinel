// Native Whisper: speech to text by a program on this laptop instead of inside the
// browser tab. whisper.cpp runs Whisper large-v3-turbo on the machine's GPU, which is both
// far more accurate and far faster than anything a tab can load (a tab tops out at
// Whisper small). Start it with `npm run whisper`.
//
// It is optional. When it is not running, transcription falls back to Whisper base in the
// browser (speech.worker.ts). Like Ollama it listens on this machine only, so the app
// still talks to nothing but localhost.
import type { Transcription, Word } from "./whisper";

export const NATIVE_WHISPER_URL = "http://localhost:8178";
export const NATIVE_WHISPER_NAME = "Whisper large-v3-turbo";

export async function nativeWhisperUp(): Promise<boolean> {
  try {
    // "no-cors": the service's home page sends no CORS header, so a normal request is
    // blocked even though the service is there. An answer of any kind means it is up.
    await fetch(`${NATIVE_WHISPER_URL}/`, { mode: "no-cors", signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

// 16 kHz mono 16-bit WAV, the format whisper.cpp reads directly.
function toWav(audio: Float32Array): Blob {
  const rate = 16000;
  const view = new DataView(new ArrayBuffer(44 + audio.length * 2));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + audio.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

interface NativeToken {
  word: string;
  start: number;
  end: number;
  /** When this piece ends, in hundredths of a second, from the precise-timing pass; -1 if off. */
  t_dtw?: number;
}

interface NativeReply {
  language_probabilities?: Record<string, number>;
  segments?: Array<{ words?: NativeToken[] }>;
  error?: string;
}

export async function transcribeNative(audio: Float32Array): Promise<Transcription> {
  const form = new FormData();
  form.append("file", toWav(audio), "audio.wav");
  form.append("response_format", "verbose_json");
  form.append("language", "auto"); // detect the spoken language; never translate
  form.append("temperature", "0");
  const res = await fetch(`${NATIVE_WHISPER_URL}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`native Whisper failed: ${res.status}`);
  const reply = (await res.json()) as NativeReply;
  if (reply.error) throw new Error(`native Whisper: ${reply.error}`);

  // The service returns pieces of words ("4", "11", "1", "-", "." …). A piece that starts
  // with a space begins a new word; anything else belongs to the word before it.
  //
  // Timing: the service's ordinary start/end times are rough (the first word of a sentence
  // is stamped at the start of the silence before it). Its precise-timing pass gives the
  // moment each piece ENDS, which is exact to about a tenth of a second, so a word ends
  // where its last piece ends and starts a little before that, never before the previous piece.
  const words: Word[] = [];
  let previousEnd = 0;
  for (const piece of (reply.segments ?? []).flatMap((s) => s.words ?? [])) {
    const precise = typeof piece.t_dtw === "number" && piece.t_dtw >= 0;
    const end = precise ? piece.t_dtw! / 100 : piece.end;
    // How long the piece takes to say is guessed from its length (about 0.07 s a letter).
    const start = precise ? Math.max(previousEnd, end - Math.min(0.6, Math.max(0.12, piece.word.trim().length * 0.07))) : piece.start;
    previousEnd = end;
    const last = words[words.length - 1];
    if (piece.word.startsWith(" ") || !last) words.push({ start, end, text: piece.word.trim() });
    else {
      last.text += piece.word;
      last.end = Math.max(last.end, end);
    }
  }
  const language = Object.entries(reply.language_probabilities ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "en";
  return { words: words.filter((w) => w.text.length > 0), language };
}
