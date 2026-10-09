// Main-thread audio helpers: decode uploads and talk to the speech worker.
// Stereo calls are transcribed per channel (Agent = ch0, Customer = ch1, per spec §06);
// mono falls back to a single pass labelled Unknown (LLM turn-labelling is Phase 3).
import type { SpeechChunk } from "./speech.worker";
import type { TranscriptChunk } from "./types";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (c: SpeechChunk[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, chunks, error } = e.data as {
        id: number;
        ok: boolean;
        chunks?: SpeechChunk[];
        error?: string;
      };
      const job = pending.get(id);
      pending.delete(id);
      if (!job) return;
      if (ok) job.resolve(chunks ?? []);
      else job.reject(new Error(error ?? "speech worker failed"));
    };
    worker.onerror = (ev) => {
      for (const [, job] of pending) job.reject(new Error(`speech worker error: ${ev.message}`));
      pending.clear();
    };
  }
  return worker;
}

export function transcribeAudio(audio: Float32Array): Promise<SpeechChunk[]> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, audio }, [audio.buffer]);
  });
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

export function chunksToLines(chunks: SpeechChunk[], speaker: string): TranscriptChunk[] {
  return chunks
    .map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? 0,
      speaker: speaker as TranscriptChunk["speaker"],
      text: c.text.trim(),
    }))
    .filter((l) => l.text.length > 0);
}
