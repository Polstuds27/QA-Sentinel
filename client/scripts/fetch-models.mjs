// One-time setup for fully offline use: `npm run models` (needs internet once).
//
// Downloads the speech models into public/models/ and copies the ONNX runtime into
// public/ort/, so the app serves them itself. After this, the app makes no request to
// any other machine: no model hub, no CDN. Both folders are git-ignored (about 300 MB,
// with a single file over GitHub's 100 MB limit), so run this on every new machine.
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://huggingface.co";

const { DIARIZER, WHISPER_MODELS } = await import("../src/ai/models.ts");

const suffix = { fp32: "", q8: "_quantized" };
const MODELS = {
  // Who is speaking when, for mono recordings.
  [DIARIZER.id]: ["config.json", "preprocessor_config.json", "onnx/model.onnx"],
};
// Speech to text: the model in use.
for (const m of WHISPER_MODELS) {
  MODELS[m.id] = [
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    `onnx/encoder_model${suffix[m.dtype]}.onnx`,
    `onnx/decoder_model_merged${suffix[m.dtype]}.onnx`,
  ];
}

// The WebAssembly runtime the models run on. Without a local copy the library loads it from a CDN.
const RUNTIME = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

const exists = (p) => stat(p).then((s) => s.size > 0, () => false);
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

await mkdir(join(root, "public/ort"), { recursive: true });
for (const file of RUNTIME) {
  await copyFile(join(root, "node_modules/onnxruntime-web/dist", file), join(root, "public/ort", file));
}
console.log(`runtime: copied ${RUNTIME.length} files to public/ort/`);

let failed = false;
for (const [model, files] of Object.entries(MODELS)) {
  for (const file of files) {
    const target = join(root, "public/models", model, file);
    if (await exists(target)) {
      console.log(`have     ${model}/${file}`);
      continue;
    }
    try {
      const res = await fetch(`${HUB}/${model}/resolve/main/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
      console.log(`fetched  ${model}/${file} (${mb(data.length)})`);
    } catch (e) {
      failed = true;
      console.error(`FAILED   ${model}/${file}: ${e.message}`);
    }
  }
}
if (failed) {
  console.error("\nSome files are missing. Check the internet connection and run `npm run models` again.");
  process.exit(1);
}
console.log("\nDone. The app can now run with no internet connection.");
