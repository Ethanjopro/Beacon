/**
 * Per-call state for the screener, plus the small helpers every part of it
 * uses to speak, hear, and report progress on the trace.
 */
import type {
  AgentConfig,
  CallStatus,
  IncomingEvent,
  ScreenerDeps,
  ScreeningChecks,
  Signal,
  TraceBody,
  TrustedContact,
  VerificationOutcome,
  VerificationRequest,
} from "@beacon/shared";
import { PrivacyLedger } from "../privacy/ledger.js";
import { redact, scrubSafeWords, type RedactionResult } from "../privacy/redact.js";

export interface ScreenerOptions {
  /** Used in the spoken greeting ("you've reached Rosa's phone"). Optional. */
  subscriberName?: string;
  /** How many caller utterances to hear before Nemotron must decide. Default 4. */
  maxCallerTurns?: number;
  /** How long to wait for the caller to speak. Default 30 s. */
  listenTimeoutMs?: number;
  /** Per Nemotron request. Default 30 s (reasoning + tool calls). */
  llmTimeoutMs?: number;
  /** HTTP client for Nemotron (tests inject a fake). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface Turn {
  speaker: "agent" | "caller";
  /** Shown on the phone: code words scrubbed. */
  local: string;
  /** Sent to Nemotron: fully redacted. */
  cloud: string;
}

export interface ScreenCtx {
  call: IncomingEvent;
  config: AgentConfig;
  deps: ScreenerDeps;
  options: Required<Omit<ScreenerOptions, "subscriberName">> & { subscriberName?: string };
  contacts: TrustedContact[];
  now: () => Date;
  emit: (body: TraceBody) => void;
  turns: Turn[];
  /** The caller's latest words, unredacted, kept on the server only (code-word check). */
  lastCallerRaw: string;
  /** Mutable redaction counts, shared with the privacy ledger. */
  redactions: RedactionResult["counts"];
  privacy: PrivacyLedger;
  claimed?: TrustedContact;
  checks: ScreeningChecks;
  codeWordAttempts: number;
  signalIds: Set<string>;
  callback?: { request: VerificationRequest; outcome: VerificationOutcome };
  status: CallStatus;
}

export function setStatus(ctx: ScreenCtx, status: CallStatus, note?: string): void {
  ctx.status = status;
  ctx.emit({ type: "call.status", status, ...(note ? { note } : {}) });
}

/** Placeholders and CONTACT_n refs must never be spoken to a caller. */
export function speakable(text: string): string {
  return text
    .replace(/\[[A-Z_]+(?:_\d+)?(?: \([a-z]+\))?\]/g, "them")
    .replace(/\bCONTACT_\d+\b/gi, "them")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(ctx: ScreenCtx, text: string): void {
  const line = speakable(text);
  if (!line) return;
  ctx.turns.push({ speaker: "agent", local: line, cloud: line });
  ctx.emit({ type: "call.turn", speaker: "agent", text: line });
}

export function hear(ctx: ScreenCtx, raw: string): void {
  const local = scrubSafeWords(raw, ctx.contacts).text;
  const red = redact(raw, ctx.contacts);
  for (const [kind, n] of Object.entries(red.counts)) {
    const k = kind as keyof RedactionResult["counts"];
    ctx.redactions[k] = (ctx.redactions[k] ?? 0) + (n ?? 0);
  }
  ctx.lastCallerRaw = raw;
  ctx.turns.push({ speaker: "caller", local, cloud: red.text });
  ctx.emit({ type: "call.turn", speaker: "caller", text: local });
}

/** Adds evidence once per id; emits `signal`. */
export function addSignal(ctx: ScreenCtx, signal: Signal): void {
  if (ctx.signalIds.has(signal.id)) return;
  ctx.signalIds.add(signal.id);
  ctx.emit({ type: "signal", signal });
}

export function resolveRef(ctx: ScreenCtx, ref: unknown): TrustedContact | undefined {
  if (typeof ref !== "string") return undefined;
  const m = /contact_(\d+)/i.exec(ref);
  if (m) return ctx.contacts[Number(m[1]) - 1];
  return ctx.contacts.find((c) => c.id === ref);
}

export function callerText(ctx: ScreenCtx, form: "local" | "cloud"): string {
  return ctx.turns
    .filter((t) => t.speaker === "caller")
    .map((t) => t[form])
    .join("\n");
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "signal";
