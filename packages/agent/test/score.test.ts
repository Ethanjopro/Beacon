import { describe, expect, it } from "vitest";
import { logistic } from "@beacon/shared";
import { Evidence, PRIOR_LOG_ODDS, bandFor, boundLlmWeights } from "../src/pipeline/score.js";

const sig = (id: string, weight: number) => ({ id, title: id, detail: "", weight, source: "heuristic" as const });

describe("score fusion", () => {
  it("is logistic(prior + Σ weights) and ignores duplicate ids", () => {
    const e = new Evidence();
    expect(e.add(sig("a", 2))).toBe(true);
    expect(e.add(sig("a", 2))).toBe(false);
    e.add(sig("b", -0.5));
    expect(e.logOdds()).toBeCloseTo(PRIOR_LOG_ODDS + 1.5);
    expect(e.pScam()).toBeCloseTo(logistic(0));
    expect(e.sorted().map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("caps each LLM signal and the LLM total at ±2.5, keeping weights exact", () => {
    const bounded = boundLlmWeights([{ weight: 9 }, { weight: 1 }, { weight: 1 }]);
    expect(bounded[0]!.weight).toBeLessThanOrEqual(2.5);
    const total = bounded.reduce((s, x) => s + x.weight, 0);
    expect(total).toBeLessThanOrEqual(2.5 + 0.01);
    expect(boundLlmWeights([{ weight: -4 }])[0]!.weight).toBe(-2.5);
    expect(boundLlmWeights([{ weight: 0.7 }])[0]!.weight).toBe(0.7);
  });

  it("widens the band when verification was needed but missing, or the model disagrees", () => {
    const width = (b: [number, number]) => b[1] - b[0];
    const settled = bandFor({ logOdds: 0.5, signalCount: 4, claimed: true, verification: "denied" });
    const missing = bandFor({ logOdds: 0.5, signalCount: 4, claimed: true, verification: "timeout" });
    const disagree = bandFor({ logOdds: 0.5, signalCount: 4, claimed: false, llmPScam: 0.02 });
    const agree = bandFor({ logOdds: 0.5, signalCount: 4, claimed: false, llmPScam: logistic(0.5) });
    expect(width(missing)).toBeGreaterThan(width(settled));
    expect(width(disagree)).toBeGreaterThan(width(agree));
  });

  it("always contains the point estimate", () => {
    for (const x of [-12, -3, 0, 3, 12]) {
      const [lo, hi] = bandFor({ logOdds: x, signalCount: 1, claimed: false });
      expect(lo).toBeLessThanOrEqual(logistic(x));
      expect(hi).toBeGreaterThanOrEqual(logistic(x));
    }
  });
});
