import { TrustedContact } from "@beacon/shared";

/**
 * The protected user's trusted-contact registry for the demo persona.
 * All handles are synthetic (555-01xx is reserved for fiction).
 *
 * LIVE DEMO: before the demo, set `verifyVia` for "mom" to a teammate's real
 * iMessage handle via env (see apps/channels) — don't commit real numbers.
 */
export const trustedContacts: TrustedContact[] = [
  TrustedContact.parse({
    id: "mom",
    name: "Mom",
    relationship: "family",
    aliases: ["mom", "mother", "mama", "linda"],
    handles: ["+15550100001"],
    verifyVia: { channel: "simulator", handle: "+15550100001" },
    safeWord: "blue heron",
  }),
  TrustedContact.parse({
    id: "sam",
    name: "Sam (grandson)",
    relationship: "family",
    aliases: ["sam", "sammy", "grandson", "your grandson"],
    handles: ["+15550100002"],
    verifyVia: { channel: "simulator", handle: "+15550100002" },
  }),
  TrustedContact.parse({
    id: "bank",
    name: "First Lone Star Bank",
    relationship: "bank",
    aliases: ["first lone star", "lone star bank", "your bank"],
    handles: ["+15550100050", "alerts@firstlonestar.example"],
    domains: ["firstlonestar.example"],
    verifyVia: { channel: "simulator", handle: "+15550100050" },
  }),
];
