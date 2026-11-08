import { z } from "zod";
import { VerifyChannel } from "./contacts.js";

/**
 * "Challenge" in Beacon means: challenge the CLAIM, out-of-band.
 * The agent extracts what the message claims ("I'm your grandson, I need bail")
 * and asks the real person over a channel we already trust ("Did you just text
 * Sam asking for bail money?"). It does NOT reply to the suspicious sender by
 * default — replying confirms the number is live and invites more attacks.
 * A sender-side challenge (asking the sender for the family safe word) is an
 * explicit opt-in: `AgentConfig.allowSenderChallenge`.
 */
export const VerificationStatus = z.enum([
  "pending",
  "confirmed", // real contact says: yes, that was me
  "denied", // real contact says: no, that was NOT me
  "unclear", // replied, but we could not tell
  "timeout", // no reply in time
  "unreachable", // could not send
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const VerificationRequest = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  contactId: z.string().min(1),
  contactName: z.string(),
  channel: VerifyChannel,
  /** Known-good handle from the trusted-contact registry. */
  to: z.string().min(1),
  /** The question we send. Must not include the suspicious link or callback number. */
  question: z.string().min(1),
  /** The claim we are checking, in plain words (for UI). */
  claim: z.string(),
  sentAt: z.string().datetime(),
  timeoutMs: z.number().int().positive(),
});
export type VerificationRequest = z.infer<typeof VerificationRequest>;

/** A reply from the trusted contact, delivered by apps/channels or the simulator. */
export const VerificationReply = z.object({
  requestId: z.string().min(1),
  text: z.string(),
  from: z.string().optional(),
  receivedAt: z.string().datetime(),
});
export type VerificationReply = z.infer<typeof VerificationReply>;

export const VerificationOutcome = z.object({
  requestId: z.string().min(1),
  status: VerificationStatus,
  /** The contact's literal reply, if any. */
  replyText: z.string().optional(),
  /** One-line, human-readable summary ("Mom replied: 'No, that's not me!'"). */
  summary: z.string(),
  resolvedAt: z.string().datetime(),
});
export type VerificationOutcome = z.infer<typeof VerificationOutcome>;
