import type { PublicContact } from "@beacon/shared";

/**
 * Mirror of packages/scenarios/src/contacts.ts as the server would expose it
 * (`PublicContact`: safe words stripped). Synthetic 555-01xx numbers only.
 * Mock mode shows iMessage as the verify channel, matching the live demo story.
 */
export const MOCK_CONTACTS: PublicContact[] = [
  {
    id: "mom",
    name: "Mom",
    relationship: "family",
    aliases: ["mom", "mother", "mama", "linda"],
    handles: ["+15550100001"],
    domains: [],
    verifyVia: { channel: "imessage", handle: "+15550100001" },
    hasSafeWord: true,
  },
  {
    id: "sam",
    name: "Sam",
    relationship: "family",
    aliases: ["sam", "sammy", "grandson", "your grandson"],
    handles: ["+15550100002"],
    domains: [],
    verifyVia: { channel: "imessage", handle: "+15550100002" },
    hasSafeWord: false,
  },
  {
    id: "bank",
    name: "First Lone Star Bank",
    relationship: "bank",
    aliases: ["first lone star", "lone star bank", "your bank"],
    handles: ["+15550100050", "alerts@firstlonestar.example"],
    domains: ["firstlonestar.example"],
    verifyVia: { channel: "sms", handle: "+15550100050" },
    hasSafeWord: false,
  },
];
