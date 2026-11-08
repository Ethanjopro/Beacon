import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@beacon/shared";
import { eventsInThread, initialPhoneState, isVerificationPending, phoneReducer, type PhoneState } from "../src/state/reducer";

const at = "2026-11-08T18:00:00.000Z";
const received = (eventId: string, seq: number, handle = "+15550109999"): TraceEvent => ({
  type: "event.received",
  seq,
  eventId,
  at,
  event: { id: eventId, kind: "sms", source: "scenario", from: { handle }, body: "hi", receivedAt: at },
});

const apply = (events: TraceEvent[], state: PhoneState = initialPhoneState) =>
  events.reduce((s, event) => phoneReducer(s, { type: "trace", event }), state);

describe("phoneReducer", () => {
  it("keys state by eventId, newest first", () => {
    const s = apply([received("a", 1), received("b", 2)]);
    expect(s.order).toEqual(["b", "a"]);
    expect(s.byId.a?.event?.id).toBe("a");
  });

  it("dedupes replayed items by seq", () => {
    const score: TraceEvent = { type: "score", pScam: 0.5, seq: 2, eventId: "a", at };
    const s = apply([received("a", 1), score, score, received("a", 1)]);
    expect(s.byId.a?.trace).toHaveLength(2);
  });

  it("keeps trace in seq order even if items arrive out of order", () => {
    const s = apply([
      received("a", 1),
      { type: "thought", text: "later", seq: 5, eventId: "a", at },
      { type: "thought", text: "earlier", seq: 3, eventId: "a", at },
    ]);
    expect(s.byId.a?.trace.map((t) => t.seq)).toEqual([1, 3, 5]);
  });

  it("tracks stages, signals, score and verification", () => {
    const s = apply([
      received("a", 1),
      { type: "stage", stage: "triage", status: "started", seq: 2, eventId: "a", at },
      {
        type: "signal",
        seq: 3,
        eventId: "a",
        at,
        signal: { id: "x", title: "X", detail: "d", weight: 1, source: "heuristic" },
      },
      { type: "score", pScam: 0.62, seq: 4, eventId: "a", at },
      {
        type: "verification.requested",
        seq: 5,
        eventId: "a",
        at,
        request: {
          id: "r1",
          eventId: "a",
          contactId: "mom",
          contactName: "Mom",
          channel: "imessage",
          to: "+15550100001",
          question: "q",
          claim: "c",
          sentAt: at,
          timeoutMs: 1000,
        },
      },
    ]);
    const view = s.byId.a!;
    expect(view.activeStage).toBe("triage");
    expect(view.signals).toHaveLength(1);
    expect(view.pScam).toBe(0.62);
    expect(isVerificationPending(view)).toBe(true);

    const done = apply(
      [
        { type: "stage", stage: "triage", status: "completed", seq: 6, eventId: "a", at },
        {
          type: "verification.resolved",
          seq: 7,
          eventId: "a",
          at,
          outcome: { requestId: "r1", status: "denied", summary: "no", resolvedAt: at },
        },
      ],
      s,
    );
    expect(done.byId.a?.activeStage).toBeUndefined();
    expect(isVerificationPending(done.byId.a!)).toBe(false);
  });

  it("groups events into threads by sender", () => {
    const s = apply([received("a", 1, "+1"), received("b", 2, "+2"), received("c", 3, "+1")]);
    expect(eventsInThread(s, "+1").map((v) => v.eventId)).toEqual(["a", "c"]);
  });

  it("deletes a conversation by threadKey and records it in deletedKeys", () => {
    const s = apply([received("a", 1, "+15550100001"), received("b", 2, "+15550100002")]);
    expect(s.order).toEqual(["b", "a"]);
    const deleted = phoneReducer(s, { type: "deleteConversation", threadKey: "+15550100001" });
    expect(deleted.order).toEqual(["b"]);
    expect(deleted.byId.a).toBeUndefined();
    expect(deleted.byId.b).toBeDefined();
    expect(deleted.deletedKeys).toContain("+15550100001");
  });

  it("reset clears everything", () => {
    expect(phoneReducer(apply([received("a", 1)]), { type: "reset" })).toEqual(initialPhoneState);
  });
});
