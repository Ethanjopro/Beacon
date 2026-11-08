import { z } from "zod";
import { ScamType } from "./taxonomy.js";
import { VerificationStatus } from "./verification.js";

export const VerdictLabel = z.enum(["scam", "suspicious", "safe"]);
export type VerdictLabel = z.infer<typeof VerdictLabel>;

/** Where a piece of evidence came from. Shown to the user ("show your work"). */
export const EvidenceSource = z.enum([
  "heuristic", // deterministic local rule (runs on-device, no network)
  "classifier", // T-Mobile baseline classifier or our own
  "llm", // Nemotron judgment
  "tool", // a tool result (contact lookup, link check, scam-library match)
  "verification", // the trusted contact's answer
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

/**
 * One named piece of evidence. `weight` is its contribution in LOG-ODDS toward
 * "scam" (positive = more likely scam, negative = more likely safe). The
 * confidence score is the logistic of prior + sum(weights), so the UI can show
 * exactly why the number is what it is.
 */
export const Signal = z.object({
  id: z.string().min(1), // stable snake_case id, e.g. "gift_card_payment"
  title: z.string(), // short, user-facing: "Asks for gift cards"
  detail: z.string(), // one sentence: why this matters
  weight: z.number(),
  source: EvidenceSource,
  /** Exact substring of the message that triggered it, for highlighting. */
  evidence: z.string().optional(),
});
export type Signal = z.infer<typeof Signal>;

export const RecoveryUrgency = z.enum(["now", "soon", "later"]);
export type RecoveryUrgency = z.infer<typeof RecoveryUrgency>;

export const RecoveryStep = z.object({
  id: z.string().min(1),
  title: z.string(),
  detail: z.string(),
  urgency: RecoveryUrgency,
  /** One-tap action the phone UI can render as a button. */
  action: z
    .object({
      kind: z.enum(["call", "sms", "link", "block", "report", "none"]),
      label: z.string(),
      /** Phone number, short code (e.g. 7726), or URL. Must come from a trusted source, never the message. */
      target: z.string().optional(),
    })
    .optional(),
});
export type RecoveryStep = z.infer<typeof RecoveryStep>;

/** What left the device, for the privacy ledger. */
export const PrivacyReport = z.object({
  sentToCloud: z.boolean(),
  model: z.string().optional(),
  /** Count by kind of what we redacted before any cloud call. */
  redactions: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** Plain-language notes, e.g. "Contact names were replaced with relationships". */
  notes: z.array(z.string()).default([]),
});
export type PrivacyReport = z.infer<typeof PrivacyReport>;

export const Verdict = z.object({
  eventId: z.string().min(1),
  label: VerdictLabel,
  /** Probability the event is a scam, 0..1 (calibrated, not vibes). */
  pScam: z.number().min(0).max(1),
  /** Confidence in `label` itself, 0..1. */
  confidence: z.number().min(0).max(1),
  /** Honest-uncertainty band on pScam (e.g. 0.62–0.81). */
  band: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  scamType: ScamType,
  /** One line for the top of the verdict sheet. */
  headline: z.string(),
  /** Evidence, sorted by |weight| descending. */
  signals: z.array(Signal),
  verification: z
    .object({
      status: VerificationStatus,
      contactName: z.string(),
      summary: z.string(),
    })
    .optional(),
  recovery: z.array(RecoveryStep),
  privacy: PrivacyReport,
  /** Pipeline stages that actually ran. */
  stagesRun: z.array(z.string()),
  latencyMs: z.number().nonnegative(),
  decidedAt: z.string().datetime(),
});
export type Verdict = z.infer<typeof Verdict>;
