import { z } from "zod";
import { IncomingEvent } from "./events.js";
import { TrustedContact } from "./contacts.js";
import { Verdict } from "./verdict.js";
import { VerificationOutcome } from "./verification.js";

/**
 * HTTP contract of apps/server. The phone UI, apps/channels and the scenario
 * runner talk ONLY through these routes. Default base: http://localhost:8787
 * (the phone dev server proxies /api to it).
 */
export const API = {
  health: "/api/health", // GET  → HealthResponse
  events: "/api/events", // POST NewEvent → { eventId }
  event: (id: string) => `/api/events/${encodeURIComponent(id)}`, // GET → EventDetail
  stream: "/api/stream", // GET  SSE; `event: trace`, `id: <seq>`, `data: TraceEvent`. `seq` starts at 1; `?since=<seq>` is EXCLUSIVE (replays seq > since), so `?since=0` replays everything buffered
  contacts: "/api/contacts", // GET  → PublicContact[] (safe words stripped)
  pendingVerifications: "/api/verifications/pending", // GET → VerificationRequest[]
  verificationReply: (id: string) => `/api/verifications/${encodeURIComponent(id)}/reply`, // POST ReplyBody → VerificationOutcome
  scenarios: "/api/scenarios", // GET  → ScenarioSummary[]
  fireScenario: (id: string) => `/api/scenarios/${encodeURIComponent(id)}/fire`, // POST → { eventId }
  reset: "/api/reset", // POST → { ok: true } (demo only: clears events/trace)
} as const;

export const SSE_EVENT_NAME = "trace";
export const DEFAULT_SERVER_PORT = 8787;

export const HealthResponse = z.object({
  ok: z.literal(true),
  llmProvider: z.enum(["mock", "nvidia"]),
  model: z.string(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const CreatedEvent = z.object({ eventId: z.string() });
export type CreatedEvent = z.infer<typeof CreatedEvent>;

export const ReplyBody = z.object({ text: z.string().min(1), from: z.string().optional() });
export type ReplyBody = z.infer<typeof ReplyBody>;

/** Contacts as exposed over HTTP — never includes the safe word. */
export const PublicContact = TrustedContact.omit({ safeWord: true }).extend({ hasSafeWord: z.boolean() });
export type PublicContact = z.infer<typeof PublicContact>;

export const EventDetail = z.object({
  event: IncomingEvent,
  verdict: Verdict.optional(),
  verification: VerificationOutcome.optional(),
});
export type EventDetail = z.infer<typeof EventDetail>;
