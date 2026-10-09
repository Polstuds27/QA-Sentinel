// Backend provider abstraction. Today only Ollama (localhost CPU) works on this
// hardware; WebLLM stays registered as an explicit stub so a stronger laptop can
// flip `qa-backend` to "webllm" once its worker exists. Nothing here uploads audio.
import type { Check, CheckResult } from "../lib/scorecard";
import { OLLAMA_URL, SCORING_MODEL, checkOllama, scoreCheck } from "./ollama";

export interface BackendProvider {
  readonly id: string;
  readonly label: string;
  check(): Promise<boolean>;
  score(check: Check, transcript: string, piiFacts: string[]): Promise<CheckResult>;
}

class OllamaProvider implements BackendProvider {
  readonly id = "ollama";
  readonly label = `Ollama ${SCORING_MODEL} (localhost CPU)`;
  check(): Promise<boolean> {
    return checkOllama();
  }
  score(check: Check, transcript: string, piiFacts: string[]): Promise<CheckResult> {
    return scoreCheck(check, transcript, piiFacts);
  }
}

class WebLLMProvider implements BackendProvider {
  readonly id = "webllm";
  readonly label = "WebLLM in-browser (blocked: iGPU hangs — see docs/LOCAL_AI_PLAN.md)";
  async check(): Promise<boolean> {
    return false;
  }
  score(): Promise<CheckResult> {
    throw new Error("WebLLM backend not implemented: Intel iGPU hangs at init (Phase 0).");
  }
}

const providers: Record<string, BackendProvider> = {
  ollama: new OllamaProvider(),
  webllm: new WebLLMProvider(),
};

const BACKEND_KEY = "qa-backend";

export function getBackendId(): string {
  try {
    return localStorage.getItem(BACKEND_KEY) ?? "ollama";
  } catch {
    return "ollama";
  }
}

export function setBackendId(id: string): void {
  try {
    localStorage.setItem(BACKEND_KEY, id);
  } catch {
    // private mode — selection just won't persist
  }
}

export function getBackend(): BackendProvider {
  return providers[getBackendId()] ?? providers["ollama"];
}

export { OLLAMA_URL, SCORING_MODEL };
