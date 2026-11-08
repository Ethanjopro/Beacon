/**
 * Stage 5 — verify. Ask the real contact (via the host), interpret the reply,
 * and turn the answer into the strongest evidence Beacon has.
 */
import type { Signal, VerificationOutcome, VerificationRequest, VerificationResult, VerificationStatus } from "@beacon/shared";
import { REPLY_SYSTEM_PROMPT, buildReplyUserPrompt } from "../llm/prompts.js";
import { ReplyInterpretation, extractJson } from "../llm/schema.js";
import { scrubSafeWords, shortName } from "../privacy/redact.js";
import { makeClient } from "./analyze.js";
import { addSignal, stageCompleted, stageStarted, thought, type RunContext } from "./context.js";

/** Log-odds per outcome. Denied/confirmed are decisive; silence is only a nudge. */
export const VERIFICATION_WEIGHTS: Record<VerificationStatus, number> = {
  denied: 4.0,
  confirmed: -5.0,
  unclear: 0.3,
  timeout: 0.3,
  unreachable: 0,
  pending: 0,
};

// Word boundaries that understand accents ("sí", "envié") — JS \b is ASCII-only.
const words = (alternatives: string, lead = false) =>
  new RegExp(`${lead ? "^[^\\p{L}\\p{N}]*" : "(?<![\\p{L}\\p{N}])"}(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu");

const DENY_STRONG = words(
  "not me|wasn'?t me|was not me|isn'?t me|is not me|didn'?t (?:send|text|call|write|message)|did not (?:send|text|call)|never (?:sent|texted|called|asked)|(?:will|would) never (?:call|text|ask|email)|haven'?t (?:sent|texted|called|messaged|written|asked)|have not (?:sent|texted|called|messaged|asked)|(?:wasn'?t|was not|isn'?t|is not|not) us|pretending to be (?:me|us)|someone'?s pretending|not my (?:number|phone)|scam|fake|impostor|imposter|don'?t send|do not send|no fui yo|no soy yo|no era yo|yo no (?:fui|envi[eé]|mand[eé]|llam[eé]|escrib[ií])|no es mi n[uú]mero|estafa|no le (?:mandes|env[ií]es)",
);
const CONFIRM_STRONG = words(
  "that was me|that'?s me|it was me|it'?s me|its me|i sent (?:it|that)|i did send|i texted you|my new (?:number|phone)|(?<!no )(?:fui|soy|era) yo|(?<!no )es mi (?:nuevo )?n[uú]mero",
);
const DENY_LEAD = words("no+|nope|nah|nada|negative|absolutely not|definitely not|hell no", true);
const CONFIRM_LEAD = words("yes+|yeah|yep|yup|ya|sure|correct|confirmed|affirmative|s[ií]|claro|as[ií] es|of course", true);

/** Rules-only reading of a reply (English + Spanish). Strong phrases beat leading yes/no. */
export function classifyReplyText(text: string): "confirmed" | "denied" | "unclear" {
  const t = text.normalize("NFKC").trim().replace(/[’]/g, "'");
  const deny = DENY_STRONG.test(t);
  const confirm = CONFIRM_STRONG.test(t);
  if (deny && !confirm) return "denied";
  if (confirm && !deny) return "confirmed";
  if (deny && confirm) return "unclear";
  const leadDeny = DENY_LEAD.test(t);
  const leadConfirm = CONFIRM_LEAD.test(t);
  if (leadDeny && !leadConfirm) return "denied";
  if (leadConfirm && !leadDeny) return "confirmed";
  return "unclear";
}

/** Public, synchronous, rules-only interpretation (server + eval import this). */
export function interpretReply(request: VerificationRequest, result: VerificationResult, at: Date): VerificationOutcome {
  const base = { requestId: request.id, resolvedAt: at.toISOString() };
  const name = displayName(request.contactName);
  if (result.status !== "replied") {
    return {
      ...base,
      status: result.status,
      summary: result.status === "unreachable" ? `Couldn't reach ${name}.` : `${name} didn't answer in time.`,
    };
  }
  const text = result.reply.text;
  const status = classifyReplyText(text);
  return { ...base, status, replyText: text, summary: summaryFor(name, status, text) };
}

const displayName = (contactName: string) => contactName.replace(/\s*\(.*?\)\s*/g, " ").trim() || contactName;

function summaryFor(name: string, status: VerificationStatus, text: string): string {
  const quote = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  if (status === "denied") return `${name} replied "${quote}", so the message wasn't from ${name}.`;
  if (status === "confirmed") return `${name} replied "${quote}", so the message really was from ${name}.`;
  return `${name} replied: "${quote}"`;
}

