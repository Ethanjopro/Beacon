import { defineScenario } from "./helpers.js";

/** Modern lures: toll, parcel, jobs, crypto, wrong-number, prizes, marketplace. */
export const lureScenarios = [
  defineScenario({
    id: "toll-smish",
    title: "Unpaid toll text",
    summary: "Classic toll smishing with a lookalike link.",
    tags: ["demo"],
    expected: { label: "scam", scamType: "toll_smishing" },
    event: {
      kind: "sms",
      from: { handle: "+14695550188" },
      body: "MetroTag: You have an unpaid toll balance of $6.85. To avoid a $50 late fee pay within 24 hours: https://metrotag-billing.top/pay",
    },
  }),
  defineScenario({
    id: "parcel-redelivery-fee",
    title: "Package held: pay redelivery fee",
    summary: "Fictional carrier 'ParcelPoint' says a parcel is stuck and asks for a small fee on a lookalike site.",
    tags: [],
    expected: { label: "scam", scamType: "delivery_smishing" },
    event: {
      kind: "sms",
      from: { handle: "+15550103821" },
      body: "ParcelPoint: we attempted to deliver your package today but the address was incomplete. Update details & pay $1.99 redelivery fee or it will be returned: https://parcelpoint-track.top/u/7Hq2 📦",
    },
  }),
  defineScenario({
    id: "job-task-scam",
    title: "Remote 'task' job, earn $300/day",
    summary: "Unsolicited recruiter offers easy like-and-rate tasks, then asks for a deposit to unlock earnings.",
    tags: [],
    expected: { label: "scam", scamType: "job_offer" },
    event: {
      kind: "whatsapp",
      from: { handle: "+15550104902", displayName: "Jessica HR" },
      body: "Hello! I'm Jessica from TalentBridge recruiting. We saw your resume online 😊 Part-time remote work, just 30 min a day rating products, earn $200-$400 DAILY paid in USDT. No experience needed! Reply YES to get started and I'll add you to our task platform.",
    },
  }),
  defineScenario({
    id: "crypto-guaranteed-returns",
    title: "Crypto platform with guaranteed returns",
    summary: "A 'mentor' pushes a fake trading app promising 30% weekly returns and a quick deposit.",
    tags: [],
    expected: { label: "scam", scamType: "investment_crypto" },
    event: {
      kind: "whatsapp",
      from: { handle: "+15550108156", displayName: "Coach Victor" },
      body: "My students made 31% this week on the NovaVault platform 🚀📈 Withdrawals are instant and my analyst team guarantees profit. Min deposit is only $500 in USDT, limited spots left today. Download here https://novavault-trade.top and I'll guide you step by step",
    },
  }),
  defineScenario({
    id: "wrong-number-pig-butchering",
    title: "\"Sorry, wrong number\" opener",
    summary: "A friendly stranger 'accidentally' texts, then slowly builds rapport toward an investment pitch.",
    tags: ["hard"],
    expected: { label: "suspicious", scamType: "wrong_number" },
    event: {
      kind: "sms",
      from: { handle: "+15550101936" },
      body: "Hi Steven, are we still on for golf Saturday? Oh no, so sorry, I think I have the wrong number 😅 You sound like a nice person though, I'm Mia, just moved to Austin from Singapore. What do you do for fun?",
    },
  }),
  defineScenario({
    id: "prize-lottery-fee",
    title: "You won! Pay shipping to claim",
    summary: "A sweepstakes win that requires a 'processing fee' by gift card.",
    tags: [],
    expected: { label: "scam", scamType: "prize_lottery" },
    event: {
      kind: "sms",
      from: { handle: "+15550105577" },
      body: "CONGRATULATIONS!! 🎉 Your number was randomly selected in the Lucky Texan Mega Draw and you won $50,000 + a new SUV. To release your prize pay the $149 processing fee within 24 hrs. Reply CLAIM to start. Ref LT-9921",
    },
  }),
  defineScenario({
    id: "marketplace-overpayment",
    title: "Fake buyer overpays, asks for refund",
    summary: "A buyer 'accidentally' sends too much via a fake payment email and asks for the difference back.",
    tags: [],
    expected: { label: "scam", scamType: "marketplace" },
    event: {
      kind: "sms",
      from: { handle: "+15550106633" },
      body: "Hi I'm interested in your couch listing, I'll take it! I sent $950 through SendIt but accidentally paid $1,450 (see https://sendit-confirm.top/receipt). Please refund the extra $500 by bank transfer today and my mover will pick up tomorrow. Thanks!!",
    },
  }),
];
