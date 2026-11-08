import type {
  IncomingEvent,
  PrivacyReport,
  ScenarioSummary,
  TranscriptSegment,
  VerificationOutcome,
  VerificationRequest,
} from "@beacon/shared";
import { buildVerdict, TraceScript, type ScriptStep } from "./build";
import { CALL_MOM_FIRST, GIFT_CARD_RECOVERY, TOLL_RECOVERY, VOICE_CLONE_RECOVERY } from "./recovery";

/**
 * Canned, type-checked traces for `?mock=1`. Content mirrors
 * packages/scenarios (same ids, bodies, synthetic 555-01xx numbers) so the
 * mock and the live demo tell the same story. All data is synthetic.
 */

export interface MockVerification {
  request: (nowIso: string) => VerificationRequest;
  /** Scripted answer from the real contact, unless the console replies first. */
  autoReply?: { text: string; delayMs: number };
  /** Steps after `verification.resolved` (emitted by the engine). */
  resolve: (outcome: VerificationOutcome) => ScriptStep[];
}

export interface MockRun {
  steps: ScriptStep[];
  verification?: MockVerification;
}

export interface MockScenario {
  summary: ScenarioSummary;
  build: (ctx: { eventId: string; startedAt: number }) => MockRun;
}

const DEEP_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const ON_DEVICE: PrivacyReport = {
  sentToCloud: false,
  redactions: {},
  notes: ["Checked entirely on this phone", "Nothing was sent to the cloud"],
};

const latencyFrom = (startedAt: number, nowIso: string) => Math.max(0, Date.parse(nowIso) - startedAt);

function event(eventId: string, receivedAt: string, e: Omit<IncomingEvent, "id" | "source" | "receivedAt">): IncomingEvent {
  return { id: eventId, source: "simulator", receivedAt, ...e };
}

/* ------------------------------------------------------------------ */
/* Act 1 — toll smishing, decided on-device in well under a second.    */
/* ------------------------------------------------------------------ */

const tollSmish: MockScenario = {
  summary: {
    id: "toll-smish",
    title: "Unpaid toll text",
    summary: "Classic toll smishing with a lookalike link. Decided on-device, nothing leaves the phone.",
    tags: ["demo"],
    expected: { label: "scam", scamType: "toll_smishing" },
    kind: "sms",
  },
  build: ({ eventId, startedAt }) => {
    const s = new TraceScript();
    s.add(0, (now) => ({
      type: "event.received",
      event: event(eventId, now, {
        kind: "sms",
        scenarioId: "toll-smish",
        from: { handle: "+14695550188" },
        body: "MetroTag: You have an unpaid toll balance of $6.85. To avoid a $50 late fee pay within 24 hours: https://metrotag-billing.top/pay",
      }),
    }))
      .stage(150, "ingest", "started")
      .stage(120, "ingest", "completed")
      .stage(120, "triage", "started", "On this phone")
      .signal(220, {
        id: "lookalike_link",
        title: "Link isn't MetroTag's",
        detail: "The link goes to metrotag-billing.top. MetroTag's real site is metrotag.example.",
        weight: 1.6,
        source: "heuristic",
        evidence: "https://metrotag-billing.top/pay",
      })
      .signal(200, {
        id: "urgent_fee",
        title: "Deadline with a late fee",
        detail: "Pressure to pay \"within 24 hours\" is how smishing rushes you past thinking.",
        weight: 1.1,
        source: "heuristic",
        evidence: "within 24 hours",
      })
      .signal(200, {
        id: "risky_tld",
        title: "Throwaway web address",
        detail: ".top domains are cheap and common in phishing. Government agencies don't use them.",
        weight: 0.9,
        source: "heuristic",
        evidence: ".top",
      })
      .signal(200, {
        id: "unknown_sender",
        title: "Not in your contacts",
        detail: "The sender isn't anyone you've saved.",
        weight: 0.5,
        source: "heuristic",
      })
      .tool(150, "scam_library.match", "called", "Comparing with known scam texts (on-device)")
      .tool(260, "scam_library.match", "result", "Matches 212 reported toll-scam texts")
      .signal(80, {
        id: "toll_template",
        title: "Known toll-scam wording",
        detail: "Nearly word-for-word the same as toll texts reported across Texas this year.",
        weight: 1.0,
        source: "tool",
      })
      .thought(200, "Sure enough to decide here. Nothing needs to leave your phone.")
      .stage(150, "triage", "completed", "Decided on-device")
      .stage(100, "analyze", "skipped", "Not needed: already certain")
      .stage(80, "challenge", "skipped", "No trusted contact involved")
      .add(120, { type: "privacy", report: ON_DEVICE })
      .stage(150, "verdict", "started");
    const signals = [...s.signals];
    s.add(220, (now) => ({
      type: "verdict",
      verdict: buildVerdict({
        eventId,
        prior: s.prior,
        signals,
        scamType: "toll_smishing",
        headline: "Fake toll bill. Don't tap the link.",
        bandLogOdds: 0.6,
        recovery: TOLL_RECOVERY,
        privacy: ON_DEVICE,
        stagesRun: ["ingest", "triage", "verdict", "recover"],
        latencyMs: Math.min(latencyFrom(startedAt, now), 180),
        decidedAt: now,
      }),
    }))
      .stage(80, "verdict", "completed")
      .stage(80, "recover", "started")
      .stage(200, "recover", "completed", "6 steps");
    return { steps: s.steps };
  },
};

