import { callTranscript, defineScenario, flattenTranscript } from "./helpers.js";

/** Family-emergency style attacks: impersonating someone the user loves. */

const bailCall = callTranscript([
  ["caller", 0, "Grandma? Grandma, it's me... it's Sam."],
  ["user", 3, "Sam? You sound strange, are you sick?"],
  ["caller", 6, "No, no, I'm in trouble. I got in a car accident and I got arrested. I have a broken nose, that's why I sound weird."],
  ["caller", 14, "I'm at the county jail. They said bail is eighty-five hundred dollars. Please, you're the only one I can call."],
  ["caller", 22, "And please don't tell Mom and Dad, they'll freak out. I'll explain everything later, I promise."],
  ["user", 28, "Oh my goodness. How do I pay?"],
  ["caller", 31, "A lawyer, Mr. Dalton, will call you in a few minutes. You'll need to buy gift cards or send it through a crypto machine. Do it fast, they're moving me soon."],
]);

const abuelaCallText =
  "Abuela, soy yo, tu nieto Sam 😢 Perdí mi teléfono y este es mi número nuevo. Tuve un accidente y necesito $900 para la grúa y el abogado hoy mismo. Por favor no le digas a mamá, me da vergüenza. Cómpralo en tarjetas de regalo y mándame los códigos, es lo más rápido. Te quiero mucho";

export const familyScenarios = [
  defineScenario({
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
  defineScenario({
    id: "grandson-bail-call",
    title: "Cloned-voice grandson needs bail",
    summary: "A call in a voice-cloned 'Sam' claims an arrest and demands secrecy and gift-card bail. The real Sam is fine.",
    tags: ["demo", "call", "hard"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    event: {
      kind: "call",
      from: { handle: "+15550104417", displayName: "Unknown" },
      body: flattenTranscript(bailCall),
      transcript: bailCall,
    },
    trustedContactReply: { contactId: "sam", text: "what?? no I'm at the library studying lol. I didn't call anyone", delayMs: 3000 },
  }),
  defineScenario({
    id: "abuela-nieto-es",
    title: "Spanish: nieto en apuros",
    summary: "Spanish-language 'grandson' text from a new number asking for emergency money and secrecy.",
    tags: ["es", "hard"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    event: { kind: "whatsapp", from: { handle: "+15550107731" }, body: abuelaCallText },
    trustedContactReply: { contactId: "sam", text: "No abuela, ese no soy yo!! mi cel está bien, no mandes nada", delayMs: 3000 },
  }),
  defineScenario({
    id: "ana-hospital-wallet",
    title: "\"Ana\" stranded after an accident",
    summary: "Sister's name on an unknown number: car crash, phone dying, send money to a stranger's account.",
    tags: ["hard"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    event: {
      kind: "sms",
      from: { handle: "+15550106120", displayName: "Ana" },
      body: "its ana. my phone is at 2% and im at urgent care, got into a fender bender and they wont treat me w/o a deposit. can u send $450 to this acct 7741 0082 9 rn?? pls dont call, i'll lose signal 🙏",
    },
    trustedContactReply: { contactId: "ana", text: "wait what, I'm at work, haven't texted you. Someone's pretending to be me", delayMs: 2500 },
  }),
  defineScenario({
    id: "romance-stuck-abroad",
    title: "Romance: stuck overseas",
    summary: "Months-long online 'partner' needs money for a plane ticket home after a lost wallet.",
    tags: [],
    expected: { label: "scam", scamType: "romance" },
    event: {
      kind: "whatsapp",
      from: { handle: "+15550105208", displayName: "Daniel 💙" },
      body: "Good morning my love. I hate to ask but my wallet and passport were stolen in Lisbon and the embassy wants a fee before they will issue anything. If you can send $1,200 in bitcoin to this wallet I swear I'll pay you back the day I land. I can't stop thinking about meeting you 😘 please keep this between us, my family wouldn't understand",
    },
  }),
  // Hard negative: the SAME opening as the demo scam, but Mom confirms it's her.
  defineScenario({
    id: "mom-new-number-confirmed",
    title: "Real Mom, genuinely new number",
    summary: "Mom texts from a new phone number and, when asked out-of-band, confirms it's her. Must NOT be flagged.",
    tags: ["control", "hard", "demo"],
    expected: { label: "safe", scamType: "none", verification: "confirmed" },
    event: {
      kind: "sms",
      from: { handle: "+15550108888" },
      body: "Hi sweetheart it's Mom, I finally got the new phone today so this is my number now, save it 😊 Are we still on for Sunday dinner? Love you",
    },
    trustedContactReply: { contactId: "mom", text: "Yes that's me! Got a new phone today, sorry if it was confusing 😅", delayMs: 2500 },
  }),
];
