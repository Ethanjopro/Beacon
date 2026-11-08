import { describe, expect, it } from "vitest";
import { TraceBody, Verdict } from "@beacon/shared";
import { createAgent } from "../src/index.js";
import { SAFE_WORD, contacts, harness, makeEvent, stageTrace } from "./helpers.js";

const TOLL = "TxTag: You have an unpaid toll balance of $6.85. To avoid a $50 late fee pay within 24 hours: https://txtag-billing.top/pay";

describe("pipeline", () => {
  it("demo Act 1: the toll smish is decided on-device in one pass", async () => {
    const h = harness();
    const v = await h.run(makeEvent(TOLL, "+12345550123"));
    expect(v.label).toBe("scam");
    expect(v.scamType).toBe("toll_smishing");
    expect(stageTrace(h.trace, "analyze")).toEqual(["skipped"]);
    expect(v.privacy.sentToCloud).toBe(false);
    expect(v.privacy.notes.join(" ")).toMatch(/on this device/);
    expect(v.headline).toBe('This is a fake toll bill — look-alike website imitating "txtag".');
  });

  it("emits schema-valid traces in stage order, a score after every signal, and the verdict last", async () => {
    const h = harness({ reply: "No, not me!" });
    const v = await h.run(makeEvent("Hi it's Mom, new number. Please send $400 on Zelle right now, don't tell dad", "+15550107777"));
    for (const t of h.trace) expect(() => TraceBody.parse(t)).not.toThrow();
    expect(() => Verdict.parse(v)).not.toThrow();

    const firstStarted = (stage: string) => h.trace.findIndex((t) => t.type === "stage" && t.stage === stage);
    const order = ["ingest", "triage", "analyze", "challenge", "verify", "verdict", "recover"].map(firstStarted);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    h.trace.forEach((t, i) => {
      if (t.type === "signal") expect(h.trace[i + 1]?.type).toBe("score");
    });
    expect(h.trace.some((t) => t.type === "privacy")).toBe(true);
    expect(h.trace.filter((t) => t.type === "thought").length).toBeGreaterThanOrEqual(3);
    expect(h.trace.at(-1)).toEqual({ type: "verdict", verdict: v });
    expect(v.stagesRun).toEqual(["ingest", "triage", "analyze", "challenge", "verify", "verdict", "recover"]);
  });

  it("stagesRun leaves out skipped stages", async () => {
    const v = await harness().run(makeEvent("See you at practice at 6!", "+15550100001"));
    expect(v.stagesRun).toEqual(["ingest", "triage", "verdict", "recover"]);
  });

  it("signals are sorted by |weight| and the score matches them exactly", async () => {
    const v = await harness().run(makeEvent(TOLL, "+12345550123"));
    const weights = v.signals.map((s) => Math.abs(s.weight));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    const logOdds = -1.5 + v.signals.reduce((s, x) => s + x.weight, 0);
    expect(v.pScam).toBeCloseTo(1 / (1 + Math.exp(-logOdds)), 6);
    expect(v.band[0]).toBeLessThanOrEqual(v.pScam);
    expect(v.band[1]).toBeGreaterThanOrEqual(v.pScam);
  });

  it("mock mode is honest about privacy", async () => {
    const v = await harness().run(makeEvent("Hi it's Mom, new number, can you send me $200?", "+15550107777"));
    expect(v.privacy).toMatchObject({ sentToCloud: false, model: undefined });
    expect(v.privacy.notes).toContain("Offline mode — analysis ran on this device");
  });

  it("the safe word never reaches a trace or the verdict (even in the contact's reply)", async () => {
    const h = harness({ reply: `Yes it's me, ${SAFE_WORD}!` });
    const v = await h.run(makeEvent(`It's Mom. ${SAFE_WORD.toUpperCase()}. New number, send $50 for lunch`, "+15550107777"));
    const everything = JSON.stringify([h.trace, v, h.requests]).toLowerCase();
    expect(everything).not.toContain("heron");
    expect(v.signals.some((s) => s.id === "knows_safe_word")).toBe(true);
  });

  it("uses earlier messages in the same thread as context", async () => {
    const h = harness();
    const thread = { threadId: "thread_x" };
    await h.run(makeEvent("Hi is this Jessica? We met at the yoga class last week.", "+15550105151", thread));
    const v = await h.run(makeEvent("Anyway, I make extra income on this trading platform, want me to show you?", "+15550105151", thread));
    expect(v.signals.some((s) => s.id === "thread_wrong_number_opener")).toBe(true);
    expect(v.label).not.toBe("safe");
  });

  it("run() never throws: a broken registry yields a cautious verdict", async () => {
    const trace: TraceBody[] = [];
    const agent = createAgent({
      contacts: () => {
        throw new Error("registry offline");
      },
      emit: (_id, b) => trace.push(b),
      verify: async () => ({ status: "timeout" }),
    });
    const v = await agent.run(makeEvent("anything"));
    expect(v.label).toBe("suspicious");
    expect(trace.some((t) => t.type === "error")).toBe(true);
    expect(trace.at(-1)?.type).toBe("verdict");
  });

  it("a throwing emit() doesn't break the verdict", async () => {
    const agent = createAgent({
      contacts: () => contacts,
      emit: () => {
        throw new Error("listener crashed");
      },
      verify: async () => ({ status: "timeout" }),
    });
    const v = await agent.run(makeEvent(TOLL, "+12345550123"));
    expect(v.label).toBe("scam");
  });
});
