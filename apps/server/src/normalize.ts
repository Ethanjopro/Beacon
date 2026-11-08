/**
 * Every way a call can reach Magenta-Guard is normalized here into ONE shape
 * before the screener sees it: an IncomingEvent of kind "call", plus the
 * caller's first words and (sim only) a script. Sim injection, scenario fire
 * and the Photon webhook all go through the same function, so the pipeline
 * after this point can't tell them apart.
 */
import { NewCall, type NewEvent, type Scenario } from "@beacon/shared";

export interface NormalizedCall {
  event: NewEvent & { kind: "call" };
  /** What the caller says right after the greeting, if we already know it. */
  firstWords?: string;
  /** Sim only: further caller lines, one per time the screener listens. */
  script?: string[];
}

const clean = (s: string | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

/**
 * Handle normalization so "(555) 010-0142", "+1 555-010-0142" and "5550100142"
 * all compare equal. Emails/platform handles are trimmed + lowercased.
 */
export function normalizeHandle(raw: string): string {
  const s = raw.trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return s.toLowerCase();
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** POST /webhooks/photon: normalize a signed Photon message event into a call. */
export function normalizePhotonWebhook(input: unknown): NormalizedCall {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid Photon webhook payload: expected object");
  }
  const raw = input as Record<string, any>;
  const msg = raw.message ?? raw;
  const senderId =
    msg.sender?.id ??
    msg.senderId ??
    msg.sender?.handle ??
    msg.from?.handle ??
    msg.from ??
    raw.from?.handle ??
    raw.from;
  if (!senderId || typeof senderId !== "string" || !senderId.trim()) {
    throw new Error("Invalid Photon webhook payload: missing sender handle");
  }

  const rawText =
    (typeof msg.content === "object" && msg.content ? msg.content.text : undefined) ??
    msg.text ??
    msg.body ??
    raw.text ??
    "";
  const text = typeof rawText === "string" ? rawText : "";
  const displayName =
    clean(msg.sender?.displayName) ??
    clean(msg.sender?.name) ??
    clean(raw.from?.displayName);

  const handle = senderId.trim();

  return {
    event: {
      kind: "call",
      source: "photon",
      from: { handle, ...(displayName ? { displayName } : {}) },
      body: "",
      threadId: `call_${handle}`,
    },
    firstWords: clean(text),
  };
}

/** POST /api/calls (sim injection, judge input). Throws a ZodError on bad input. */
export function normalizeSimCall(input: unknown): NormalizedCall {
  const call = NewCall.parse(input);
  const displayName = clean(call.from.displayName);
  return {
    event: {
      kind: "call",
      source: call.source,
      from: { handle: call.from.handle.trim(), ...(displayName ? { displayName } : {}) },
      body: "",
      threadId: `call_${call.from.handle.trim()}`,
      ...(call.scenarioId ? { scenarioId: call.scenarioId } : {}),
    },
    firstWords: clean(call.firstWords),
  };
}

/** A call scenario from the library: same normalized shape, with the caller's lines as a script. */
export function normalizeScenarioCall(scenario: Scenario): NormalizedCall {
  const lines = scenario.callerScript ?? (scenario.event.transcript ?? []).filter((s) => s.speaker === "caller").map((s) => s.text);
  const [firstWords, ...script] = lines;
  const base = normalizeSimCall({ from: scenario.event.from, source: "scenario", scenarioId: scenario.id, firstWords });
  return { ...base, script };
}

/** A generic NewEvent of kind "call" (e.g. from apps/channels): its transcript's caller lines become the script. */
export function normalizeEventCall(event: NewEvent): NormalizedCall {
  const lines = (event.transcript ?? []).filter((s) => s.speaker === "caller").map((s) => s.text);
  const [firstWords, ...script] = lines.length ? lines : event.body ? [event.body] : [];
  return {
    event: { ...event, kind: "call", body: "", transcript: undefined },
    firstWords: clean(firstWords),
    script,
  };
}