export async function runVerify(ctx: RunContext, request: VerificationRequest, verify: (r: VerificationRequest) => Promise<VerificationResult>): Promise<void> {
  const contact = ctx.contacts.find((c) => c.id === request.contactId);
  const name = contact ? shortName(contact) : displayName(request.contactName);
  stageStarted(ctx, "verify", `Waiting for ${name}`);
  ctx.emit({ type: "verification.requested", request });

  const result = await safeVerify(verify, request);
  let outcome = interpretReply(request, result, ctx.now());
  if (outcome.status === "unclear" && result.status === "replied") outcome = await askFastModel(ctx, request, outcome);
  outcome = scrubOutcome(ctx, outcome);
  ctx.verification = { request, outcome };
  ctx.emit({ type: "verification.resolved", outcome });

  const weight = VERIFICATION_WEIGHTS[outcome.status];
  if (weight !== 0) addSignal(ctx, verificationSignal(name, outcome, weight));

  thought(ctx, verificationThought(name, outcome.status));
  stageCompleted(ctx, "verify", outcome.summary);
}

/** The host MUST resolve, but a demo can't hang on a bug: guard with the request's own timeout. */
async function safeVerify(verify: (r: VerificationRequest) => Promise<VerificationResult>, request: VerificationRequest): Promise<VerificationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      verify(request),
      new Promise<VerificationResult>((resolve) => {
        timer = setTimeout(() => resolve({ status: "timeout", detail: "no answer from host" }), request.timeoutMs + 2_000);
      }),
    ]);
  } catch (err) {
    return { status: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Ambiguous reply + cloud enabled → ask the fast model. Rules stay authoritative when it fails. */
async function askFastModel(ctx: RunContext, request: VerificationRequest, outcome: VerificationOutcome): Promise<VerificationOutcome> {
  if (ctx.config.llmProvider !== "nvidia" || !ctx.config.apiKey || !outcome.replyText) return outcome;
  try {
    const client = makeClient(ctx);
    const reply = await client.chat({
      model: ctx.config.fastModel,
      messages: [
        { role: "system", content: REPLY_SYSTEM_PROMPT },
        { role: "user", content: buildReplyUserPrompt(request.question, ctx.redactText(outcome.replyText)) },
      ],
      maxTokens: 300,
    });
    const { status } = ReplyInterpretation.parse(extractJson(reply.content ?? ""));
    ctx.privacy.note("The contact's ambiguous reply was redacted and read by the fast model");
    const name = displayName(request.contactName);
    return { ...outcome, status, summary: summaryFor(name, status, outcome.replyText) };
  } catch {
    return outcome;
  }
}

/** Safe words must never reach a trace, even inside the contact's own reply. */
function scrubOutcome(ctx: RunContext, outcome: VerificationOutcome): VerificationOutcome {
  const scrub = (s: string) => scrubSafeWords(s, ctx.contacts).text;
  return { ...outcome, summary: scrub(outcome.summary), ...(outcome.replyText !== undefined ? { replyText: scrub(outcome.replyText) } : {}) };
}

function verificationSignal(name: string, outcome: VerificationOutcome, weight: number): Signal {
  const titles: Partial<Record<VerificationStatus, string>> = {
    denied: `The real ${name} denied sending it`,
    confirmed: `The real ${name} confirmed sending it`,
    timeout: `${name} hasn't answered yet`,
    unclear: `${name}'s answer was unclear`,
  };
  const details: Partial<Record<VerificationStatus, string>> = {
    denied: `Beacon asked the real ${name} on the contact saved in your phone, and the answer was no.`,
    confirmed: `Beacon asked the real ${name} on the contact saved in your phone, and the answer was yes.`,
    timeout: `We couldn't confirm the claim yet — treat it with caution until you reach ${name} at the number saved in your phone.`,
    unclear: `${outcome.summary} We couldn't tell if that's a yes or a no.`,
  };
  return { id: `verification_${outcome.status}`, title: titles[outcome.status] ?? name, detail: details[outcome.status] ?? outcome.summary, weight, source: "verification" };
}

function verificationThought(name: string, status: VerificationStatus): string {
  switch (status) {
    case "denied":
      return `The real ${name} denied sending it. This is an impostor.`;
    case "confirmed":
      return `The real ${name} confirmed sending it.`;
    case "timeout":
      return `${name} hasn't answered — staying cautious.`;
    case "unreachable":
      return `Couldn't reach ${name} — staying cautious.`;
    default:
      return `Couldn't tell what ${name} meant — staying cautious.`;
  }
}
