import { z } from "zod";
import { Party } from "./events.js";
import { Relationship } from "./contacts.js";

/**
 * Magenta-Guard call screening. The agent answers an incoming call FIRST,
 * says it is an AI screener, interviews the caller, challenges any claimed
 * identity (family code word + out-of-band callback), and only then bridges
 * the call to the subscriber or blocks it.
 */

export const CallVerdictLabel = z.enum(["VERIFIED", "SUSPICIOUS", "SCAM"]);
export type CallVerdictLabel = z.infer<typeof CallVerdictLabel>;

/** The structured verdict the Nemotron screener emits. This shape is the team's API contract. */
export const CallVerdict = z.object({
  verdict: CallVerdictLabel,
  /** 0–100. */
  confidence: z.number().int().min(0).max(100),
  /** Plain-language reasons, most important first. */
  evidence: z.array(z.string().min(1)).min(1).max(8),
  /** What happens next / what the subscriber should do. */
  next_action: z.string().min(1),
});
export type CallVerdict = z.infer<typeof CallVerdict>;

/** What the screener did with the call. */
export const CallAction = z.enum(["bridge", "block", "voicemail"]);
export type CallAction = z.infer<typeof CallAction>;

/** Results of the two identity challenges, as recorded by the host-side tools (not the model's opinion). */
export const ScreeningChecks = z.object({
  codeWord: z.enum(["matched", "failed", "not_checked", "none_on_file"]),
  callback: z.enum(["confirmed", "denied", "unclear", "no_answer", "unreachable", "not_placed"]),
});
export type ScreeningChecks = z.infer<typeof ScreeningChecks>;

export const ScreeningResult = z.object({
  callId: z.string().min(1),
  verdict: CallVerdict,
  action: CallAction,
  checks: ScreeningChecks,
  /** "nemotron" = the model decided. "error" = the model couldn't be reached, so the call was NOT connected. */
  decidedBy: z.enum(["nemotron", "error"]),
  model: z.string().optional(),
  /** Set when the bridge gate overrode the model (e.g. it said VERIFIED but no challenge passed). */
  gateNote: z.string().optional(),
  /** Registry id of the contact the caller claimed to be, if any. */
  claimedContactId: z.string().optional(),
  /** Caller utterances heard. */
  turns: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  decidedAt: z.string().datetime(),
});
export type ScreeningResult = z.infer<typeof ScreeningResult>;

export const CallStatus = z.enum(["ringing", "screening", "challenging", "verifying", "deciding", "bridged", "blocked", "voicemail"]);
export type CallStatus = z.infer<typeof CallStatus>;

export const CallSpeaker = z.enum(["agent", "caller"]);
export type CallSpeaker = z.infer<typeof CallSpeaker>;

/** POST /api/calls — a call arriving on the protected line (sim injection, or a normalized Photon event). */
export const NewCall = z.object({
  from: Party,
  /** The protected subscriber's number. Optional in the sim. */
  to: z.string().optional(),
  source: z.enum(["simulator", "scenario", "photon"]).default("simulator"),
  /** Optional: what the caller says right after the greeting (judge free-text, Photon message text). */
  firstWords: z.string().optional(),
  scenarioId: z.string().optional(),
});
export type NewCall = z.input<typeof NewCall>;

export const CreatedCall = z.object({ callId: z.string() });
export type CreatedCall = z.infer<typeof CreatedCall>;

export const DialCall = z.object({ number: z.string().min(7).max(32), displayName: z.string().max(40).optional() });
export type DialCall = z.infer<typeof DialCall>;

/** POST /api/calls/:id/say — the caller says something (sim script, judge typing, or live STT). */
export const CallerSays = z.object({ text: z.string().min(1).max(2000) });
export type CallerSays = z.infer<typeof CallerSays>;

/**
 * GET /api/trusted/:number — the ground-truth registry record. The code word
 * itself is never returned over HTTP; `hasCodeWord` says one is on file and
 * POST /api/trusted/:number/check-code compares an attempt on the server.
 */
export const TrustedRecord = z.object({
  id: z.string(),
  name: z.string(),
  relationship: Relationship,
  /** Numbers this contact legitimately calls from. */
  numbers: z.array(z.string()),
  /** Known-good number for the out-of-band verification callback. */
  callbackNumber: z.string(),
  hasCodeWord: z.boolean(),
});
export type TrustedRecord = z.infer<typeof TrustedRecord>;

/** POST /api/trusted — the subscriber adds (or updates, by number) a trusted contact. */
export const NewTrustedContact = z.object({
  name: z.string().min(1).max(80),
  relationship: Relationship,
  number: z.string().min(3).max(32),
  callbackNumber: z.string().min(3).max(32).optional(),
  codeWord: z.string().min(2).max(64).optional(),
  aliases: z.array(z.string().min(1).max(40)).max(12).optional(),
});
export type NewTrustedContact = z.input<typeof NewTrustedContact>;

export const CodeWordCheck = z.object({ attempt: z.string().min(1).max(200) });
export const CodeWordResult = z.object({ match: z.boolean(), hasCodeWord: z.boolean() });
export type CodeWordResult = z.infer<typeof CodeWordResult>;

/**
 * After the call: a ~30-second "what gave it away" recap for the subscriber, written by
 * Nemotron from the redacted call, plus an optional practice drill on a similar scam.
 */
export const CallRecap = z.object({
  callId: z.string().min(1),
  /** One line: what happened on this call. */
  headline: z.string().min(1),
  /** What gave it away, most telling first. */
  tells: z
    .array(
      z.object({
        sign: z.string().min(1),
        lesson: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
  /** One line to remember. */
  takeaway: z.string().min(1),
  drill: z
    .object({
      /** A NEW, similar scam line to practice on (not this call). */
      scenario: z.string().min(1),
      question: z.string().min(1),
      options: z.array(z.string().min(1)).min(2).max(4),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string().min(1),
    })
    .refine((d) => d.answerIndex < d.options.length, { message: "answerIndex out of range" })
    .optional(),
});
export type CallRecap = z.infer<typeof CallRecap>;
