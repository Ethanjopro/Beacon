/**
 * Tools Nemotron calls while screening. They run on the server, see the raw
 * registry, and hand the model only what it needs: refs, booleans, statuses.
 * Code words and saved numbers never appear in a tool result or a trace.
 */
import type { VerificationOutcome, VerificationRequest, VerificationResult } from "@beacon/shared";
import { LlmClient } from "../llm/client.js";
import { ReplyInterpretation, extractJson } from "../llm/schema.js";
import { matchRule } from "../pipeline/triage.js";
import { stripUnsafe } from "../pipeline/challenge.js";
import { RULES } from "../triage/rules.js";
import { lookupContact } from "../tools/contacts.js";
import { searchScamLibrary } from "../tools/library.js";
import { redact, scrubSafeWords, shortName } from "../privacy/redact.js";
import { CALLBACK_REPLY_SYSTEM_PROMPT, buildCallbackReplyPrompt } from "./prompts.js";
import { addSignal, callerText, resolveRef, setStatus, type ScreenCtx } from "./context.js";

export const SCREENER_TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_trusted_contact",
      description:
        "Look up who the caller claims to be among the subscriber's trusted contacts, by CONTACT_n reference or a role word ('grandson', 'mom', 'my bank'). Returns the relationship, whether a family code word is on file, whether the caller's number is one of their saved numbers, and whether a callback number is on file. Never returns names, numbers or the code word.",
      parameters: {
        type: "object",
        properties: { claim: { type: "string", description: "CONTACT_n reference or role word" } },
        required: ["claim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_code_word",
      description:
        "Check the caller's MOST RECENT answer against the family code word on file for the contact they claim to be. Compared on the server; you only learn match or no_match. Call it right after the caller answers your code-word question.",
      parameters: {
        type: "object",
        properties: { contact_ref: { type: "string", description: "CONTACT_n of the claimed contact" } },
        required: ["contact_ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_risk_patterns",
      description:
        "Scan everything the caller has said for known scam tactics (gift cards, wire or crypto, secrecy, urgency, arrest or bail, threats, attempts to instruct an AI) and find the closest known scam script. Runs on the server.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "request_callback",
      description:
        "Out-of-band verification: call the claimed contact on their SAVED callback number (never a number the caller gave) and ask your question. Waits for their answer (up to about a minute) and returns confirmed, denied, unclear, no_answer or unreachable. Use at most once per call.",
      parameters: {
        type: "object",
        properties: {
          contact_ref: { type: "string", description: "CONTACT_n of the claimed contact" },
          question: { type: "string", description: "What to ask the real contact, in one or two plain sentences. No phone numbers or links." },
        },
        required: ["contact_ref", "question"],
      },
    },
  },
] as const;

/** Executes a screener tool, emitting `tool` traces. Never throws. */
export async function runScreenerTool(ctx: ScreenCtx, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "lookup_trusted_contact":
        return lookupTrusted(ctx, typeof args.claim === "string" ? args.claim : "");
      case "check_code_word":
        return checkCodeWord(ctx, args.contact_ref);
      case "scan_risk_patterns":
        return scanRiskPatterns(ctx);
      case "request_callback":
        return await requestCallback(ctx, args.contact_ref, typeof args.question === "string" ? args.question : "");
      default:
        ctx.emit({ type: "tool", name, status: "error", summary: `Unknown tool ${name}` });
        return { error: `unknown tool ${name}` };
    }
  } catch (err) {
    ctx.emit({ type: "tool", name, status: "error", summary: "Tool failed" });
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function lookupTrusted(ctx: ScreenCtx, claim: string): unknown {
  const name = "lookup_trusted_contact";
  ctx.emit({ type: "tool", name, status: "called", summary: `Who is "${claim.slice(0, 40)}"?` });
  const found = lookupContact(claim, ctx.contacts, ctx.call.from.handle);
  const contact = found ? resolveRef(ctx, found.ref) : undefined;
  if (!found || !contact) {
    ctx.emit({ type: "tool", name, status: "result", summary: "Not in the subscriber's trusted contacts" });
    return { found: false };
  }
  ctx.claimed ??= contact;
  const hasCodeWord = Boolean(contact.safeWord?.trim());
  ctx.emit({
    type: "tool",
    name,
    status: "result",
    summary: `Trusted ${contact.relationship} contact (${shortName(contact)}) · caller's number is ${found.senderIsKnownHandle ? "" : "NOT "}saved for them · code word ${hasCodeWord ? "on file" : "not set"}`,
  });
  return {
    found: true,
    ref: found.ref,
    relationship: found.relationship,
    is_organization: found.isOrganization,
    caller_number_is_saved_for_them: found.senderIsKnownHandle,
    has_code_word: hasCodeWord,
    callback_number_on_file: true,
  };
}

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizePhrase(s: string): string {
  return ` ${s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** True when the attempt contains the whole code word as words ("it's blue heron!" matches "Blue Heron"). */
export function codeWordMatches(attempt: string, codeWord: string): boolean {
  const word = normalizePhrase(codeWord);
  return word.trim().length > 0 && normalizePhrase(attempt).includes(word);
}

function checkCodeWord(ctx: ScreenCtx, ref: unknown): unknown {
  const name = "check_code_word";
  const contact = ctx.claimed ?? resolveRef(ctx, ref);
  ctx.emit({ type: "tool", name, status: "called", summary: "Checking the caller's answer against the family code word (on the server — never sent to the model)" });
  if (!contact) {
    ctx.emit({ type: "tool", name, status: "error", summary: "No claimed contact to check against" });
    return { error: "look up the claimed contact first" };
  }
  if (!contact.safeWord?.trim()) {
    if (ctx.checks.codeWord === "not_checked") ctx.checks.codeWord = "none_on_file";
    ctx.emit({ type: "tool", name, status: "result", summary: `No code word on file for ${shortName(contact)}` });
    return { result: "no_code_word_on_file" };
  }
  setStatus(ctx, "challenging", `Code word check for ${shortName(contact)}`);
  ctx.codeWordAttempts++;
  const match = codeWordMatches(ctx.lastCallerRaw, contact.safeWord);
  if (match) ctx.checks.codeWord = "matched";
  else if (ctx.checks.codeWord !== "matched") ctx.checks.codeWord = "failed";
  ctx.emit({ type: "tool", name, status: "result", summary: match ? "Code word matched" : `Wrong or missing code word (attempt ${ctx.codeWordAttempts})` });
  return { result: match ? "match" : "no_match", attempts: ctx.codeWordAttempts };
}

function scanRiskPatterns(ctx: ScreenCtx): unknown {
  const name = "scan_risk_patterns";
  ctx.emit({ type: "tool", name, status: "called", summary: "Scanning the caller's words for known scam tactics" });
  const local = callerText(ctx, "local");
  const hits: { id: string; title: string; weight: number }[] = [];
  for (const rule of RULES) {
    const m = matchRule(rule, local);
    if (!m) continue;
    hits.push({ id: rule.id, title: rule.title, weight: rule.weight });
    addSignal(ctx, { id: rule.id, title: rule.title, detail: rule.detail, weight: rule.weight, source: "heuristic", evidence: m[0].slice(0, 120) });
  }
  const top = searchScamLibrary(callerText(ctx, "cloud"))[0];
  const closest = top && top.similarity >= 0.2 ? { title: top.pattern.title, scam_type: top.pattern.scamType, similarity: Math.round(top.similarity * 100) / 100 } : null;
  const red = hits.filter((h) => h.weight > 0);
  ctx.emit({
    type: "tool",
    name,
    status: "result",
    summary: red.length
      ? `${red.length} scam tactic${red.length === 1 ? "" : "s"}: ${red.map((h) => h.title.toLowerCase()).join("; ")}${closest ? ` · closest script: ${closest.title}` : ""}`
      : closest
        ? `No tactic keywords · closest script: ${closest.title}`
        : "No known scam tactics in the caller's words",
  });
  return { tactics: hits, closest_known_scam: closest };
}

async function requestCallback(ctx: ScreenCtx, ref: unknown, rawQuestion: string): Promise<unknown> {
  const name = "request_callback";
  if (ctx.callback) return { status: callbackStatus(ctx.callback.outcome.status), note: "already called once" };
  const contact = ctx.claimed ?? resolveRef(ctx, ref);
  if (!contact) {
    ctx.emit({ type: "tool", name, status: "error", summary: "No claimed contact to call back" });
    return { error: "look up the claimed contact first" };
  }
  const question = stripUnsafe(rawQuestion).trim().slice(0, 400);
  if (question.length < 8) return { error: "question required: what should we ask the real contact?" };

  const who = shortName(contact);
  const request: VerificationRequest = {
    id: `ver_${ctx.call.id}`,
    eventId: ctx.call.id,
    contactId: contact.id,
    contactName: contact.name,
    channel: contact.verifyVia.channel,
    to: contact.verifyVia.handle, // known-good number from the registry ONLY — never the caller's
    question,
    claim: `Caller says they are ${who}`,
    sentAt: ctx.now().toISOString(),
    timeoutMs: ctx.config.verifyTimeoutMs,
  };
  setStatus(ctx, "verifying", `Caller on hold · calling ${who}'s saved number`);
  ctx.emit({ type: "tool", name, status: "called", summary: `Calling ${who} on their saved number (${contact.verifyVia.channel})` });
  ctx.emit({ type: "verification.requested", request });

  const result = await safeVerify(ctx, request);
  let status: VerificationOutcome["status"];
  let replyText: string | undefined;
  if (result.status === "replied") {
    replyText = scrubSafeWords(result.reply.text, ctx.contacts).text;
    status = await classifyReply(ctx, question, result.reply.text);
  } else {
    status = result.status;
  }
  const outcome: VerificationOutcome = {
    requestId: request.id,
    status,
    ...(replyText !== undefined ? { replyText } : {}),
    summary:
      replyText !== undefined
        ? `${who} answered: "${replyText.length > 90 ? `${replyText.slice(0, 87)}…` : replyText}"`
        : status === "timeout"
          ? `${who} didn't answer in time.`
          : `Couldn't reach ${who}.`,
    resolvedAt: ctx.now().toISOString(),
  };
  ctx.callback = { request, outcome };
  ctx.checks.callback = callbackStatus(status);
  ctx.emit({ type: "verification.resolved", outcome });
  ctx.emit({ type: "tool", name, status: "result", summary: `${who}: ${ctx.checks.callback.replace("_", " ")}` });
  setStatus(ctx, "screening");
  return {
    status: ctx.checks.callback,
    ...(result.status === "replied" ? { answer: redact(result.reply.text, ctx.contacts).text.slice(0, 300) } : {}),
  };
}

function callbackStatus(status: VerificationOutcome["status"]): ScreenCtx["checks"]["callback"] {
  switch (status) {
    case "confirmed":
    case "denied":
    case "unclear":
    case "unreachable":
      return status;
    case "timeout":
      return "no_answer";
    default:
      return "unclear";
  }
}

/** The host MUST resolve, but a demo can't hang on a bug: guard with the request's own timeout. */
async function safeVerify(ctx: ScreenCtx, request: VerificationRequest): Promise<VerificationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ctx.deps.verify(request),
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

/** Nemotron reads the contact's answer (fast model first, then the deep model). If both fail: "unclear". */
async function classifyReply(ctx: ScreenCtx, question: string, reply: string): Promise<"confirmed" | "denied" | "unclear"> {
  const text = scrubSafeWords(reply, ctx.contacts).text;
  for (const model of [ctx.config.fastModel, ctx.config.model]) {
    try {
      const client = new LlmClient({
        baseUrl: ctx.config.baseUrl,
        apiKey: ctx.config.apiKey,
        fetch: ctx.options.fetch,
        timeoutMs: Math.min(ctx.options.llmTimeoutMs, 20_000),
        deadlineMs: Math.min(ctx.options.llmTimeoutMs, 20_000) * 2,
        onDispatch: (m) => ctx.privacy.recordCloudCall(m),
      });
      const answer = await client.chat({
        model,
        messages: [
          { role: "system", content: CALLBACK_REPLY_SYSTEM_PROMPT },
          { role: "user", content: buildCallbackReplyPrompt(question, text) },
        ],
        maxTokens: 1024,
        temperature: 0,
      });
      return ReplyInterpretation.parse(extractJson(answer.content ?? "")).status;
    } catch {
      // try the next model
    }
  }
  return "unclear";
}
