/**
 * @beacon/agent — the brain. Public API:
 *   createAgent(deps, overrides?, internals?) → { config, run(event) → Verdict }
 *   interpretReply(request, result, at) → VerificationOutcome
 *
 * Pipeline (one module per stage in ./pipeline):
 *   ingest → triage → analyze → challenge → verify → verdict → recover
 * See packages/agent/AGENTS.md for the design and rules.
 */
import { DEFAULT_AGENT_CONFIG, type Agent, type AgentConfig, type AgentDeps, type IncomingEvent, type TraceBody, type Verdict } from "@beacon/shared";
import { PrivacyLedger } from "./privacy/ledger.js";
import { redact } from "./privacy/redact.js";
import { runAnalyze } from "./pipeline/analyze.js";
import { runChallenge } from "./pipeline/challenge.js";
import { stageCompleted, stageStarted, thought, type AgentInternals, type RunContext } from "./pipeline/context.js";
import { ingest, ingestThought } from "./pipeline/ingest.js";
import { buildRecovery } from "./pipeline/recover.js";
import { Evidence } from "./pipeline/score.js";
import { runTriage } from "./pipeline/triage.js";
import { decide } from "./pipeline/verdict.js";
import { runVerify } from "./pipeline/verify.js";

export { interpretReply, classifyReplyText } from "./pipeline/verify.js";
/** For hosts: scrub safe words from anything they trace themselves (e.g. `event.received`). */
export { scrubSafeWords } from "./privacy/redact.js";
export type { AgentInternals } from "./pipeline/context.js";
/** Magenta-Guard call screener (Nemotron only, no offline brain). */
export { createScreener, applyGate, codeWordMatches, type ScreenerOptions } from "./screener/index.js";

const DEFAULT_LLM_TIMEOUT_MS = 12_000;
const THREAD_MEMORY = { messagesPerThread: 5, threads: 200 };

export function createAgent(deps: AgentDeps, overrides: Partial<AgentConfig> = {}, internals: AgentInternals = {}): Agent {
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...overrides };
  const now = deps.now ?? (() => new Date());
  const resolvedInternals: Required<AgentInternals> = {
    fetch: internals.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
    llmTimeoutMs: internals.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    threadMemory: internals.threadMemory ?? true,
  };
  /** Earlier messages per threadId (scrubbed local text, in memory only). */
  const threads = new Map<string, string[]>();

  async function run(event: IncomingEvent): Promise<Verdict> {
    const started = now().getTime();
    const emit = (body: TraceBody) => {
      try {
        deps.emit(event.id, body);
      } catch {
        // emit is fire-and-forget; a broken listener must not break the verdict.
      }
    };
    let ctx: RunContext | undefined;
    try {
      ctx = buildContext(event, emit);
      await runPipeline(ctx, deps);
      const verdict = finalize(ctx, started);
      remember(event, ctx.localText);
      emit({ type: "verdict", verdict });
      return verdict;
    } catch (err) {
      emit({ type: "error", message: `Beacon hit an internal error: ${err instanceof Error ? err.message : String(err)}` });
      const verdict = conservativeVerdict(event, ctx, started);
      emit({ type: "verdict", verdict });
      return verdict;
    }
  }

  function buildContext(event: IncomingEvent, emit: (body: TraceBody) => void): RunContext {
    const contacts = deps.contacts();
    const ingested = ingest(event, contacts);
    return {
      event,
      config,
      internals: resolvedInternals,
      contacts,
      now,
      emit,
      localText: ingested.localText,
      redacted: ingested.redacted,
      // A forwarded message isn't part of the forwarder's conversation, so it neither reads nor writes thread memory.
      threadHistory: event.threadId && event.source !== "forwarded" ? [...(threads.get(event.threadId) ?? [])] : [],
      redactText: (text) => redact(text, contacts).text,
      evidence: new Evidence(),
      privacy: new PrivacyLedger(ingested.redacted.counts),
      stagesRun: [],
      triageType: "none",
    };
  }

  function remember(event: IncomingEvent, localText: string): void {
    if (!resolvedInternals.threadMemory || !event.threadId || !localText || event.source === "forwarded") return;
    const list = threads.get(event.threadId) ?? [];
    list.push(localText);
    threads.delete(event.threadId); // re-insert → most recent last (cheap LRU)
    threads.set(event.threadId, list.slice(-THREAD_MEMORY.messagesPerThread));
    if (threads.size > THREAD_MEMORY.threads) threads.delete(threads.keys().next().value!);
  }

  return { config, run };
}

