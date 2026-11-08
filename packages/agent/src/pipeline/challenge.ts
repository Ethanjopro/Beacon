/**
 * Stage 4 — challenge. Turn "this message claims to be Mom" into a question
 * for the REAL Mom, sent only to her known-good handle from the registry.
 * The question is built from fixed phrases — never from message text — so a
 * scammer's link or callback number can't ride along.
 */
import type { VerificationRequest } from "@beacon/shared";
import { RULES } from "../triage/rules.js";
import { shortName } from "../privacy/redact.js";
import { isKnownHandle, isOrg } from "../tools/contacts.js";
import { stageCompleted, stageSkipped, stageStarted, thought, type RunContext } from "./context.js";

/** Below this, a claimed identity isn't worth bothering the real person about. */
export const CHALLENGE_MIN_PSCAM = 0.2;

export function runChallenge(ctx: RunContext): VerificationRequest | undefined {
  const claim = ctx.claim;
  if (!claim) {
    stageSkipped(ctx, "challenge", "Doesn't claim to be anyone you trust");
    return undefined;
  }
  const name = shortName(claim.contact);
  if (isKnownHandle(ctx.event.from.handle, claim.contact)) {
    stageSkipped(ctx, "challenge", `Really from ${name}'s saved number`);
    return undefined;
  }
  if (ctx.evidence.pScam() < CHALLENGE_MIN_PSCAM) {
    stageSkipped(ctx, "challenge", `Low risk — no need to bother ${name}`);
    return undefined;
  }

  stageStarted(ctx, "challenge");
  const org = isOrg(claim.contact);
  thought(
    ctx,
    org
      ? `${name} doesn't send from this number — checking with ${name} directly.`
      : `${name} doesn't text from this number — asking the real ${name}.`,
  );
  const request: VerificationRequest = {
    id: `ver_${ctx.event.id}`,
    eventId: ctx.event.id,
    contactId: claim.contact.id,
    contactName: claim.contact.name,
    channel: claim.contact.verifyVia.channel,
    to: claim.contact.verifyVia.handle, // known-good handle ONLY — never the sender
    question: buildQuestion(ctx),
    claim: stripUnsafe(ctx.analysis?.claim || `Says it's ${name}.`),
    sentAt: ctx.now().toISOString(),
    timeoutMs: ctx.config.verifyTimeoutMs,
  };
  stageCompleted(ctx, "challenge", `Question ready for ${name}`);
  return request;
}

/** What the message wants, from the strongest rule that has a plain-words phrase. */
function askPhrase(ctx: RunContext): string {
  const asks = RULES.filter((r) => r.ask && ctx.evidence.has(r.id)).sort((a, b) => b.weight - a.weight);
  return asks[0]?.ask ?? "asking them to act quickly";
}

function channelVerb(ctx: RunContext): string {
  switch (ctx.event.kind) {
    case "call":
      return "calling";
    case "voicemail":
      return "leaving voicemails";
    default:
      return "texting";
  }
}

export function buildQuestion(ctx: RunContext): string {
  const contact = ctx.claim!.contact;
  const name = shortName(contact);
  const verb = channelVerb(ctx);
  const q = isOrg(contact)
    ? `Hello ${name}, this is Beacon, a scam-safety assistant for one of your customers. Someone ${verb} them from a number that isn't on your list says they're ${name} and is ${askPhrase(ctx)}. Was that really you? Reply YES or NO.`
    : `Hi ${name}, it's Beacon, your family's scam-safety assistant. Someone ${verb} from a number we don't recognize says they're you and is ${askPhrase(ctx)}. Was that you? Reply YES or NO.`;
  return stripUnsafe(q);
}

/** Defense in depth: no links and no digit runs may ever appear in a verification question. */
export function stripUnsafe(text: string): string {
  return text
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|net|org|top|xyz|info|co|us|io|ly|example|gov)\b\S*/gi, "[link removed]")
    .replace(/\+?\d[\d\s().-]{2,}\d/g, "[number removed]");
}
