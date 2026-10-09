// Deterministic PII redaction (no AI). LLM name/address pass is TODO (AI phase).
// Cards: regex for 13–19 digit runs (spaces/dashes) + Luhn check → [CARD •••• 1111].

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

export function redactPII(text: string): string {
  let out = text;
  // Card numbers: 4 groups of 4 (test no. 4111 1111 1111 1111 included) or 13-19 contiguous runs
  out = out.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      return `[CARD •••• ${digits.slice(-4)}]`;
    }
    return m;
  });
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[EMAIL]");
  out = out.replace(/(\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[PHONE]");
  return out;
}

export interface CardHit {
  digits: string;
  last4: string;
}

// Deterministic card finder (regex + Luhn). Hits spoken by the agent become a
// critical compliance flag per spec §06 — no LLM judgment needed for this check.
export function findCardHits(text: string): CardHit[] {
  const hits: CardHit[] = [];
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      hits.push({ digits, last4: digits.slice(-4) });
    }
  }
  return hits;
}
