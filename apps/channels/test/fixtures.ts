import type { Verdict, VerificationRequest } from "@beacon/shared";

export function request(over: Partial<VerificationRequest> = {}): VerificationRequest {
  return {
    id: "vr_1",
    eventId: "ev_1",
    contactId: "mom",
    contactName: "Mom",
    channel: "imessage",
    to: "+1 (555) 010-0142",
    question: "Did you just text Sam asking for gift cards?",
    claim: "Mom needs gift cards",
    sentAt: "2026-11-08T10:00:00.000Z",
    timeoutMs: 60_000,
    ...over,
  };
}

export function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    eventId: "ev_1",
    label: "scam",
    pScam: 0.97,
    confidence: 0.96,
    band: [0.9, 0.99],
    scamType: "impersonation" as Verdict["scamType"],
    headline: "x",
    signals: [
      { id: "a", title: "Asks for gift cards", detail: "d", weight: 2.1, source: "heuristic" },
      { id: "b", title: "Real Mom denied sending it", detail: "d", weight: 4, source: "verification" },
      { id: "c", title: "Known number", detail: "d", weight: -0.5, source: "tool" },
      { id: "d", title: "Urgent tone", detail: "d", weight: 1, source: "llm" },
    ],
    recovery: [{ id: "r1", title: "Do not send any gift card codes", detail: "Block the number and call Mom directly", urgency: "now" }],
    privacy: { sentToCloud: false, redactions: {}, notes: [] },
    stagesRun: [],
    latencyMs: 10,
    decidedAt: "2026-11-08T10:00:01.000Z",
    ...over,
  };
}
