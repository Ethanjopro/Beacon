/**
 * Stage 6 — verdict. Fuse evidence into pScam, label, honest band, scam type
 * and a one-sentence headline specific to this case.
 */
import { SCAM_TYPE_LABELS, confidenceFor, labelFor, type ScamType, type Signal, type VerdictLabel } from "@beacon/shared";
import { shortName } from "../privacy/redact.js";
import { RULES } from "../triage/rules.js";
import { contactBySender, isOrg } from "../tools/contacts.js";
import { bandFor } from "./score.js";
import type { RunContext } from "./context.js";

export interface Decision {
  label: VerdictLabel;
  pScam: number;
  confidence: number;
  band: [number, number];
  scamType: ScamType;
  headline: string;
}

export function decide(ctx: RunContext): Decision {
  const pScam = ctx.evidence.pScam();
  const label = labelFor(pScam);
  const status = ctx.verification?.outcome.status;
  const band = bandFor({
    logOdds: ctx.evidence.logOdds(),
    signalCount: ctx.evidence.signals.length,
    claimed: Boolean(ctx.claim) && !ctx.evidence.has("known_sender"),
    verification: status,
    llmPScam: ctx.analysis?.producedBy === "llm" ? ctx.analysis.pScam : undefined,
  });
  const scamType = label === "safe" ? "none" : pickType(ctx);
  return { label, pScam, confidence: confidenceFor(label, pScam), band, scamType, headline: headline(ctx, label, scamType) };
}

function pickType(ctx: RunContext): ScamType {
  // A denied impersonation of a person is a family/friend impostor no matter what the lure was.
  if (ctx.verification?.outcome.status === "denied" && ctx.claim && !isOrg(ctx.claim.contact)) return "family_emergency";
  const fromModel = ctx.analysis?.scamType;
  if (fromModel && fromModel !== "none" && fromModel !== "other") return fromModel;
  return ctx.triageType !== "none" ? ctx.triageType : "other";
}

const TYPE_LEAD: Record<ScamType, string> = {
  family_emergency: "Someone is pretending to be family in trouble",
  bank_impersonation: "This is a fake bank alert",
  government_impersonation: "This is a fake government demand",
  delivery_smishing: "This is a fake delivery notice",
  toll_smishing: "This is a fake toll bill",
  account_takeover_otp: "Someone is trying to steal a sign-in code",
  carrier_impersonation: "Someone is posing as your phone carrier",
  tech_support: "This is a fake tech-support alert",
  job_offer: "This is a fake job offer",
  investment_crypto: "This is an investment scam",
  romance: "This looks like a romance scam",
  wrong_number: "This \"wrong number\" text is a common scam opener",
  prize_lottery: "This prize is fake",
  marketplace: "This is a marketplace scam",
  other: "This is a scam",
  none: "This looks safe",
};

/** One plain-English sentence, specific to the case. */
export function headline(ctx: RunContext, label: VerdictLabel, scamType: ScamType): string {
  const claim = ctx.claim?.contact;
  const name = claim ? shortName(claim) : undefined;
  const status = ctx.verification?.outcome.status;
  const top = topReason(ctx.evidence.sorted(), scamType);

  if (claim && name) {
    if (status === "denied") return `Someone is pretending to be ${name} — the real ${name} denied sending it.`;
    if (status === "confirmed" && label === "safe") return `The real ${name} confirmed sending it — this looks safe.`;
    if (status === "confirmed") return `${name} confirmed sending it, but the message still has red flags — double-check before paying anything.`;
    if (label === "suspicious" && (status === "timeout" || status === "unreachable" || status === "unclear")) {
      return `This claims to be ${name}, who hasn't confirmed it — call ${name} at the number saved in your phone before doing anything.`;
    }
  }

  if (label === "safe") {
    const sender = contactBySender(ctx.event.from.handle, ctx.contacts);
    if (ctx.evidence.has("knows_safe_word")) return "The sender used your family safe word and nothing looks off.";
    if (sender) return `This is from ${shortName(sender)}'s saved ${isOrg(sender) ? "contact" : "number"} and nothing looks off.`;
    return "Nothing here looks like a scam.";
  }
  if (label === "suspicious") {
    const label = SCAM_TYPE_LABELS[scamType].toLowerCase();
    const what = scamType === "other" ? "a scam" : `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
    return top ? `This might be ${what} — ${lowerFirst(top.title)}. Check before you act.` : `This might be ${what}. Check before you act.`;
  }
  return top ? `${TYPE_LEAD[scamType]} — ${lowerFirst(top.title)}.` : `${TYPE_LEAD[scamType]}.`;
}

const GENERIC_REASONS = new Set(["unknown_sender", "link_present", "urgency", "verification_timeout", "verification_unclear"]);

/**
 * The strongest scam-pointing reason worth a headline: not generic, and not
 * the rule that merely restates the type ("fake toll bill — unpaid toll bill").
 */
function topReason(sorted: Signal[], scamType: ScamType): Signal | undefined {
  const restatesType = (s: Signal) => RULES.some((r) => r.id === s.id && r.scamType === scamType) || s.id === "library_match";
  return sorted.find((s) => s.weight > 0 && !GENERIC_REASONS.has(s.id) && !restatesType(s));
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);
