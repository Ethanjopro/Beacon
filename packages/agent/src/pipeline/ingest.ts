/**
 * Stage 1 — ingest. Normalize the event into evidence text, scrub safe words,
 * redact PII for anything that may leave the device, and open the privacy ledger.
 */
import type { IncomingEvent, TrustedContact } from "@beacon/shared";
import { describeRedactions, redact, scrubSafeWords } from "../privacy/redact.js";

/**
 * Evidence text = body + what the CALLER said. The user's own words in a call
 * ("I won't give you my code") are not evidence against the caller.
 */
export function evidenceText(event: IncomingEvent): string {
  const caller = (event.transcript ?? []).filter((s) => s.speaker === "caller").map((s) => s.text.trim()).filter(Boolean);
  // For calls, `body` is the flattened transcript INCLUDING the user's lines — use caller segments instead.
  const parts = caller.length > 0 ? caller : [event.body];
  return parts.map((s) => s.normalize("NFKC").trim()).filter(Boolean).join("\n");
}

export interface Ingested {
  localText: string;
  redacted: ReturnType<typeof redact>;
  safeWordsFound: number;
}

export function ingest(event: IncomingEvent, contacts: TrustedContact[]): Ingested {
  const scrubbed = scrubSafeWords(evidenceText(event), contacts);
  return { localText: scrubbed.text, redacted: redact(scrubbed.text, contacts), safeWordsFound: scrubbed.count };
}

export function ingestThought(counts: Ingested["redacted"]["counts"]): string {
  const what = describeRedactions(counts);
  return what === "nothing personal"
    ? "Nothing personal to hide in this message."
    : `Hid ${what} before analysis — they never leave this phone.`;
}
