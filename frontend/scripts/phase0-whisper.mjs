// Phase 0 check A — Whisper base transcribes the local TTS sample clip.
// Runs in Node (CPU/WASM). Proves the model + pipeline work; browser WebGPU
// throughput is validated separately. Usage: node scripts/phase0-whisper.mjs
import { readFileSync } from "node:fs";
import { pipeline } from "@huggingface/transformers";

const WAV = new URL("../public/demo-audio/call-sample.wav", import.meta.url);

function wavToMono16k(buf) {
  // Minimal RIFF parser: find fmt + data chunks, assume PCM 16-bit.
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") throw new Error("Not a RIFF wav");
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let dataStart = 0;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      const audioFormat = buf.readUInt16LE(offset + 8);
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      const bits = buf.readUInt16LE(offset + 22);
      if (audioFormat !== 1 || bits !== 16) throw new Error(`Unsupported wav: format=${audioFormat} bits=${bits}`);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!dataStart) throw new Error("data chunk not found");
  const n = Math.floor(dataLen / 2 / channels);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += buf.readInt16LE(dataStart + (i * channels + c) * 2);
    mono[i] = sum / channels / 32768;
  }
  // Resample to 16 kHz if needed (linear).
  if (sampleRate === 16000) return { audio: mono, seconds: n / 16000 };
  const outLen = Math.floor((n * 16000) / sampleRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * n) / outLen;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    out[i] = mono[i0] * (1 - frac) + (mono[Math.min(i0 + 1, n - 1)] ?? 0) * frac;
  }
  return { audio: out, seconds: outLen / 16000 };
}

const t0 = Date.now();
const { audio, seconds } = wavToMono16k(readFileSync(WAV));
console.log(`clip: ${seconds.toFixed(1)}s @16kHz mono`);

const transcribe = await pipeline("automatic-speech-recognition", "Xenova/whisper-base", {
  dtype: "fp32",
});
console.log(`model loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const t1 = Date.now();
const out = await transcribe(audio, {
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: true,
});
console.log(`transcribed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

const text = (out.text ?? "").toLowerCase();
for (const kw of ["bankco", "jason", "dispute", "frustrating", "4 1 1 1", "4111"]) {
  console.log(`keyword "${kw}": ${text.includes(kw) ? "HIT" : "miss"}`);
}
console.log("---CHUNKS---");
for (const c of out.chunks ?? []) {
  console.log(`[${c.timestamp[0]?.toFixed(1)}-${c.timestamp[1]?.toFixed(1)}] ${c.text}`);
}
