// The scoring backend. Ollama on localhost is the only one; the interface is what a
// second local provider would implement. Nothing here uploads audio.
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

const ollama = new OllamaProvider();

export function getBackend(): BackendProvider {
  return ollama;
}

export { OLLAMA_URL, SCORING_MODEL };
