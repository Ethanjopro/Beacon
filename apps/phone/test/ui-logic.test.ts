import { describe, expect, it } from "vitest";
import type { Signal } from "@beacon/shared";
import { evidenceRanges } from "../src/lib/evidence";
import { explainScore } from "../src/lib/explain";
import { formatHandle, formatPct, formatWeight } from "../src/lib/format";
import { buildConversations, SEED_THREADS } from "../src/lib/inbox";
import { isConsoleRoute, isMockMode } from "../src/lib/mode";
import { bannerState } from "../src/lib/progress";
import { MockEngine } from "../src/mock/engine";
import { MOCK_CONTACTS } from "../src/mock/contacts";
import { initialPhoneState, phoneReducer, type PhoneState } from "../src/state/reducer";
import { ManualClock } from "./helpers";

const sig = (id: string, weight: number, evidence?: string): Signal => ({
  id,
  title: id,
  detail: "",
  weight,
  source: "heuristic",
  ...(evidence ? { evidence } : {}),
});

describe("format", () => {
  it("never shows 0% or 100%", () => {
    expect(formatPct(0.973)).toBe("97%");
    expect(formatPct(0.996)).toBe("99.6%");
    expect(formatPct(0.99)).toBe("99%");
    expect(formatPct(1)).toBe("99.9%");
    expect(formatPct(0)).toBe("0.1%");
  });
  it("formats weights and handles", () => {
    expect(formatWeight(1.6)).toBe("+1.6");
    expect(formatWeight(-2)).toBe("−2.0");
    expect(formatHandle("+15550109999")).toBe("(555) 010-9999");
    expect(formatHandle("alerts@x.example")).toBe("alerts@x.example");
  });
});

describe("mode", () => {
  it("reads ?mock and #/console", () => {
    expect(isMockMode("?mock=1")).toBe(true);
    expect(isMockMode("?mock=0")).toBe(false);
    expect(isMockMode("")).toBe(false);
    expect(isConsoleRoute("#/console")).toBe(true);
    expect(isConsoleRoute("")).toBe(false);
  });
});

describe("explainScore", () => {
  it("derives the prior from the agent's own number", () => {
    const signals = [sig("a", 1.6), sig("b", 1.1)];
    const p = 1 / (1 + Math.exp(-(-2 + 2.7)));
    const ex = explainScore(signals, p);
    expect(ex.prior).toBeCloseTo(-2, 5);
    expect(ex.pScam).toBe(p);
    expect(ex.signals[0]?.id).toBe("a");
  });
  it("falls back to the default prior without a score", () => {
    expect(explainScore([sig("a", 1.5)]).pScam).toBeCloseTo(0.5, 5);
  });
});

describe("evidenceRanges", () => {
  it("finds scam evidence case-insensitively, skipping overlaps and safe signals", () => {
    const text = "Pay within 24 hours: https://txtag-billing.top/pay";
    const ranges = evidenceRanges(text, [
      sig("link", 1.6, "https://txtag-billing.top/pay"),
      sig("tld", 0.9, ".top"), // overlaps the link → skipped
      sig("urgent", 1.1, "WITHIN 24 HOURS"),
      sig("safe", -1, "Pay"),
    ]);
    expect(ranges.map((r) => r.signal.id)).toEqual(["urgent", "link"]);
    expect(text.slice(ranges[0]!.start, ranges[0]!.end)).toBe("within 24 hours");
  });
});

describe("bannerState + inbox over a real mock run", () => {
  function run(id: string, opts: { autoReply?: boolean; ms?: number } = {}) {
    const clock = new ManualClock();
    const engine = new MockEngine({ setTimer: clock.setTimer, clearTimer: clock.clearTimer, now: clock.date, autoReply: opts.autoReply });
    let state: PhoneState = initialPhoneState;
    engine.subscribe((event) => (state = phoneReducer(state, { type: "trace", event })));
    const { eventId } = engine.fire(id);
    clock.advance(opts.ms ?? 60_000);
    return { state, view: state.byId[eventId]! };
  }

  it("says it's asking the real Mom while verification is pending", () => {
    const { view } = run("mom-new-number-giftcards", { autoReply: false });
    const b = bannerState(view);
    expect(b.tone).toBe("waiting");
    expect(b.title).toContain("Mom");
  });

  it("shows the verdict, and plain words in simple mode", () => {
    const { view } = run("mom-new-number-giftcards");
    expect(bannerState(view).tone).toBe("scam");
    expect(bannerState(view).detail).toBe("Mom: “No?? That's not me!”");
    expect(bannerState(view, true).title).toBe("This is a scam");
  });

  it("puts the real Mom's message in the seeded Mom thread", () => {
    const { state } = run("mom-dinner-legit");
    const convs = buildConversations(state, MOCK_CONTACTS);
    expect(convs[0]?.name).toBe("Mom");
    expect(convs[0]?.seed).toBe(SEED_THREADS[0]);
    expect(convs.filter((c) => c.handle === "+15550100001")).toHaveLength(1);
  });

  it("shows an unknown sender by number, not by the name it claims", () => {
    const { state } = run("mom-new-number-giftcards");
    expect(buildConversations(state, MOCK_CONTACTS)[0]?.name).toBe("(555) 010-9999");
  });
});
