import { describe, expect, it } from "vitest";
import { TraceEvent, Verdict, type TraceEvent as TraceEventT } from "@beacon/shared";
import { MockEngine } from "../src/mock/engine";
import { MOCK_SCENARIOS } from "../src/mock/scenarios";
import { MOCK_CONTACTS } from "../src/mock/contacts";
import { initialPhoneState, phoneReducer, type PhoneState } from "../src/state/reducer";
import { ManualClock } from "./helpers";

function setup(opts: { autoReply?: boolean } = {}) {
  const clock = new ManualClock();
  const engine = new MockEngine({ setTimer: clock.setTimer, clearTimer: clock.clearTimer, now: clock.date, ...opts });
  const events: TraceEventT[] = [];
  let state: PhoneState = initialPhoneState;
  engine.subscribe((ev) => {
    events.push(ev);
    state = phoneReducer(state, { type: "trace", event: ev });
  });
  return { clock, engine, events, state: () => state };
}

function verdictOf(events: TraceEventT[], eventId: string) {
  const v = events.find((e) => e.eventId === eventId && e.type === "verdict");
  return v?.type === "verdict" ? v.verdict : undefined;
}

describe("mock scenarios", () => {
  it.each(MOCK_SCENARIOS.map((s) => s.summary.id))("%s emits only contract-valid trace items", (id) => {
    const { clock, engine, events } = setup();
    engine.fire(id);
    clock.runAll();
    expect(events.length).toBeGreaterThan(5);
    for (const ev of events) expect(() => TraceEvent.parse(ev)).not.toThrow();
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict?.type).toBe("verdict");
    if (verdict?.type === "verdict") expect(() => Verdict.parse(verdict.verdict)).not.toThrow();
  });

  it("matches each scenario's expected label", () => {
    for (const scenario of MOCK_SCENARIOS) {
      const { clock, engine, events } = setup();
      const { eventId } = engine.fire(scenario.summary.id);
      clock.runAll();
      const verdict = verdictOf(events, eventId);
      expect(verdict?.label, scenario.summary.id).toBe(scenario.summary.expected.label);
      expect(verdict?.scamType, scenario.summary.id).toBe(scenario.summary.expected.scamType);
    }
  });

  it("toll smish is decided on-device: nothing sent to the cloud, analyze skipped", () => {
    const { clock, engine, events } = setup();
    const { eventId } = engine.fire("toll-smish");
    clock.runAll();
    const verdict = verdictOf(events, eventId)!;
    expect(verdict.privacy.sentToCloud).toBe(false);
    expect(verdict.pScam).toBeGreaterThanOrEqual(0.97);
    expect(events.some((e) => e.type === "stage" && e.stage === "analyze" && e.status === "skipped")).toBe(true);
  });

  it("verdict pScam is explainable: logistic(prior + Σ weights)", () => {
    const { clock, engine, events } = setup();
    const { eventId } = engine.fire("mom-new-number-giftcards");
    clock.runAll();
    const verdict = verdictOf(events, eventId)!;
    const sum = verdict.signals.reduce((s, x) => s + x.weight, 0);
    expect(verdict.pScam).toBeCloseTo(1 / (1 + Math.exp(-(-1.5 + sum))), 3);
    expect(verdict.band[0]).toBeLessThanOrEqual(verdict.pScam);
    expect(verdict.band[1]).toBeGreaterThanOrEqual(verdict.pScam);
  });

  it("score events never exceed [0,1] and the meter climbs before verification", () => {
    const { clock, engine, events } = setup({ autoReply: false });
    engine.fire("mom-new-number-giftcards");
    clock.runAll();
    const scores = events.flatMap((e) => (e.type === "score" ? [e.pScam] : []));
    expect(scores.length).toBeGreaterThan(2);
    const last = scores[scores.length - 1]!;
    expect(last).toBeGreaterThanOrEqual(0.4); // suspicious while waiting for Mom
    expect(last).toBeLessThan(0.8);
  });
});

describe("mock verification flow", () => {
  it("auto-replies as Mom and flips the verdict to SCAM ~98%", () => {
    const { clock, engine, events, state } = setup();
    const { eventId } = engine.fire("mom-new-number-giftcards");
    clock.advance(9_000);
    expect(engine.pendingVerifications()).toHaveLength(1);
    expect(state().byId[eventId]?.verification?.request?.to).toBe("+15550100001");
    clock.runAll();
    expect(engine.pendingVerifications()).toHaveLength(0);
    const verdict = verdictOf(events, eventId)!;
    expect(verdict.label).toBe("scam");
    expect(verdict.pScam).toBeGreaterThan(0.95);
    expect(verdict.verification?.status).toBe("denied");
    expect(verdict.signals[0]?.source).toBe("verification");
  });

  it("verification goes to the saved handle, never the sender, and leaks no safe word", () => {
    const { clock, engine, events } = setup({ autoReply: false });
    engine.fire("mom-new-number-giftcards");
    clock.runAll();
    const [request] = engine.pendingVerifications();
    const mom = MOCK_CONTACTS.find((c) => c.id === "mom")!;
    expect(request?.to).toBe(mom.verifyVia.handle);
    expect(request?.question).not.toContain("+15550109999");
    expect(JSON.stringify(events).toLowerCase()).not.toContain("heron");
  });

  it("the console can answer first; a confirming reply ends safe", () => {
    const { clock, engine, events } = setup();
    const { eventId } = engine.fire("mom-new-number-giftcards");
    clock.advance(9_000);
    const [request] = engine.pendingVerifications();
    const outcome = engine.reply(request!.id, "Yes that was me, sorry!");
    expect(outcome?.status).toBe("confirmed");
    clock.runAll();
    expect(verdictOf(events, eventId)?.label).toBe("safe");
    // auto-reply was cancelled: exactly one resolution
    expect(events.filter((e) => e.type === "verification.resolved")).toHaveLength(1);
  });

  it("an unclear reply stays suspicious", () => {
    const { clock, engine, events } = setup({ autoReply: false });
    const { eventId } = engine.fire("mom-new-number-giftcards");
    clock.runAll();
    engine.reply(engine.pendingVerifications()[0]!.id, "who is this?");
    clock.runAll();
    expect(verdictOf(events, eventId)?.label).toBe("suspicious");
  });

  it("reset stops in-flight scripts and clears pending verifications", () => {
    const { clock, engine, events } = setup();
    engine.fire("mom-new-number-giftcards");
    clock.advance(1_000);
    const before = events.length;
    engine.reset();
    clock.runAll();
    expect(events.length).toBe(before);
    expect(engine.pendingVerifications()).toHaveLength(0);
    expect(clock.pendingTimers).toBe(0);
  });

  it("the call carries a timed transcript and gets a cloned-voice verdict", () => {
    const { clock, engine, events, state } = setup();
    const { eventId } = engine.fire("grandson-bail-call");
    clock.runAll();
    const view = state().byId[eventId]!;
    expect(view.event?.kind).toBe("call");
    const atMs = view.event?.transcript?.map((t) => t.atMs) ?? [];
    expect(atMs.length).toBeGreaterThan(3);
    expect([...atMs].sort((a, b) => a - b)).toEqual(atMs);
    expect(verdictOf(events, eventId)?.label).toBe("scam");
  });
});