async function runPipeline(ctx: RunContext, deps: AgentDeps): Promise<void> {
  // ingest (the work happened in buildContext; this reports it)
  stageStarted(ctx, "ingest");
  thought(ctx, ingestThought(ctx.redacted.counts));
  if (ctx.contacts.some((c) => c.safeWord)) ctx.privacy.note("Safe words are checked on this device only — never sent, logged or shown");
  ctx.emit({ type: "privacy", report: ctx.privacy.report() });
  stageCompleted(ctx, "ingest");

  runTriage(ctx);

  await runAnalyze(ctx);
  if (ctx.privacy.sentToCloud) {
    if (ctx.redacted.counts.contact_name) ctx.privacy.note("Contact names were replaced with relationships");
    ctx.privacy.note("Only the redacted message was sent to the cloud model");
    ctx.emit({ type: "privacy", report: ctx.privacy.report() });
  }

  const request = runChallenge(ctx);
  if (request) await runVerify(ctx, request, deps.verify);
  else ctx.emit({ type: "stage", stage: "verify", status: "skipped", note: "Nobody to ask" });
}

function finalize(ctx: RunContext, started: number): Verdict {
  stageStarted(ctx, "verdict");
  const decision = decide(ctx);
  stageCompleted(ctx, "verdict", `${decision.label.toUpperCase()} · ${Math.round(decision.pScam * 100)}%`);

  stageStarted(ctx, "recover");
  const recovery = buildRecovery({
    label: decision.label,
    scamType: decision.scamType,
    exposure: ctx.event.exposure,
    claimedContact: ctx.claim && !ctx.evidence.has("known_sender") ? ctx.claim.contact : undefined,
  });
  stageCompleted(ctx, "recover", recovery.length ? `${recovery.length} steps` : "Nothing to do");

  const outcome = ctx.verification?.outcome;
  return {
    eventId: ctx.event.id,
    label: decision.label,
    pScam: decision.pScam,
    confidence: decision.confidence,
    band: decision.band,
    scamType: decision.scamType,
    headline: decision.headline,
    signals: ctx.evidence.sorted(),
    verification: outcome && ctx.verification ? { status: outcome.status, contactName: ctx.verification.request.contactName, summary: outcome.summary } : undefined,
    recovery,
    privacy: ctx.privacy.report(),
    stagesRun: [...ctx.stagesRun],
    latencyMs: Math.max(0, ctx.now().getTime() - started),
    decidedAt: ctx.now().toISOString(),
  };
}

/** Last-resort verdict: honest "we're not sure", never a crash. */
function conservativeVerdict(event: IncomingEvent, ctx: RunContext | undefined, started: number): Verdict {
  const at = new Date();
  return {
    eventId: event.id,
    label: "suspicious",
    pScam: 0.5,
    confidence: 0.5,
    band: [0.2, 0.8],
    scamType: "other",
    headline: "Beacon couldn't finish checking this message — treat it with caution.",
    signals: ctx ? ctx.evidence.sorted() : [],
    recovery: buildRecovery({ label: "suspicious", scamType: "other", exposure: event.exposure }),
    privacy: ctx ? ctx.privacy.report() : { sentToCloud: false, redactions: {}, notes: ["Analysis stopped early"] },
    stagesRun: ctx ? [...ctx.stagesRun] : [],
    latencyMs: Math.max(0, at.getTime() - started),
    decidedAt: at.toISOString(),
  };
}
