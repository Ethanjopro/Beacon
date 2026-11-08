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
    aliases: ["mom", "mother", "mama", "mamá", "mami", "linda"],
    handles: ["+15550100001"],
    verifyVia: { channel: "simulator", handle: "+15550100001" },
    safeWord: "blue heron",
  }),
  TrustedContact.parse({
    id: "sam",
    name: "Sam (grandson)",
    relationship: "family",
    aliases: ["sam", "sammy", "grandson", "your grandson", "nieto", "tu nieto", "abuela"],
    handles: ["+15550100002"],
    verifyVia: { channel: "simulator", handle: "+15550100002" },
  }),
  TrustedContact.parse({
    id: "ana",
    name: "Ana (sister)",
    relationship: "family",
    aliases: ["ana", "sis", "sister", "hermana", "ani"],
    handles: ["+15550100003"],
    verifyVia: { channel: "simulator", handle: "+15550100003" },
  }),
  TrustedContact.parse({
    id: "bank",
    name: "First Lone Star Bank",
    relationship: "bank",
    aliases: ["first lone star", "lone star bank", "your bank", "banco"],
    handles: ["+15550100050", "alerts@firstlonestar.example"],
    domains: ["firstlonestar.example"],
    verifyVia: { channel: "simulator", handle: "+15550100050" },
  }),
  TrustedContact.parse({
    id: "employer",
    name: "Brightwater Logistics (work)",
    relationship: "employer",
    aliases: ["brightwater", "brightwater logistics", "hr", "my boss", "work"],
    handles: ["+15550100060", "hr@brightwater.example"],
    domains: ["brightwater.example"],
    verifyVia: { channel: "simulator", handle: "+15550100060" },
  }),
  TrustedContact.parse({
    id: "pharmacy",
    name: "Cedar Park Pharmacy",
    relationship: "service",
    aliases: ["cedar park pharmacy", "pharmacy", "farmacia", "dr. patel"],
    handles: ["+15550100070", "refills@cedarpark.example"],
    domains: ["cedarpark.example"],
    verifyVia: { channel: "simulator", handle: "+15550100070" },
  }),
];
