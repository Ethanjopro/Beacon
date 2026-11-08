import { defineScenario } from "./helpers.js";

/** Legitimate messages. Beacon must stay quiet on these (false positives kill trust). */
export const controlScenarios = [
  defineScenario({
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
  defineScenario({
    id: "bank-real-alert",
    title: "Real bank card alert",
    summary: "A genuine transaction alert from the bank's registered number: no links, no code requests.",
    tags: ["control", "hard"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "sms",
      from: { handle: "+15550100050", displayName: "First Lone Star Bank" },
      body: "First Lone Star Bank: a debit card purchase of $42.17 at CORNER GROCER on 11/07 was approved. If you don't recognize this, call the number on the back of your card. Reply STOP to opt out.",
    },
  }),
  defineScenario({
    id: "real-2fa-code",
    title: "Genuine 2FA code",
    summary: "A one-time code from a known service, with the standard 'do not share' warning.",
    tags: ["control", "hard"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "sms",
      from: { handle: "48732", displayName: "Northwind" },
      body: "Your Northwind verification code is 482913. It expires in 10 minutes. Don't share this code with anyone, Northwind will never ask for it.",
    },
  }),
  defineScenario({
    id: "sister-split-bill",
    title: "Sister splits the brunch bill",
    summary: "Ana, from her known number, asks to split the bill through a payment app. Legit money request.",
    tags: ["control", "hard"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "imessage",
      from: { handle: "+15550100003", displayName: "Ana" },
      body: "brunch was so good 😋 your half is $23.50, can u SendIt me when you get a sec? no rush!",
    },
  }),
  defineScenario({
    id: "pharmacy-refill-ready",
    title: "Pharmacy refill ready",
    summary: "Registered pharmacy number says a prescription is ready for pickup.",
    tags: ["control"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "sms",
      from: { handle: "+15550100070", displayName: "Cedar Park Pharmacy" },
      body: "Cedar Park Pharmacy: your prescription is ready for pickup at the counter. Open until 8pm today. Reply STOP to opt out.",
    },
  }),
  defineScenario({
    id: "employer-shift-change",
    title: "Employer schedule update",
    summary: "HR from the registered work number about a shift swap. Mundane and legitimate.",
    tags: ["control"],
    expected: { label: "safe", scamType: "none" },
    event: {
      kind: "sms",
      from: { handle: "+15550100060", displayName: "Brightwater HR" },
      body: "Hi, quick heads up: Thursday's team meeting moved to 10:30am in Room B. Let me know if that conflicts. Thanks! - Dana, Brightwater Logistics HR",
    },
  }),
];
