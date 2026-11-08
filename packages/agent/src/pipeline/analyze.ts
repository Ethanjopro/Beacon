/**
 * Stage 3 — analyze. Decides whether the cloud is needed at all, then runs
 * Nemotron with tools (nvidia) or the deterministic mock brain (mock, or
 * fallback). LLM evidence is bounded so one model opinion can't dominate.
 */
import { DEFAULT_AGENT_CONFIG, logit } from "@beacon/shared";
import { LlmClient, runToolLoop, type ChatMessage } from "../llm/client.js";
import { runMockBrain, describeClaim } from "../llm/mock.js";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt } from "../llm/prompts.js";
import { AnalysisOutput, extractJson } from "../llm/schema.js";
import { runTool, TOOL_DEFINITIONS } from "../tools/index.js";
import { contactBySender } from "../tools/contacts.js";
import { boundLlmWeights } from "./score.js";
import { isShortCode } from "./triage.js";
import { addSignal, stageCompleted, stageSkipped, stageStarted, thought, type RunContext } from "./context.js";

export type CloudDecision = { analyze: true } | { analyze: false; reason: "clearly_safe" | "clearly_scam" };

/** Privacy + cost: obviously-safe messages never leave the phone; obvious scams don't need the cloud either. */
export function decideCloud(ctx: RunContext): CloudDecision {
  const p = ctx.evidence.pScam();
  if (p < ctx.config.skipCloudBelow) return { analyze: false, reason: "clearly_safe" };
  if (p >= ctx.config.skipCloudAbove && !ctx.claim) return { analyze: false, reason: "clearly_scam" };
  return { analyze: true };
}

export async function runAnalyze(ctx: RunContext): Promise<void> {
  const decision = decideCloud(ctx);
  if (!decision.analyze) {
    const note = decision.reason === "clearly_safe" ? "Clearly safe — never left your phone" : "Clear-cut scam — decided on this device";
    ctx.privacy.note(decision.reason === "clearly_safe" ? "Clearly safe — the message never left your phone" : "Clear-cut scam — decided on this device, nothing sent to the cloud");
    thought(ctx, decision.reason === "clearly_safe" ? "Clearly safe — this never leaves your phone." : "Clear-cut scam — no need to send anything to the cloud.");
    stageSkipped(ctx, "analyze", note);
    ctx.analysis = { scamType: ctx.triageType, claim: describeClaim(ctx), pScam: ctx.evidence.pScam(), producedBy: "device", ...(ctx.claim ? { claimedContactId: ctx.claim.contact.id } : {}) };
    return;
  }

  if (ctx.config.llmProvider === "nvidia" && ctx.config.apiKey) {
    stageStarted(ctx, "analyze", `Asking ${modelLabel(ctx.config.model)}`);
    thought(ctx, `Sending the redacted message to ${modelLabel(ctx.config.model)} for a closer look.`);
    try {
      const output = await analyzeWithNemotron(ctx);
      applyAnalysis(ctx, output, "llm");
      stageCompleted(ctx, "analyze", `${modelLabel(ctx.config.model)}: ${Math.round(output.pScam * 100)}% scam`);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      ctx.emit({ type: "error", stage: "analyze", message: `Cloud model unavailable (${reason.slice(0, 120)})` });
      thought(ctx, "Cloud model unavailable — using on-device analysis.");
      ctx.privacy.note("Cloud model didn't answer — finished the analysis on this device");
    }
  } else {
    stageStarted(ctx, "analyze", "On-device analysis");
    thought(ctx, "Taking a closer look on this device.");
    ctx.privacy.note("Offline mode — analysis ran on this device");
  }

  const output = runMockBrain(ctx);
  applyAnalysis(ctx, output, "device");
  stageCompleted(ctx, "analyze", "On-device analysis");
}

async function analyzeWithNemotron(ctx: RunContext): Promise<AnalysisOutput> {
  const client = makeClient(ctx);
  const handle = ctx.event.from.handle;
  const messages: ChatMessage[] = [
    { role: "system", content: ANALYZE_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildAnalyzeUserPrompt({
        kind: ctx.event.kind,
        redactedText: ctx.redacted.text,
        sender: {
          knownContact: Boolean(contactBySender(handle, ctx.contacts)),
          isEmail: handle.includes("@"),
          isShortCode: isShortCode(handle),
          displayNameGiven: Boolean(ctx.event.from.displayName),
        },
        contacts: ctx.contacts,
        triageSignals: ctx.evidence.signals,
        threadHistory: ctx.threadHistory.map((t) => redactForCloud(ctx, t)),
      }),
    },
  ];
  const req = { model: ctx.config.model, messages, tools: TOOL_DEFINITIONS };
  const loop = await runToolLoop(client, req, (name, args) => runTool(ctx, name, args));
  try {
    return AnalysisOutput.parse(extractJson(loop.content));
  } catch {
    // One corrective turn for malformed / invalid JSON, then give up (→ fallback).
    const repair = await client.chat({
      model: ctx.config.model,
      messages: [...loop.messages, { role: "user", content: "That was not valid JSON for the required schema. Reply with ONLY the JSON object." }],
    });
    return AnalysisOutput.parse(extractJson(repair.content ?? ""));
  }
}

export function makeClient(ctx: RunContext): LlmClient {
  return new LlmClient({
    baseUrl: ctx.config.baseUrl || DEFAULT_AGENT_CONFIG.baseUrl,
    apiKey: ctx.config.apiKey,
    fetch: ctx.internals.fetch,
    timeoutMs: ctx.internals.llmTimeoutMs,
    deadlineMs: ctx.internals.llmTimeoutMs * 2.5,
    onDispatch: (model) => ctx.privacy.recordCloudCall(model),
  });
}

/** Thread history is stored scrubbed but not redacted; redact before it leaves. */
function redactForCloud(ctx: RunContext, text: string): string {
  return ctx.redactText(text);
}

/** Fold an analysis into the run: claim, type, bounded LLM signals. */
function applyAnalysis(ctx: RunContext, output: AnalysisOutput, producedBy: "llm" | "device"): void {
  if (!ctx.claim && output.claimedContactId) {
    const contact = resolveContact(ctx, output.claimedContactId);
    if (contact) ctx.claim = { contact, via: "llm" };
  }
  if (producedBy === "llm") {
    const fresh = output.signals.filter((s) => !ctx.evidence.has(s.id) && !ctx.evidence.has(`llm_${slug(s.id)}`));
    for (const s of boundLlmWeights(fresh)) {
      if (s.weight === 0) continue;
      addSignal(ctx, { id: `llm_${slug(s.id)}`, title: s.title, detail: s.detail || "Nemotron's judgment.", weight: s.weight, source: "llm", ...(s.evidence ? { evidence: s.evidence } : {}) });
    }
  }
  ctx.analysis = {
    scamType: output.scamType,
    claim: output.claim || describeClaim(ctx),
    pScam: output.pScam,
    producedBy,
    ...(ctx.claim ? { claimedContactId: ctx.claim.contact.id } : {}),
  };
  if (producedBy === "llm") {
    const gap = Math.abs(logit(output.pScam) - ctx.evidence.logOdds());
    if (gap > 2) thought(ctx, "The model and the on-device checks disagree — widening the uncertainty band.");
  }
}

function resolveContact(ctx: RunContext, idOrRef: string) {
  const ref = /contact_(\d+)/i.exec(idOrRef);
  if (ref) return ctx.contacts[Number(ref[1]) - 1];
  return ctx.contacts.find((c) => c.id === idOrRef);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "signal";

const modelLabel = (model: string) => (/nemotron/i.test(model) ? "Nemotron" : model);
