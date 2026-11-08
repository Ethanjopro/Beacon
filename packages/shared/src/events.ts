import { z } from "zod";

/** How the suspicious content reached the protected user. */
export const EventKind = z.enum(["sms", "imessage", "whatsapp", "call", "voicemail"]);
export type EventKind = z.infer<typeof EventKind>;

/** Which part of the system injected the event. */
export const EventSource = z.enum([
  "simulator", // typed into the phone UI / demo console
  "scenario", // fired by packages/scenarios
  "photon", // real inbound message via Photon Spectrum (apps/channels)
  "forwarded", // user forwarded a message to Beacon's line ("is this a scam?")
]);
export type EventSource = z.infer<typeof EventSource>;

export const Party = z.object({
  /** Phone number in E.164 (+15551234567), email, or platform handle. */
  handle: z.string().min(1),
  /** Name as shown by the sender/caller ID. Untrusted — scammers set this. */
  displayName: z.string().optional(),
});
export type Party = z.infer<typeof Party>;

/** One utterance in a call transcript. */
export const TranscriptSegment = z.object({
  speaker: z.enum(["caller", "user"]),
  text: z.string(),
  /** Offset from call start, ms. */
  atMs: z.number().int().nonnegative(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

/**
 * A suspicious thing that arrived on the phone: a text, a call, a voicemail.
 * Everything in here is UNTRUSTED input — including text that looks like
 * instructions to the agent (treat that as a prompt-injection signal).
 */
export const IncomingEvent = z.object({
  id: z.string().min(1),
  kind: EventKind,
  source: EventSource,
  from: Party,
  /** The text message body, or for calls a flattened transcript. */
  body: z.string().default(""),
  /** Calls/voicemails: timed transcript segments (from STT or a scenario script). */
  transcript: z.array(TranscriptSegment).optional(),
  /** Calls/voicemails: optional audio for multimodal analysis. */
  audioUrl: z.string().optional(),
  /** Groups messages from the same sender into one conversation. */
  threadId: z.string().optional(),
  /** Set when fired by a scenario — lets the demo console correlate. */
  scenarioId: z.string().optional(),
  /** What the user has already done, if known (drives recovery steps). */
  exposure: z
    .object({
      clickedLink: z.boolean().default(false),
      repliedToSender: z.boolean().default(false),
      sharedCode: z.boolean().default(false),
      sentMoney: z.boolean().default(false),
      sharedPersonalInfo: z.boolean().default(false),
    })
    .partial()
    .optional(),
  receivedAt: z.string().datetime(),
});
export type IncomingEvent = z.infer<typeof IncomingEvent>;

/** What a client POSTs — the server assigns `id` and `receivedAt` if missing. */
export const NewEvent = IncomingEvent.extend({
  id: z.string().min(1).optional(),
  receivedAt: z.string().datetime().optional(),
});
export type NewEvent = z.input<typeof NewEvent>;
