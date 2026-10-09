// Whisper speech worker (Web Worker — never blocks the UI thread).
// Loads Xenova/whisper-base ONNX via Transformers.js on first use (CDN, cached after).
// Falls back to WASM automatically where WebGPU is unavailable.
import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

export interface SpeechChunk {
  timestamp: [number, number];
  text: string;
}

type Transcriber = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text?: string; chunks?: SpeechChunk[] }>;

let transcriber: Transcriber | null = null;

self.addEventListener("message", async (e: MessageEvent) => {
  const { id, audio } = e.data as { id: number; audio: Float32Array };
  try {
    if (!transcriber) {
      const make = pipeline as unknown as (...args: unknown[]) => Promise<Transcriber>;
      transcriber = await make("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "fp32" });
    }
    const out = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    self.postMessage({ id, ok: true, chunks: out.chunks ?? [] });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
});
