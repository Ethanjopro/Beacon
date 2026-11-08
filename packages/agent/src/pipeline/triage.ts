/**
 * Stage 2 — triage. Deterministic, on-device rules → Signals. No network.
 */
import { SCAM_TYPES, type ScamType, type Signal } from "@beacon/shared";
import { HIDDEN_CHARS, RULES, type Rule } from "../triage/rules.js";
import { contactBySender, findClaim, isKnownHandle, isOrg } from "../tools/contacts.js";
import { checkLink, extractLinks, linkSignals } from "../tools/links.js";
import { SAFE_WORD_PLACEHOLDER, shortName } from "../privacy/redact.js";
import { addSignal, stageCompleted, stageStarted, thought, type RunContext } from "./context.js";

/** Earlier messages in the thread count, but at reduced weight (they're context, not the ask). */
const THREAD_WEIGHT_FACTOR = 0.5;

export function matchRule(rule: Rule, text: string): RegExpMatchArray | null {
  const m = text.match(rule.pattern);
  if (!m) return null;
  if (rule.requires && !rule.requires.test(text)) return null;
  if (rule.unless && rule.unless.test(text)) return null;
  return m;
}

export function runTriage(ctx: RunContext): void {
  stageStarted(ctx, "triage");
  const text = ctx.localText;
  const typeScores = new Map<ScamType, number>();
  const bumpType = (t: ScamType | undefined, w: number) => t && w > 0 && typeScores.set(t, (typeScores.get(t) ?? 0) + w);

  // 1. Behavioral rules on this message.
  for (const rule of RULES) {
    const m = matchRule(rule, text);
    if (!m) continue;
    addSignal(ctx, ruleSignal(rule, m[0]));
    bumpType(rule.scamType, rule.weight);
  }

  // 2. Rules that fired earlier in the same thread (e.g. a "wrong number" opener, then a crypto pitch).
  const history = ctx.threadHistory.join("\n");
  if (history) {
    for (const rule of RULES) {
      if (rule.weight <= 0 || ctx.evidence.has(rule.id)) continue;
      const m = matchRule(rule, history);
      if (!m) continue;
      const base = ruleSignal(rule, m[0]);
      addSignal(ctx, { ...base, id: `thread_${rule.id}`, title: `Earlier in this chat: ${rule.title.toLowerCase()}`, weight: round2(rule.weight * THREAD_WEIGHT_FACTOR), evidence: undefined });
      bumpType(rule.scamType, rule.weight * THREAD_WEIGHT_FACTOR);
    }
  }

  if (HIDDEN_CHARS.test(ctx.event.body)) {
    addSignal(ctx, { id: "hidden_characters", title: "Contains hidden characters", detail: "Invisible characters are used to sneak text past filters or AI assistants.", weight: 0.8, source: "heuristic" });
  }

  // 3. Who sent it vs. who it claims to be.
  // A forwarded message's `from` is whoever forwarded it to Beacon, not the original
  // sender, so the forwarder's handle says nothing about the content's trustworthiness.
  const forwarded = ctx.event.source === "forwarded";
  const sender = forwarded ? undefined : contactBySender(ctx.event.from.handle, ctx.contacts);
  ctx.claim = findClaim(ctx.event, text, ctx.contacts);
  if (forwarded) {
    thought(ctx, "This was forwarded to me, so I'm judging the message itself, not who forwarded it.");
  } else if (sender) {
    addSignal(ctx, {
      id: "known_sender",
      title: `Sent from ${shortName(sender)}'s saved ${isOrg(sender) ? "contact" : "number"}`,
      detail: "This handle is in your trusted contacts. (Caller ID can be spoofed, so this lowers the risk without ruling it out.)",
      weight: -2.0,
      source: "heuristic",
    });
  } else if (isShortCode(ctx.event.from.handle)) {
    addSignal(ctx, {
      id: "short_code_sender",
      title: "Sent from a registered short code",
      detail: "Short codes are vetted by carriers; scam texts usually come from regular numbers or email addresses. Still, never tap unexpected links.",
      weight: -0.5,
      source: "heuristic",
    });
  } else {
    addSignal(ctx, { id: "unknown_sender", title: "Sender isn't in your trusted contacts", detail: "Not a number or address your trusted contacts use.", weight: 0.3, source: "heuristic" });
    if (ctx.event.from.handle.includes("@") && (ctx.event.kind === "sms" || ctx.event.kind === "imessage")) {
      addSignal(ctx, { id: "email_sender", title: "Texted from an email address", detail: "Mass scam texts are often sent from throwaway email accounts to dodge carrier filters.", weight: 0.5, source: "heuristic" });
    }
  }
  if (ctx.claim && !isKnownHandle(ctx.event.from.handle, ctx.claim.contact)) {
    const name = shortName(ctx.claim.contact);
    const org = isOrg(ctx.claim.contact);
    addSignal(ctx, {
      id: "claims_trusted_contact",
      title: ctx.claim.via === "display_name" ? `Uses ${name}'s name from an unknown number` : `Says it's ${name}, from a number ${name} doesn't use`,
      detail: org ? `${name} has known numbers and addresses — this isn't one of them.` : `${name}'s saved number is different. Impostors often claim a "new number".`,
      weight: org ? 0.6 : 0.8,
      source: "heuristic",
    });
    bumpType(org ? orgScamType(ctx.claim.contact) : "family_emergency", 0.5);
  }

  // 4. Links (checked offline; we never open them).
  const links = extractLinks(text);
  const claimedOrg = ctx.claim && isOrg(ctx.claim.contact) ? ctx.claim.contact : undefined;
  let riskyLink = false;
  for (const link of links) {
    const findings = checkLink(link, ctx.contacts, claimedOrg);
    for (const s of linkSignals(link, findings)) addSignal(ctx, s);
    if (!findings.some((f) => f.weight < 0)) riskyLink = true;
  }
  if (riskyLink) {
    addSignal(ctx, { id: "link_present", title: "Contains a link", detail: "Links in unexpected texts often lead to payment or password-stealing pages.", weight: 0.4, source: "heuristic", evidence: links[0]?.raw });
  }

  // 5. Safe word (compared on-device; the word itself is never shown or sent).
  if (text.includes(SAFE_WORD_PLACEHOLDER)) {
    addSignal(ctx, { id: "knows_safe_word", title: "Uses your family safe word", detail: "The sender knew your family's safe word — checked on this device only.", weight: -2.0, source: "heuristic" });
  }

  // 6. Nothing scammy at all → say so (lets clearly-safe texts stay on the phone).
  const anyRisk = ctx.evidence.signals.some((s) => s.weight > 0 && s.id !== "unknown_sender" && s.id !== "link_present");
  if (!anyRisk && !ctx.claim) {
    addSignal(ctx, { id: "no_red_flags", title: "No scam patterns found", detail: "None of Beacon's on-device checks found pressure, payment requests, risky links or impersonation.", weight: -1.5, source: "heuristic" });
  }

  ctx.triageType = topType(typeScores, ctx);
  const flags = ctx.evidence.sorted().filter((s) => s.weight > 0 && s.id !== "unknown_sender");
  const p = ctx.evidence.pScam();
  thought(
    ctx,
    flags.length === 0
      ? "No red flags in the on-device check."
      : `${flags.length} red flag${flags.length === 1 ? "" : "s"} on-device: ${flags.slice(0, 3).map((s) => s.title.toLowerCase()).join(", ")}.`,
  );
  stageCompleted(ctx, "triage", `${Math.round(p * 100)}% after on-device checks`);
}

/** US short codes: 5–6 digits, no country code. */
export const isShortCode = (handle: string) => /^\d{5,6}$/.test(handle.trim());

function ruleSignal(rule: Rule, evidence: string): Signal {
  return { id: rule.id, title: rule.title, detail: rule.detail, weight: rule.weight, source: "heuristic", evidence: evidence.slice(0, 120) };
}

function orgScamType(contact: RunContext["contacts"][number]): ScamType {
  switch (contact.relationship) {
    case "bank":
      return "bank_impersonation";
    case "carrier":
      return "carrier_impersonation";
    case "government":
      return "government_impersonation";
    case "employer":
      return "job_offer";
    default:
      return "other";
  }
}

function topType(scores: Map<ScamType, number>, ctx: RunContext): ScamType {
  let best: ScamType = "none";
  let bestScore = 0;
  for (const t of SCAM_TYPES) {
    const s = scores.get(t) ?? 0;
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  if (best === "none" && ctx.evidence.signals.some((s) => s.weight >= 1)) return "other";
  return best;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
