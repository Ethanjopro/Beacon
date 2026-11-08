import { Scenario } from "@beacon/shared";

/**
 * Seed scenarios (WALKING SKELETON). CENG 2 grows this into the full library —
 * see packages/scenarios/AGENTS.md. All content is synthetic.
 */
export const scenarios: Scenario[] = [
  Scenario.parse({
    id: "mom-new-number-giftcards",
    title: "\"Mom\" from a new number",
    summary: "Someone claiming to be Mom texts from an unknown number asking for gift cards. Real Mom says it wasn't her.",
    tags: ["demo"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    event: {
      kind: "sms",
      from: { handle: "+15550109999" },
      body: "Hi honey it's Mom, I broke my phone so this is my new number. I'm in a bind and need you to grab 3 Apple gift cards ($200 each) right now and send me the codes. Please don't tell your dad, I'll explain later ❤️",
    },
    trustedContactReply: { contactId: "mom", text: "No?? I'm at home, my phone is fine. That's not me!", delayMs: 3000 },
  }),
  Scenario.parse({
    id: "toll-smish",
    title: "Unpaid toll text",
    summary: "Classic toll smishing with a lookalike link.",
    tags: ["demo"],
    expected: { label: "scam", scamType: "toll_smishing" },
    event: {
      kind: "sms",
      from: { handle: "+12345550123" },
      body: "TxTag: You have an unpaid toll balance of $6.85. To avoid a $50 late fee pay within 24 hours: https://txtag-billing.top/pay",
    },
  }),
  Scenario.parse({
    id: "mom-dinner-legit",
    title: "Real Mom about dinner",
    summary: "A normal message from Mom's real number — should stay quiet.",
    tags: ["control"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "imessage",
      from: { handle: "+15550100001", displayName: "Mom" },
      body: "Are you still coming for dinner Sunday? I'm making enchiladas",
    },
  }),
];
