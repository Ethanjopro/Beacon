/**
 * Shared per-run state. Every stage reads and writes one RunContext so the
 * orchestrator in src/index.ts stays a readable list of stage calls.
 */
import type {
  AgentConfig,
  AgentDeps,
  IncomingEvent,
  ScamType,
  Signal,
  Stage,
  TraceBody,
  TrustedContact,
  VerificationOutcome,
  VerificationRequest,
} from "@beacon/shared";
import type { RedactionResult } from "../privacy/redact.js";
import type { PrivacyLedger } from "../privacy/ledger.js";
import type { Evidence } from "./score.js";

/** Test/host internals that are not part of AgentConfig (injected via createAgent's 3rd param). */
export interface AgentInternals {
  /** HTTP client for the LLM. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-request LLM timeout. Default 12 000 ms. */
  llmTimeoutMs?: number;
  /** Remember earlier messages per threadId (default true). Eval harnesses sharing handles should turn this off. */
  threadMemory?: boolean;
}

/** What the message claims about who sent it. */
export interface Claim {
  contact: TrustedContact;
  /** How we noticed the claim (for the trace). */
  via: "display_name" | "self_identification" | "org_mention" | "addressed_as" | "llm";
}

/** Output of the analyze stage (mock brain or Nemotron), already validated. */
export interface Analysis {
  scamType: ScamType;
  claimedContactId?: string;
  claim: string;
  pScam: number;
  /** "llm" when Nemotron produced it; "device" for the mock brain. */
  producedBy: "llm" | "device";
}

export interface RunContext {
  event: IncomingEvent;
  config: AgentConfig;
  internals: Required<AgentInternals>;
  contacts: TrustedContact[];
  now: () => Date;
  emit: (body: TraceBody) => void;
  /** Evidence text on-device: body + CALLER transcript segments, safe words scrubbed. */
  localText: string;
  /** Same text with PII redacted — the only text allowed to leave the device. */
  redacted: RedactionResult;
  /** Earlier messages in the same thread (local text, safe words scrubbed). */
  threadHistory: string[];
  /** Redacts any extra text (thread history, contact replies) before it may leave the device. */
  redactText: (text: string) => string;
  evidence: Evidence;
  privacy: PrivacyLedger;
  stagesRun: Stage[];
  /** Triage's best guess at the scam type, by summed rule weight. */
  triageType: ScamType;
  claim?: Claim;
  analysis?: Analysis;
  verification?: { request: VerificationRequest; outcome: VerificationOutcome };
}

export function stageStarted(ctx: RunContext, stage: Stage, note?: string): void {
  ctx.emit({ type: "stage", stage, status: "started", ...(note ? { note } : {}) });
}

export function stageCompleted(ctx: RunContext, stage: Stage, note?: string): void {
  if (!ctx.stagesRun.includes(stage)) ctx.stagesRun.push(stage);
  ctx.emit({ type: "stage", stage, status: "completed", ...(note ? { note } : {}) });
}

export function stageSkipped(ctx: RunContext, stage: Stage, note: string): void {
  ctx.emit({ type: "stage", stage, status: "skipped", note });
}

export function thought(ctx: RunContext, text: string): void {
  ctx.emit({ type: "thought", text });
}

/** Adds evidence, emits `signal` + `score`. Returns false (and emits nothing) on duplicate ids. */
export function addSignal(ctx: RunContext, signal: Signal): boolean {
  if (!ctx.evidence.add(signal)) return false;
  ctx.emit({ type: "signal", signal });
  ctx.emit({ type: "score", pScam: ctx.evidence.pScam() });
  return true;
}
