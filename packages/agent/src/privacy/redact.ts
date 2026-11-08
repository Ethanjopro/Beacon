/**
 * PII redaction. Runs on-device before anything can leave the phone.
 *
 * - Safe words are scrubbed FIRST and from everything (even local evidence),
 *   so they can never reach an LLM, a trace or a log.
 * - Phones, emails, card numbers (Luhn-checked), SSNs, one-time codes and
 *   street addresses become numbered placeholders ([PHONE_1], [CODE_1], …).
 * - Contact names become relationships ([CONTACT_1 (family)]). Generic role
 *   words ("Mom", "your bank") stay: they're the claim we need to analyze and
 *   identify nobody.
 * - Link query strings are dropped (they often carry tracking ids / emails).
 */
import type { TrustedContact } from "@beacon/shared";

export type RedactionKind = "phone" | "email" | "card" | "ssn" | "code" | "address" | "contact_name" | "link_query";

export interface RedactionResult {
  text: string;
  counts: Partial<Record<RedactionKind, number>>;
}

export const SAFE_WORD_PLACEHOLDER = "[SAFE_WORD]";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a phrase with flexible whitespace, case-insensitively, on word-ish boundaries. */
function phraseRe(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRe).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

/** Removes every contact's safe word. Returns how many were found (never which). */
export function scrubSafeWords(text: string, contacts: TrustedContact[]): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const c of contacts) {
    if (!c.safeWord?.trim()) continue;
    out = out.replace(phraseRe(c.safeWord), () => {
      count++;
      return SAFE_WORD_PLACEHOLDER;
    });
  }
  return { text: out, count };
}

/** Luhn checksum — separates real card numbers from order numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/** Words that describe a relationship rather than name a person — safe to keep. */
const ROLE_WORDS = new Set(
  [
    "mom", "mother", "mama", "mommy", "mum", "dad", "father", "papa", "daddy", "grandma", "grandmother", "granny",
    "nana", "grandpa", "grandfather", "grandson", "granddaughter", "grandchild", "son", "daughter", "sister",
    "brother", "aunt", "uncle", "cousin", "wife", "husband", "bank", "the bank", "boss", "doctor", "pharmacy",
    "abuela", "abuelo", "nieto", "nieta", "mamá", "papá", "hijo", "hija", "work", "employer",
  ],
);

export function isRoleWord(alias: string): boolean {
  const a = alias.trim().toLowerCase().replace(/^(your|my|the)\s+/, "");
  return ROLE_WORDS.has(a);
}

/** The display part of a contact name: "Sam (grandson)" → "Sam". */
export function shortName(contact: TrustedContact): string {
  return contact.name.replace(/\s*\(.*?\)\s*/g, " ").trim() || contact.name;
}

/** Contact refs the LLM sees instead of names. Index is stable per registry order. */
export function contactRef(contacts: TrustedContact[], contact: TrustedContact): string {
  return `CONTACT_${contacts.indexOf(contact) + 1}`;
}

interface Pattern {
  kind: Exclude<RedactionKind, "contact_name" | "link_query">;
  re: RegExp;
  /** Return false to keep the match (e.g. failed Luhn). */
  accept?: (match: string, offset: number, whole: string) => boolean;
}

const CODE_CONTEXT = /\b(code|otp|pin|passcode|password|c[oó]digo|clave|verification|verify|token)\b/i;

const PATTERNS: Pattern[] = [
  { kind: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  {
    kind: "card",
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    accept: (m) => luhnValid(m.replace(/\D/g, "")),
  },
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "ssn", re: /(?<=\b(?:ssn|social security(?: number)?|seguro social)\W{0,3})\d{9}\b/gi },
  { kind: "phone", re: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { kind: "phone", re: /\+\d{10,15}\b/g },
  {
    // 4–8 digit codes near a code-ish word, or any standalone 6-digit number. Not money ($200), not years in prose.
    kind: "code",
    re: /(?<![$\d.,])\b(?:[A-Z]-)?\d{4,8}\b(?![.,]\d)/g,
    accept: (m, offset, whole) => {
      const digits = m.replace(/\D/g, "");
      const window = whole.slice(Math.max(0, offset - 40), offset + m.length + 20);
      return CODE_CONTEXT.test(window) || digits.length === 6;
    },
  },
  {
    kind: "address",
    re: /\b\d{1,6}\s+(?:[A-Z][\p{L}'-]*\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Hwy|Highway|Calle)\b\.?(?:,?\s*(?:Apt|Unit|#)\s*\w+)?/gu,
  },
];

const PLACEHOLDER = /\[[A-Z_]+(?:_\d+)?(?: \([a-z]+\))?\]/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;

/**
 * Applies a replacement to every part of `text` that isn't a URL or an
 * existing placeholder, so later passes don't mangle earlier ones.
 */
function replaceOutside(text: string, protect: RegExp, fn: (segment: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(protect)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + fn(text.slice(last));
}

const PROTECTED = new RegExp(`${URL_RE.source}|${PLACEHOLDER.source}`, "gi");

export function redact(text: string, contacts: TrustedContact[]): RedactionResult {
  const counts: Partial<Record<RedactionKind, number>> = {};
  const bump = (kind: RedactionKind) => (counts[kind] = (counts[kind] ?? 0) + 1);

  // 1. Safe words (defense in depth — callers should already pass scrubbed text).
  let out = scrubSafeWords(text, contacts).text;

  // 2. Link query strings.
  out = out.replace(URL_RE, (url) => {
    const q = url.indexOf("?");
    if (q < 0) return url;
    bump("link_query");
    return `${url.slice(0, q)}?[QUERY]`;
  });

  // 3. Structured PII, outside URLs and earlier placeholders.
  for (const p of PATTERNS) {
    out = replaceOutside(out, PROTECTED, (segment) =>
      segment.replace(p.re, (m: string, ...rest: unknown[]) => {
        const offset = rest.find((x) => typeof x === "number") as number;
        if (p.accept && !p.accept(m, offset, segment)) return m;
        bump(p.kind);
        return `[${p.kind.toUpperCase()}_${counts[p.kind]}]`;
      }),
    );
  }

  // 4. Contact names → relationships. Longest first so "First Lone Star Bank" beats "First Lone Star".
  const names: { phrase: string; contact: TrustedContact }[] = [];
  for (const c of contacts) {
    for (const phrase of [shortName(c), c.name, ...c.aliases]) {
      if (phrase.trim().length < 2 || isRoleWord(phrase)) continue;
      names.push({ phrase, contact: c });
    }
  }
  names.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, contact } of names) {
    out = replaceOutside(out, PROTECTED, (segment) =>
      segment.replace(phraseRe(phrase), () => {
        bump("contact_name");
        return `[${contactRef(contacts, contact)} (${contact.relationship})]`;
      }),
    );
  }

  return { text: out, counts };
}

/** Human summary of what was redacted, e.g. "2 phone numbers and 1 code". */
export function describeRedactions(counts: RedactionResult["counts"]): string {
  const nouns: Record<RedactionKind, [string, string]> = {
    phone: ["phone number", "phone numbers"],
    email: ["email address", "email addresses"],
    card: ["card number", "card numbers"],
    ssn: ["Social Security number", "Social Security numbers"],
    code: ["code", "codes"],
    address: ["street address", "street addresses"],
    contact_name: ["contact name", "contact names"],
    link_query: ["link tracking string", "link tracking strings"],
  };
  const parts = (Object.entries(counts) as [RedactionKind, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${nouns[k][n === 1 ? 0 : 1]}`);
  if (parts.length === 0) return "nothing personal";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
