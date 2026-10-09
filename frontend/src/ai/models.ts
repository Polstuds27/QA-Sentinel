// Which speech models the app uses. Read by the speech worker and by
// `scripts/fetch-models.mjs`, so the files that are downloaded are the files that are loaded.
// Keep this file free of imports: the Node script loads it directly.

export interface SpeechModel {
  id: string;
  /** Build of the weights: "fp32" is full precision, "q8" is 8-bit, about a quarter of the size. */
  dtype: "fp32" | "q8";
}

// Whisper base is the default: about 12 s to transcribe a 30 s call in the browser on an
// M4 Pro. Whisper small is more exact (it got "BankCo" and "Okay" right where base wrote
// "Bank Co" and "Ok") but took about 60 s for the same call, which felt too slow. To use
// it, set WHISPER to WHISPER_SMALL and run `npm run models` again (about 970 MB more).
// Whisper medium does not fit: its 8-bit build (780 MB) ran out of memory in the tab on
// the first transcription, because a tab's WebAssembly memory tops out near 4 GB.
export const WHISPER_BASE: SpeechModel = { id: "Xenova/whisper-base", dtype: "fp32" };
export const WHISPER_SMALL: SpeechModel = { id: "Xenova/whisper-small", dtype: "fp32" };
export const WHISPER: SpeechModel = WHISPER_BASE;

// Who is speaking when, for mono recordings.
export const DIARIZER: SpeechModel = { id: "onnx-community/pyannote-segmentation-3.0", dtype: "fp32" };

/** The Whisper models `npm run models` downloads: only the one in use. */
export const WHISPER_MODELS: SpeechModel[] = [WHISPER];