/* ------------------------------------------------------------------ */
/* Act 2 — "Mom" from a new number. Beacon asks the real Mom.          */
/* ------------------------------------------------------------------ */

const MOM_REQUEST_DELAY = 3800;

const momGiftCards: MockScenario = {
  summary: {
    id: "mom-new-number-giftcards",
    title: "\"Mom\" from a new number",
    summary: "Someone claiming to be Mom texts from an unknown number asking for gift cards. Real Mom says it wasn't her.",
    tags: ["demo"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    kind: "sms",
  },
  build: ({ eventId, startedAt }) => {
    const requestId = `vr_${eventId}`;
    const cloudPrivacy: PrivacyReport = {
      sentToCloud: true,
      model: DEEP_MODEL,
      redactions: { phone_number: 1, contact_name: 2 },
      notes: [
        "Names were swapped for relationships (\"the user's mother\")",
        "The sender's number was replaced with a placeholder",
        "Your family safe word stayed on this phone",
      ],
    };

    const s = new TraceScript();
    s.add(0, (now) => ({
      type: "event.received",
      event: event(eventId, now, {
        kind: "sms",
        scenarioId: "mom-new-number-giftcards",
        from: { handle: "+15550109999" },
        body: "Hi honey it's Mom, I broke my phone so this is my new number. I'm in a bind and need you to grab 3 Apple gift cards ($200 each) right now and send me the codes. Please don't tell your dad, I'll explain later ❤️",
      }),
    }))
      .stage(200, "ingest", "started")
      .stage(150, "ingest", "completed")
      .stage(150, "triage", "started", "On this phone")
      .thought(250, "Reading this on your phone first.")
      .signal(350, {
        id: "new_number_claim",
        title: "Says it's Mom on a new number",
        detail: "\"New phone, new number\" is the most common opener for family impersonation.",
        weight: 0.6,
        source: "heuristic",
        evidence: "this is my new number",
      })
      .signal(300, {
        id: "gift_card_payment",
        title: "Asks for gift cards",
        detail: "Gift card codes are untraceable cash. Real family almost never asks for them.",
        weight: 0.9,
        source: "heuristic",
        evidence: "Apple gift cards",
      })
      .signal(300, {
        id: "secrecy",
        title: "Asks you to keep it secret",
        detail: "Secrecy stops you from checking with anyone else.",
        weight: 0.3,
        source: "heuristic",
        evidence: "don't tell your dad",
      })
      .tool(250, "contacts.lookup", "called", "Looking for \"Mom\" in your contacts")
      .tool(350, "contacts.lookup", "result", "Mom is saved with a different number")
      .signal(100, {
        id: "not_saved_number",
        title: "Not Mom's saved number",
        detail: "Mom is in your contacts, but this text came from a number you've never seen.",
        weight: 0.4,
        source: "tool",
      })
      .stage(250, "triage", "completed", "Unsure: needs a closer look")
      .add(200, { type: "privacy", report: cloudPrivacy })
      .stage(150, "analyze", "started", "Nemotron 3 Super")
      .tool(250, "scam_library.search", "called", "Searching known scam patterns")
      .tool(650, "scam_library.search", "result", "Closest match: the \"Hi Mum\" new-number scam")
      .signal(250, {
        id: "new_number_pattern",
        title: "Matches the \"new number\" scam",
        detail: "Nemotron found the same structure as thousands of reported \"Hi Mum\" texts: new number, urgent favor, gift cards.",
        weight: 0.2,
        source: "llm",
      })
      .stage(300, "analyze", "completed")
      .stage(250, "challenge", "started")
      .thought(
        200,
        "The text claims to be from Mom. I won't reply to that number. I'll ask the real Mom on the number you saved for her.",
      )
      .stage(700, "challenge", "completed", "Claim: this text is from Mom")
      .stage(200, "verify", "started", "iMessage to Mom's saved number");

    const triageSignals = [...s.signals];
    const prior = s.prior;

    return {
      steps: s.steps,
      verification: {
        request: (now) => ({
          id: requestId,
          eventId,
          contactId: "mom",
          contactName: "Mom",
          channel: "imessage",
          to: "+15550100001",
          question:
            "Magenta-Guard here, checking a text for your daughter: did you just text her from a new number asking for Apple gift cards? Reply yes or no.",
          claim: "This text is from Mom",
          sentAt: now,
          timeoutMs: 45_000,
        }),
        autoReply: { text: "No?? That's not me!", delayMs: MOM_REQUEST_DELAY },
        resolve: (outcome) => momTail({ eventId, startedAt, prior, triageSignals, outcome, cloudPrivacy }),
      },
    };
  },
};

function momTail(args: {
  eventId: string;
  startedAt: number;
  prior: number;
  triageSignals: TraceScript["signals"];
  outcome: VerificationOutcome;
  cloudPrivacy: PrivacyReport;
}): ScriptStep[] {
  const { eventId, startedAt, prior, outcome, cloudPrivacy } = args;
  const s = new TraceScript(prior);
  s.signals.push(...args.triageSignals);

  const reply = outcome.replyText ? `"${outcome.replyText}"` : "nothing";
  if (outcome.status === "denied") {
    s.signal(250, {
      id: "contact_denied",
      title: "Mom says it wasn't her",
      detail: `We asked Mom on her saved number. She replied ${reply}.`,
      weight: 3.0,
      source: "verification",
    });
  } else if (outcome.status === "confirmed") {
    s.signal(250, {
      id: "contact_confirmed",
      title: "Mom says she sent it",
      detail: `We asked Mom on her saved number. She replied ${reply}.`,
      weight: -2.6,
      source: "verification",
    });
  } else {
    s.thought(250, `Mom replied ${reply}, but it doesn't clearly say yes or no.`);
  }
  s.stage(300, "verify", "completed", outcome.summary);

  const label = s.pScam >= 0.8 ? "scam" : s.pScam >= 0.4 ? "suspicious" : "safe";
  const headline =
    outcome.status === "denied"
      ? "Not Mom. Someone is pretending to be her."
      : outcome.status === "confirmed"
        ? "Mom says this really was her."
        : "Couldn't confirm with Mom. Treat it as suspicious.";
  if (outcome.status === "denied") s.thought(250, "Mom's answer outweighs everything else.");

  s.stage(250, "verdict", "started");
  const signals = [...s.signals];
  s.add(400, (now) => ({
    type: "verdict",
    verdict: buildVerdict({
      eventId,
      prior,
      signals,
      scamType: label === "safe" ? "none" : "family_emergency",
      headline,
      bandLogOdds: outcome.status === "unclear" ? 1.1 : 0.7,
      recovery: label === "scam" ? GIFT_CARD_RECOVERY : CALL_MOM_FIRST,
      privacy: cloudPrivacy,
      stagesRun: ["ingest", "triage", "analyze", "challenge", "verify", "verdict", "recover"],
      latencyMs: latencyFrom(startedAt, now),
      verification: { status: outcome.status, contactName: "Mom", summary: outcome.summary },
      decidedAt: now,
    }),
  }))
    .stage(100, "verdict", "completed")
    .stage(100, "recover", "started")
    .stage(250, "recover", "completed");
  return s.steps;
}

/* ------------------------------------------------------------------ */
/* Control — a normal text from the real Mom. Never leaves the phone.  */
/* ------------------------------------------------------------------ */

const momDinner: MockScenario = {
  summary: {
    id: "mom-dinner-legit",
    title: "Real Mom about dinner",
    summary: "A normal message from Mom's real number. Should stay quiet.",
    tags: ["control"],
    expected: { label: "safe", scamType: "none" },
    kind: "imessage",
  },
  build: ({ eventId, startedAt }) => {
    const s = new TraceScript();
    s.add(0, (now) => ({
      type: "event.received",
      event: event(eventId, now, {
        kind: "imessage",
        scenarioId: "mom-dinner-legit",
        from: { handle: "+15550100001", displayName: "Mom" },
        body: "Are you still coming for dinner Sunday? I'm making enchiladas",
      }),
    }))
      .stage(150, "ingest", "started")
      .stage(100, "ingest", "completed")
      .stage(100, "triage", "started", "On this phone")
      .tool(150, "contacts.lookup", "called", "Checking the sender against your contacts")
      .tool(200, "contacts.lookup", "result", "Mom's saved number")
      .signal(100, {
        id: "known_sender",
        title: "From Mom's saved number",
        detail: "This is the number you saved for Mom.",
        weight: -2.0,
        source: "tool",
      })
      .signal(200, {
        id: "no_risky_asks",
        title: "No links, money or codes",
        detail: "Nothing in the message asks you to pay, sign in or share anything.",
        weight: -0.9,
        source: "heuristic",
      })
      .stage(200, "triage", "completed", "Clearly safe: kept on this phone")
      .stage(100, "analyze", "skipped", "Not needed")
      .add(100, { type: "privacy", report: ON_DEVICE })
      .stage(100, "verdict", "started");
    const signals = [...s.signals];
    s.add(200, (now) => ({
      type: "verdict",
      verdict: buildVerdict({
        eventId,
        prior: s.prior,
        signals,
        scamType: "none",
        headline: "This is really Mom.",
        bandLogOdds: 0.5,
        recovery: [],
        privacy: ON_DEVICE,
        stagesRun: ["ingest", "triage", "verdict"],
        latencyMs: Math.min(latencyFrom(startedAt, now), 40),
        decidedAt: now,
      }),
    })).stage(80, "verdict", "completed");
    return { steps: s.steps };
  },
};

/* ------------------------------------------------------------------ */
/* Act 3 — a cloned-voice "grandson" call, scored as the call unfolds.  */
/* ------------------------------------------------------------------ */

export const GRANDSON_TRANSCRIPT: TranscriptSegment[] = [
  { speaker: "caller", text: "Grandma? It's me, Sam. I'm in trouble.", atMs: 1800 },
  { speaker: "user", text: "Sam? You sound different, honey.", atMs: 4600 },
  { speaker: "caller", text: "I've got a bad cold. Listen, I was in a car accident and they're holding me. I need bail.", atMs: 7000 },
  { speaker: "caller", text: "Please don't tell Mom and Dad. A lawyer will call you. It has to be cash or gift cards, today.", atMs: 11000 },
  { speaker: "user", text: "Oh no. Where are you?", atMs: 15500 },
  { speaker: "caller", text: "I can't talk long. Please, Grandma. I need you.", atMs: 17500 },
];

const grandsonCall: MockScenario = {
  summary: {
    id: "grandson-bail-call",
    title: "Cloned-voice \"grandson\" call",
    summary: "A caller using Sam's voice says he's in jail and needs bail in gift cards. Real Sam is in class.",
    tags: ["demo", "call"],
    expected: { label: "scam", scamType: "family_emergency", verification: "denied" },
    kind: "call",
  },
  build: ({ eventId, startedAt }) => {
    const requestId = `vr_${eventId}`;
    const privacy: PrivacyReport = {
      sentToCloud: true,
      model: DEEP_MODEL,
      redactions: { contact_name: 3, phone_number: 1 },
      notes: [
        "Only the transcript was analyzed, never the audio",
        "Names were swapped for relationships (\"the user's grandson\")",
        "Your family safe word stayed on this phone",
      ],
    };

    const s = new TraceScript();
    s.add(0, (now) => ({
      type: "event.received",
      event: event(eventId, now, {
        kind: "call",
        scenarioId: "grandson-bail-call",
        from: { handle: "+15550147731", displayName: "Sam" },
        body: GRANDSON_TRANSCRIPT.map((t) => `${t.speaker === "caller" ? "Caller" : "You"}: ${t.text}`).join("\n"),
        transcript: GRANDSON_TRANSCRIPT,
      }),
    }))
      .stage(150, "ingest", "started", "Live call transcript")
      .stage(100, "ingest", "completed")
      .stage(100, "triage", "started", "Listening on this phone")
      .tool(300, "contacts.lookup", "called", "Checking the caller against your contacts")
      .tool(300, "contacts.lookup", "result", "Sam is saved with a different number")
      .signal(1300, {
        id: "claims_family_unknown_number",
        title: "Says it's Sam, from an unknown number",
        detail: "Caller ID says \"Sam\", but Sam's saved number is different. Caller ID names are easy to fake.",
        weight: 0.8,
        source: "tool",
        evidence: "It's me, Sam",
      })
      .thought(2900, "\"You sound different\" is often the first hint of an AI-cloned voice.")
      .signal(2500, {
        id: "bail_request",
        title: "Urgent bail money",
        detail: "Accident plus jail plus bail is the classic grandparent-scam script.",
        weight: 1.0,
        source: "heuristic",
        evidence: "I need bail",
      })
      .signal(3900, {
        id: "untraceable_payment",
        title: "Cash or gift cards only",
        detail: "Courts don't take gift cards. Untraceable payment is the giveaway.",
        weight: 1.1,
        source: "heuristic",
        evidence: "cash or gift cards",
      })
      .signal(250, {
        id: "secrecy",
        title: "Don't tell Mom and Dad",
        detail: "Secrecy stops you from calling the family to check.",
        weight: 0.5,
        source: "heuristic",
        evidence: "don't tell Mom and Dad",
      })
      .stage(200, "triage", "completed", "High risk: warn during the call")
      .add(150, { type: "privacy", report: privacy })
      .stage(100, "analyze", "started", "Nemotron 3 Super")
      .signal(700, {
        id: "grandparent_script",
        title: "Follows the \"grandparent scam\" script",
        detail: "Nemotron matched the call to the grandparent scam: panic, a stranger \"lawyer\", gift cards, secrecy.",
        weight: 0.6,
        source: "llm",
      })
      .stage(200, "analyze", "completed")
      .stage(150, "challenge", "started")
      .thought(150, "The caller claims to be Sam. I'll text the real Sam on his saved number while you're on the call.")
      .stage(250, "challenge", "completed", "Claim: the caller is Sam")
      .stage(150, "verify", "started", "iMessage to Sam's saved number");

    const triageSignals = [...s.signals];
    const prior = s.prior;

    return {
      steps: s.steps,
      verification: {
        request: (now) => ({
          id: requestId,
          eventId,
          contactId: "sam",
          contactName: "Sam",
          channel: "imessage",
          to: "+15550100002",
          question: "Magenta-Guard here, checking a call for your grandma: are you calling her right now asking for bail money? Reply yes or no.",
          claim: "The caller is Sam",
          sentAt: now,
          timeoutMs: 45_000,
        }),
        autoReply: { text: "No, I'm in class. That's not me!", delayMs: 2600 },
        resolve: (outcome) => {
          const t = new TraceScript(prior);
          t.signals.push(...triageSignals);
          if (outcome.status === "denied") {
            t.signal(200, {
              id: "contact_denied",
              title: "Sam says it isn't him",
              detail: `We texted Sam on his saved number. He replied "${outcome.replyText ?? ""}".`,
              weight: 3.0,
              source: "verification",
            });
          } else if (outcome.status === "confirmed") {
            t.signal(200, {
              id: "contact_confirmed",
              title: "Sam says it's him",
              detail: `We texted Sam on his saved number. He replied "${outcome.replyText ?? ""}".`,
              weight: -2.6,
              source: "verification",
            });
          }
          t.stage(250, "verify", "completed", outcome.summary).stage(200, "verdict", "started");
          const signals = [...t.signals];
          const label = t.pScam >= 0.8 ? "scam" : t.pScam >= 0.4 ? "suspicious" : "safe";
          t.add(300, (now) => ({
            type: "verdict",
            verdict: buildVerdict({
              eventId,
              prior,
              signals,
              scamType: label === "safe" ? "none" : "family_emergency",
              headline:
                outcome.status === "denied"
                  ? "Not Sam. This may be a cloned voice."
                  : outcome.status === "confirmed"
                    ? "Sam says this really is him."
                    : "Couldn't reach Sam. Hang up and call him back.",
              bandLogOdds: outcome.status === "unclear" ? 1.1 : 0.7,
              recovery: VOICE_CLONE_RECOVERY,
              privacy,
              stagesRun: ["ingest", "triage", "analyze", "challenge", "verify", "verdict", "recover"],
              latencyMs: latencyFrom(startedAt, now),
              verification: { status: outcome.status, contactName: "Sam", summary: outcome.summary },
              decidedAt: now,
            }),
          }))
            .stage(100, "verdict", "completed")
            .stage(100, "recover", "started")
            .stage(200, "recover", "completed");
          return t.steps;
        },
      },
    };
  },
};

export const MOCK_SCENARIOS: MockScenario[] = [tollSmish, momGiftCards, grandsonCall, momDinner];

export function findMockScenario(id: string): MockScenario | undefined {
  return MOCK_SCENARIOS.find((s) => s.summary.id === id);
}
