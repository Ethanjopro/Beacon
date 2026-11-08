import { defineScenario } from "./helpers.js";

/**
 * Calls screened live by the Magenta-Guard screener (Nemotron), to show it can
 * tell good callers from bad ones. Tagged "screener": the legacy text-pipeline
 * test skips them; `pnpm -F @beacon/scenarios eval-calls` runs them live.
 *
 * Tags: "verifiable" = a genuine caller who can pass a challenge, so the right
 * outcome is VERIFIED (connected). Other genuine callers must simply not be
 * called a scam (voicemail is fine). Every scam must come out SCAM.
 *
 * Caller lines answer the screener's usual questions in order (who / why /
 * code word). All people, companies and numbers are synthetic.
 */
export const callScenarios = [
  // ── Genuine callers ───────────────────────────────────────────────────────
  defineScenario({
    id: "genuine-sam-code-word",
    title: "Real Sam, borrowed phone, knows the code word",
    summary: "Sam's phone died, so he calls from a friend's phone. Asked for the family code word, he gives it. Should be connected.",
    tags: ["screener", "control", "verifiable", "demo"],
    expected: { label: "safe", scamType: "none" },
    event: { kind: "call", from: { handle: "+15550104812", displayName: "Unknown" } },
    callerScript: [
      "Hey, it's Sam. My phone died so I'm calling from my friend Jake's phone. Can you put Grandma on?",
      "Sure, the code word is maple canoe. I just wanted to tell her I'll be at Sunday dinner.",
      "Yep, that's all, just saying hi.",
    ],
    trustedContactReply: { contactId: "sam", text: "Yeah that's me on Jake's phone, mine died lol", delayMs: 1500 },
  }),
  defineScenario({
    id: "real-mom-dinner-call",
    title: "Real Mom, saved number, dinner plans",
    summary: "Mom calls from her saved number about Sunday dinner and gives the code word when asked. Should be connected.",
    tags: ["screener", "control", "verifiable"],
    expected: { label: "safe", scamType: "none" },
    event: { kind: "call", from: { handle: "+15550100001", displayName: "Mom" } },
    callerScript: [
      "Hi honey, it's Mom! I'm just calling to see if you're still coming to dinner on Sunday.",
      "Ha, okay, blue heron. Now can I talk to my kid?",
      "Nothing else, I just want to know if I should make the lasagna.",
    ],
    trustedContactReply: { contactId: "mom", text: "Yes that's me, I'm calling about Sunday dinner", delayMs: 1500 },
  }),
  defineScenario({
    id: "pharmacy-refill-call",
    title: "Pharmacy: prescription ready",
    summary: "The subscriber's real pharmacy calls from its saved number to say a refill is ready. It asks for nothing. Must not be called a scam.",
    tags: ["screener", "control", "verifiable"],
    expected: { label: "safe", scamType: "none" },
    event: { kind: "call", from: { handle: "+15550100070", displayName: "Cedar Park Pharmacy" } },
    callerScript: [
      "Hello, this is Cedar Park Pharmacy calling with a courtesy reminder that a prescription is ready for pickup.",
      "No information needed at all. They can pick it up any time this week during store hours.",
      "That's everything, have a good day.",
    ],
    trustedContactReply: { contactId: "pharmacy", text: "Yes, that was us, just a pickup reminder.", delayMs: 1500 },
  }),
  defineScenario({
    id: "dentist-appointment-reminder",
    title: "Unknown dentist: appointment reminder",
    summary: "A dental office that isn't in the contacts confirms an appointment and asks for nothing. Voicemail is fine; calling it a scam is a false alarm.",
    tags: ["screener", "control"],
    expected: { label: "safe", scamType: "none" },
    event: { kind: "call", from: { handle: "+15550107310", displayName: "Riverbend Dental" } },
    callerScript: [
      "Hi, this is Riverbend Dental confirming a cleaning appointment tomorrow at 3 PM.",
      "No, we don't need anything. If they need to reschedule they can call the office number on their appointment card.",
      "That's all, thank you!",
    ],
  }),
  // ── Scams ─────────────────────────────────────────────────────────────────
  defineScenario({
    id: "carrier-sim-swap-call",
    title: "Fake carrier: SIM swap code",
    summary: "A 'carrier security team' wants the one-time code that would let them move the number to their SIM.",
    tags: ["screener", "demo"],
    expected: { label: "scam", scamType: "carrier_impersonation" },
    event: { kind: "call", from: { handle: "+15550106622", displayName: "Mobile Security" } },
    callerScript: [
      "This is your wireless carrier's security team. Someone just requested a SIM change on this line.",
      "To cancel it I need the six-digit code we just texted to this phone. Please read it back to me now.",
      "If you don't give me the code in the next two minutes, the transfer completes and you lose your number.",
    ],
  }),
  defineScenario({
    id: "fake-mom-new-number-call",
    title: "Fake Mom from a new number wants money by payment app",
    summary: "'Mom' calls from an unknown number, needs $500 with a payment app right now, and can't give the code word. The real Mom says it isn't her.",
    tags: ["screener", "demo"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    event: { kind: "call", from: { handle: "+15550109432", displayName: "Unknown" } },
    callerScript: [
      "Honey, it's Mom. I lost my phone and I'm calling from a friend's. I'm stuck and I need you to send me five hundred dollars by payment app right now.",
      "A code word? I don't remember any code word, I'm so stressed. Please just send it, I'll explain later.",
      "Please don't tell your dad. Just send it to this number on the payment app.",
    ],
    trustedContactReply: { contactId: "mom", text: "No, I'm home and I have my phone. That's not me!", delayMs: 1500 },
  }),
];
