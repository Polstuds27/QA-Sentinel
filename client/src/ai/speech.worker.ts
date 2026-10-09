// Speech worker (Web Worker — never blocks the UI thread). Two jobs:
//   transcribe: Whisper (see models.ts) works out the spoken language, then turns audio into timestamped text
//   diarize:    pyannote segmentation 3.0 marks who is speaking when (mono recordings)
//
// Fully offline: the models are served by the app itself from /models and the ONNX
// runtime from /ort (both put there by `npm run models`). Remote loading is switched
// off, so nothing here can reach a model hub or a CDN.
import { AutoModelForAudioFrameClassification, AutoProcessor, Tensor, env, pipeline } from "@huggingface/transformers";
import { DIARIZER, WHISPER } from "./models.ts";

const local = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, self.location.origin).href;

env.allowRemoteModels = false;
env.allowLocalModels = true;
// Must stay a relative path: given a full http:// URL the library skips its check that a
// local file exists and then loads no tokenizer.
env.localModelPath = `${import.meta.env.BASE_URL}models/`;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  // Without this the library fetches its WebAssembly runtime from cdn.jsdelivr.net.
  wasm.wasmPaths = {
    mjs: local("ort/ort-wasm-simd-threaded.asyncify.mjs"),
    wasm: local("ort/ort-wasm-simd-threaded.asyncify.wasm"),
  };
}

export interface SpeechChunk {
  timestamp: [number, number];
  text: string;
}

export interface SpeakerSegment {
  /** 1, 2 or 3: which voice. Not yet "agent" or "customer". */
  speaker: number;
  start: number;
  end: number;
}

export type SpeechRequest = { id: number; kind: "transcribe" | "diarize"; audio: Float32Array };

type Transcriber = ((
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text?: string; chunks?: SpeechChunk[] }>) & {
  model: {
    (inputs: Record<string, unknown>): Promise<{ logits: { data: Float32Array } }>;
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> };
  };
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
};

const SAMPLE_RATE = 16000;

// The library has no language detection: with no language given it assumes English. This
// does what Whisper itself does: run one decoding step and see which language token the
// model thinks comes first. Returns a code such as "en", "tl" or "es".
async function detectLanguage(t: Transcriber, audio: Float32Array): Promise<string> {
  // Start at the first sound: a voice track cut from a mono call can open with silence.
  let from = 0;
  while (from < audio.length && Math.abs(audio[from]) < 0.01) from++;
  if (from >= audio.length) return "en";
  const { input_features } = await t.processor(audio.subarray(from, from + 30 * SAMPLE_RATE));
  const config = t.model.generation_config;
  const start = new Tensor("int64", [BigInt(config.decoder_start_token_id)], [1, 1]);
  const { logits } = await t.model({ input_features, decoder_input_ids: start });
  let best = "en";
  let bestScore = -Infinity;
  for (const [token, id] of Object.entries(config.lang_to_id)) {
    if (logits.data[id] > bestScore) {
      bestScore = logits.data[id];
      best = token.slice(2, -2); // "<|tl|>" → "tl"
    }
  }
  return best;
}

interface Diarizer {
  run(audio: Float32Array): Promise<SpeakerSegment[]>;
}

let transcriber: Transcriber | null = null;
let diarizer: Diarizer | null = null;

async function loadDiarizer(): Promise<Diarizer> {
  const id = DIARIZER.id;
  const model = await AutoModelForAudioFrameClassification.from_pretrained(id, { dtype: DIARIZER.dtype });
  const processor = (await AutoProcessor.from_pretrained(id)) as unknown as {
    (audio: Float32Array): Promise<Record<string, unknown>>;
    post_process_speaker_diarization(logits: unknown, samples: number): Array<Array<{ id: number; start: number; end: number }>>;
  };
  const labels = (model.config as unknown as { id2label: Record<number, string> }).id2label;
  return {
    async run(audio) {
      const { logits } = (await model(await processor(audio))) as { logits: unknown };
      return processor
        .post_process_speaker_diarization(logits, audio.length)[0]
        .map((s) => ({ label: labels[s.id] ?? "", start: s.start, end: s.end }))
        // Keep stretches with exactly one voice; silence and overlapping speech are dropped.
        .filter((s) => /^SPEAKER_\d$/.test(s.label))
        .map((s) => ({ speaker: Number(s.label.slice(-1)), start: s.start, end: s.end }));
    },
  };
}

function explain(err: unknown): string {
  const text = String(err);
  return /models\/|ort\/|Failed to fetch|not found|404|Unauthorized/i.test(text)
    ? "Speech models are not installed on this machine. Run `npm run models` once in the frontend folder (needs internet that one time), then reload."
    : text;
}

self.addEventListener("message", async (e: MessageEvent) => {
  const { id, kind, audio } = e.data as SpeechRequest;
  try {
    if (kind === "diarize") {
      diarizer ??= await loadDiarizer();
      self.postMessage({ id, ok: true, segments: await diarizer.run(audio) });
      return;
    }
    if (!transcriber) {
      const make = pipeline as unknown as (...args: unknown[]) => Promise<Transcriber>;
      transcriber = await make("automatic-speech-recognition", WHISPER.id, { dtype: WHISPER.dtype });
    }
    const language = await detectLanguage(transcriber, audio);
    const out = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      // One timestamp per word, so each word can be given to the right speaker on its own.
      return_timestamps: "word",
      language,
      task: "transcribe", // keep the words in the language spoken; never translate
    });
    self.postMessage({ id, ok: true, chunks: out.chunks ?? [], language });
  } catch (err) {
    self.postMessage({ id, ok: false, error: explain(err) });
  }
});
