import { z } from "zod";
import { IncomingEvent } from "./events.js";
import { Signal, Verdict, PrivacyReport } from "./verdict.js";
import { VerificationRequest, VerificationOutcome } from "./verification.js";
import { CallSpeaker, CallStatus, ScreeningResult } from "./screening.js";

/**
 * Pipeline stages, in order. Not every stage runs for every event
 * (e.g. triage can short-circuit an obviously safe message before `analyze`,
 * so it never leaves the device).
 */
export const STAGES = ["ingest", "triage", "analyze", "challenge", "verify", "verdict", "recover"] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

/**
 * The live "agent is thinking" stream. The server stamps the envelope
 * (seq, at); the agent emits only the body via `AgentDeps.emit`.
 * The phone UI renders these as a timeline — keep `thought` lines short,
 * human, and free of secrets.
 */
export const TraceBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("event.received"), event: IncomingEvent }),
  z.object({
    type: z.literal("stage"),
    stage: Stage,
    status: z.enum(["started", "completed", "skipped"]),
    note: z.string().optional(),
  }),
  z.object({ type: z.literal("thought"), text: z.string() }),
  z.object({ type: z.literal("signal"), signal: Signal }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    status: z.enum(["called", "result", "error"]),
    /** Short human summary of input or output — not raw payloads. */
    summary: z.string(),
  }),
  z.object({ type: z.literal("privacy"), report: PrivacyReport }),
  z.object({ type: z.literal("verification.requested"), request: VerificationRequest }),
  z.object({ type: z.literal("verification.resolved"), outcome: VerificationOutcome }),
  z.object({
    type: z.literal("score"),
    /** Running pScam after this step — lets the UI animate the meter. */
    pScam: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal("verdict"), verdict: Verdict }),
  z.object({ type: z.literal("error"), message: z.string(), stage: Stage.optional() }),
  // ── Call screening (Magenta-Guard) ──
  /** One spoken line on the screened call. Caller text is scrubbed of code words. */
  z.object({ type: z.literal("call.turn"), speaker: CallSpeaker, text: z.string() }),
  z.object({ type: z.literal("call.status"), status: CallStatus, note: z.string().optional() }),
  z.object({ type: z.literal("call.verdict"), result: ScreeningResult }),
]);
export type TraceBody = z.infer<typeof TraceBody>;

export const TraceEnvelope = z.object({
  /** Monotonic across the whole server, for SSE replay (`?since=`). */
  seq: z.number().int().nonnegative(),
  eventId: z.string().min(1),
  at: z.string().datetime(),
});
export type TraceEnvelope = z.infer<typeof TraceEnvelope>;

export const TraceEvent = z.intersection(TraceEnvelope, TraceBody);
export type TraceEvent = TraceEnvelope & TraceBody;
export type TraceType = TraceBody["type"];
