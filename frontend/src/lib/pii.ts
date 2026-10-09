// Redaction: what the analyst sees and what leaves in an export never shows customer details.
//
// Two layers, both applied by `redactPII`:
//   1. Patterns (this file, no AI): card numbers, emails, phone numbers, dates with a year
//      (dates of birth), account IDs, any other long number, a name after Mr/Ms/Mrs,
//      words spelled out letter by letter, postal codes and street addresses.
//   2. Terms found by the local model (ai/redaction.ts): names, addresses and security
//      answers, stored with the call as `redactions`. The model only points at text; the
//      replacing is done here, so the model can never rewrite or leak a transcript.
// Hiding too much is the safe mistake: a pattern that might be personal is hidden.
//
// Cards: any run of 13 or more digits → [CARD •••• 1111]. Speech-to-text often mishears a
// digit or adds commas ("4111, 11111, 11111, 11111"), so a run is redacted and flagged
// even when the Luhn checksum fails. `valid` records whether the checksum matched.

// 13 or more digits in a row, allowing up to two separator characters between digits. A
// card is 13–19 digits, but speech-to-text sometimes repeats a group, so up to 24 are
// taken: stopping at 19 would leave the extra digits showing next to the redaction.
const CARD_RUN = /\b\d(?:[ ,.-]{0,2}\d){12,23}\b/g;

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export type RedactionKind = "name" | "address" | "security_answer" | "other";

/** A piece of customer information found by the local model, to hide wherever it appears. */
export interface Redaction {
  text: string;
  kind: RedactionKind;
}

const LABEL: Record<RedactionKind, string> = {
  name: "[NAME]",
  address: "[ADDRESS]",
  security_answer: "[SECURITY ANSWER]",
  other: "[PERSONAL]",
};

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// A date that includes the year: nearly always a date of birth on a support call.
const DATES = [
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+\\d{4}\\b`, "gi"),
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A stretch of text to hide: characters [start, end) are replaced by `label`. */
export interface HiddenRange {
  start: number;
  end: number;
  label: string;
}

// Where the customer details are in a piece of text. Earlier rules win where two overlap
// (a card number is not also reported as a phone number).
export function findHidden(text: string, found: Redaction[] = []): HiddenRange[] {
  const ranges: HiddenRange[] = [];
  const free = (start: number, end: number) => ranges.every((r) => end <= r.start || start >= r.end);
  const claim = (pattern: RegExp, label: string | ((m: RegExpMatchArray) => string | null), group = 0) => {
    for (const m of text.matchAll(pattern)) {
      const picked = typeof label === "string" ? label : label(m);
      if (picked === null || m.index === undefined) continue;
      // `group` narrows the hidden part to one capture, e.g. only the name in "Ms. Reyes".
      const start = group === 0 ? m.index : m.index + m[0].indexOf(m[group]);
      const end = start + m[group].length;
      if (end > start && free(start, end)) ranges.push({ start, end, label: picked });
    }
  };
  claim(CARD_RUN, (m) => `[CARD •••• ${m[0].replace(/\D/g, "").slice(-4)}]`);
  claim(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[EMAIL]");
  claim(/(\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[PHONE]");
  for (const date of DATES) claim(date, "[DATE]");
  // Account IDs: a few letters then digits ("AC-48291", "AC 48291").
  claim(/\b[A-Z]{1,4}[ -]{0,2}\d{4,}\b/g, "[ACCOUNT]");
  // Any other phone-length number, then any remaining run of 6 or more digits.
  claim(/\+?\d[\d ()-]{8,}\d/g, (m) => (m[0].replace(/\D/g, "").length >= 10 ? "[PHONE]" : null));
  claim(/\b\d(?:[ -]?\d){5,}\b/g, "[NUMBER]");
  // A word spelled out letter by letter ("R-A-N-D-A-L-L"): on a call that is a name or an email.
  claim(/\b(?:[A-Za-z][-. ]){2,}[A-Za-z]\b(?![\p{L}'])/gu, (m) => (/^(?:[A-Za-z][-.]){2,}[A-Za-z]$/.test(m[0]) ? "[SPELLED OUT]" : null));
  // Postal codes when they are called that, and street addresses by their shape.
  claim(/\b(?:zip|postal|post)\s*(?:code)?\s*(?:is|:)?\s*(\d{4,5}(?:-\d{4})?)/gi, "[ZIP]", 1);
  claim(/\b\d{1,6}\s+(?:[A-Z][\p{L}'.-]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Highway|Hwy|Place|Pl|Extension|Ext)\b\.?/gu, "[ADDRESS]");
  claim(/\b(?:[A-Z][\p{L}'.-]+\s+){1,3}(?:Street|Avenue|Road|Boulevard|Drive|Lane|Highway)\b/gu, "[ADDRESS]");
  // A name after a title: only the name is hidden, "Ms. Reyes" → "Ms. [NAME]".
  claim(/\b(?:Mr|Mrs|Ms|Miss|Sir|Madam)\b\.?\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/gu, "[NAME]", 1);
  // What the model and the name cues found, longest first so "Maria Santos" goes before "Santos".
  // A found term may run past something a pattern already hid ("27 Mabini Street, Barangay
  // San Roque" where the pattern took only the street): it then swallows that range, so
  // the rest of the term is hidden too.
  for (const r of [...found].sort((a, b) => b.text.length - a.text.length)) {
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(r.text)}(?![\\p{L}\\p{N}])`, "giu"))) {
      if (m.index === undefined) continue;
      let start = m.index;
      let end = m.index + m[0].length;
      const inside = ranges.filter((x) => x.start < end && x.end > start);
      if (inside.some((x) => x.start <= start && x.end >= end)) continue; // already fully hidden
      for (const x of inside) {
        start = Math.min(start, x.start);
        end = Math.max(end, x.end);
        ranges.splice(ranges.indexOf(x), 1);
      }
      ranges.push({ start, end, label: LABEL[r.kind] ?? LABEL.other });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export function redactPII(text: string, found: Redaction[] = []): string {
  let out = "";
  let at = 0;
  for (const r of findHidden(text, found)) {
    out += text.slice(at, r.start) + r.label;
    at = r.end;
  }
  return out + text.slice(at);
}

export interface CardHit {
  digits: string;
  last4: string;
  /** Luhn checksum matched. False usually means a digit was misheard. */
  valid: boolean;
}

// Deterministic card finder. Hits spoken by the agent become a
// critical compliance flag per spec §06 — no LLM judgment needed for this check.
export function findCardHits(text: string): CardHit[] {
  const hits: CardHit[] = [];
  for (const m of text.matchAll(CARD_RUN)) {
    const digits = m[0].replace(/\D/g, "");
    hits.push({ digits, last4: digits.slice(-4), valid: luhnValid(digits) });
  }
  return hits;
}
