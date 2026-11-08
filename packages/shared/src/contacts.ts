import { z } from "zod";

export const Relationship = z.enum([
  "family",
  "friend",
  "bank",
  "employer",
  "carrier",
  "government",
  "service",
  "other",
]);
export type Relationship = z.infer<typeof Relationship>;

/** Channels Beacon can use to reach a trusted contact out-of-band. */
export const VerifyChannel = z.enum(["imessage", "sms", "whatsapp", "call", "simulator"]);
export type VerifyChannel = z.infer<typeof VerifyChannel>;

/**
 * Someone the protected user already trusts, with a KNOWN-GOOD way to reach
 * them. Out-of-band verification only ever uses `verifyVia` — never a number
 * or link supplied by the suspicious message.
 */
export const TrustedContact = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  relationship: Relationship,
  /** Names a scammer might use to claim to be this contact ("Mom", "Chase"). */
  aliases: z.array(z.string()).default([]),
  /** Every handle this contact legitimately sends from. */
  handles: z.array(z.string()).default([]),
  /** Organizations: domains their real links use. */
  domains: z.array(z.string()).default([]),
  /** The known-good channel for verification. */
  verifyVia: z.object({
    channel: VerifyChannel,
    handle: z.string().min(1),
  }),
  /**
   * Optional family safe word. NEVER sent to an LLM, never logged, never shown
   * in traces. Only compared locally (see agent privacy rules).
   */
  safeWord: z.string().optional(),
});
export type TrustedContact = z.infer<typeof TrustedContact>;
