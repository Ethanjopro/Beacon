import type { Verdict, VerificationRequest } from "@beacon/shared";

export const MAX_REPLY_CHARS = 480;

/** Remove anything link-like: we never echo URLs from the original message. */
export function stripLinks(s: string): string {
  return s
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|xyz|top|info|link|click|ly|me)\b\S*/gi, "[link removed]")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/** The out-of-band question sent to the trusted contact. */
export function formatVerificationQuestion(req: Pick<VerificationRequest, "question">): string {
  const q = stripLinks(req.question);
  const ask = /\b(?:yes|no)\b.*\?|reply/i.test(q) ? "" : " Reply yes or no.";
  return clip(q + ask, MAX_REPLY_CHARS);
}

const LABEL_TEXT: Record<Verdict["label"], string> = {
  scam: "Likely a SCAM",
  suspicious: "Suspicious",
  safe: "Looks safe",
};

/** Short plain-text verdict for forward-to-check replies. */
export function formatVerdictReply(v: Verdict): string {
  const wantScam = v.label !== "safe";
  const directional = v.signals.filter((s) => (wantScam ? s.weight > 0 : s.weight < 0));
  const pool = directional.length > 0 ? directional : v.signals;
  const reasons = [...pool]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 2)
    .map((s) => stripLinks(s.title).replace(/[.\s]+$/, ""));
  const step = v.recovery[0];

  const parts = [`Beacon: ${LABEL_TEXT[v.label]} (${Math.round(v.confidence * 100)}% confident).`];
  if (reasons.length > 0) parts.push(`Why: ${reasons.join("; ")}.`);
  if (step) {
    const detail = stripLinks(step.detail).replace(/[.\s]+$/, "");
    parts.push(`First step: ${stripLinks(step.title).replace(/[.\s]+$/, "")}${detail ? ` - ${detail}` : ""}.`);
  }
  // Clip only the tail so the label and reasons always survive.
  return clip(parts.join(" "), MAX_REPLY_CHARS);
}
