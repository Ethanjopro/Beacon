import type { VerificationStatus } from "@beacon/shared";

/**
 * Mock stand-in for the agent's reply interpreter (the real one is a fast
 * Nemotron call). Denials are checked first: "No?? That's not me!" is a denial
 * even though it contains "me".
 */
const DENIED = /\b(no+|nope|nah|not me|wasn'?t me|didn'?t|did not|never|not mine|scam)\b/i;
const CONFIRMED = /\b(yes|yeah|yep|yup|that was me|it'?s me|it was me|i did|i sent)\b/i;

export function interpretReply(text: string): Extract<VerificationStatus, "denied" | "confirmed" | "unclear"> {
  if (DENIED.test(text)) return "denied";
  if (CONFIRMED.test(text)) return "confirmed";
  return "unclear";
}
