/**
 * The mock brain: a deterministic, on-device stand-in for Nemotron with the
 * same output shape and the same tool traces. Default in dev/CI, and the
 * fallback when the cloud model fails — so the offline demo looks like the
 * real agent.
 */
import { logistic, type ScamType } from "@beacon/shared";
import type { RunContext } from "../pipeline/context.js";
import { contactRef, shortName } from "../privacy/redact.js";
import { isOrg } from "../tools/contacts.js";
import { extractLinks } from "../tools/links.js";
import { runTool } from "../tools/index.js";
import { searchScamLibrary } from "../tools/library.js";
import type { AnalysisOutput } from "./schema.js";

export function runMockBrain(ctx: RunContext): AnalysisOutput {
  // 1. Same tool calls a careful analyst (or Nemotron) would make.
  if (ctx.claim) runTool(ctx, "lookup_contact", { query: contactRef(ctx.contacts, ctx.claim.contact) });
  for (const link of extractLinks(ctx.redacted.text).slice(0, 2)) runTool(ctx, "check_link", { url: link.raw });
  runTool(ctx, "search_scam_library", { text: ctx.redacted.text });

  // 2. Type: triage's best guess, corroborated (or supplied) by the library.
  const top = searchScamLibrary(ctx.redacted.text)[0];
  let scamType: ScamType = ctx.triageType;
  if ((scamType === "none" || scamType === "other") && top && top.pattern.scamType !== "none" && top.similarity >= 0.3) {
    scamType = top.pattern.scamType;
  }

  return {
    scamType,
    claimedContactId: ctx.claim?.contact.id ?? null,
    claim: describeClaim(ctx),
    // The mock adds no hidden opinion: its probability IS the evidence so far.
    pScam: logistic(ctx.evidence.logOdds()),
    signals: [],
  };
}

/** Plain sentence, no numbers or links: "Says it's Mom, texting from an unknown number." */
export function describeClaim(ctx: RunContext): string {
  if (!ctx.claim) return "The sender doesn't claim to be anyone you know.";
  const name = shortName(ctx.claim.contact);
  const from = isOrg(ctx.claim.contact) ? "from a number they don't use" : "from a number that isn't saved for them";
  return `Says it's ${name}, ${from}.`;
}
