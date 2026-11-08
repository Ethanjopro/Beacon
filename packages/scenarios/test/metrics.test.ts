import { describe, expect, it } from "vitest";
import type { VerdictLabel } from "@beacon/shared";
import { compareBaseline, computeMetrics, confusion3, ece, percentile, perTypeRecall, prf, reliability, scamVsNot, type Prediction } from "../src/eval/metrics.js";

const p = (id: string, truth: VerdictLabel, pred: VerdictLabel, pScam: number, extra: Partial<Prediction> = {}): Prediction => ({
  id, truthLabel: truth, truthScam: truth !== "safe", truthType: truth === "safe" ? "none" : "toll_smishing",
  predLabel: pred, predType: pred === "safe" ? "none" : "toll_smishing", pScam, latencyMs: 10, sentToCloud: false, ...extra,
});

describe("metrics", () => {
  it("prf computes precision/recall/F1", () => {
    const r = prf([{ truth: true, pred: true }, { truth: true, pred: false }, { truth: false, pred: true }, { truth: false, pred: false }, { truth: true, pred: true }]);
    expect(r).toMatchObject({ tp: 2, fn: 1, fp: 1, tn: 1 });
    expect(r.precision).toBeCloseTo(2 / 3);
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.f1).toBeCloseTo(2 / 3);
    expect(prf([]).f1).toBe(0);
  });

  it("lenient treats suspicious as positive, strict does not", () => {
    const preds = [p("a", "scam", "suspicious", 0.6), p("b", "scam", "scam", 0.9), p("c", "safe", "safe", 0.1)];
    expect(scamVsNot(preds, "lenient").recall).toBe(1);
    expect(scamVsNot(preds, "strict").recall).toBe(0.5);
  });

  it("confusion matrix counts truth x predicted", () => {
    const m = confusion3([p("a", "scam", "safe", 0.2), p("b", "scam", "scam", 0.9), p("c", "safe", "scam", 0.8)]);
    expect(m.scam.safe).toBe(1);
    expect(m.scam.scam).toBe(1);
    expect(m.safe.scam).toBe(1);
  });

  it("per-type recall separates flagged from type-correct", () => {
    const wrongType = p("a", "scam", "scam", 0.9, { predType: "other" });
    const r = perTypeRecall([wrongType, p("b", "scam", "safe", 0.1)]);
    expect(r).toEqual([{ type: "toll_smishing", n: 2, flagged: 1, typeCorrect: 0, recall: 0.5, typeRecall: 0 }]);
  });

  it("ECE is 0 for perfectly calibrated and large for confidently wrong", () => {
    expect(ece([{ pScam: 1, truthScam: true }, { pScam: 0, truthScam: false }])).toBe(0);
    expect(ece([{ pScam: 0.95, truthScam: false }, { pScam: 0.95, truthScam: false }])).toBeCloseTo(0.95);
    // 4 items at 0.7, 3 positive -> observed .75, |.75-.7| = .05
    const items = [true, true, true, false].map((t) => ({ pScam: 0.7, truthScam: t }));
    expect(ece(items)).toBeCloseTo(0.05);
  });

  it("reliability puts p=1.0 in the last bin", () => {
    const bins = reliability([{ pScam: 1, truthScam: true }, { pScam: 0.05, truthScam: false }]);
    expect(bins).toHaveLength(10);
    expect(bins[9]!.n).toBe(1);
    expect(bins[0]!.n).toBe(1);
  });

  it("percentile uses nearest rank", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(v, 50)).toBe(5);
    expect(percentile(v, 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });

  it("baseline comparison scores both systems on the same items", () => {
    const preds = [p("a", "scam", "scam", 0.9), p("b", "safe", "safe", 0.1)];
    const cmp = compareBaseline(preds, new Map([["a", false], ["b", false]]))!;
    expect(cmp.beacon.accuracy).toBe(1);
    expect(cmp.baseline.accuracy).toBe(0.5);
    expect(compareBaseline(preds, new Map())).toBeUndefined();
  });

  it("computeMetrics aggregates on-device rate and accuracy", () => {
    const m = computeMetrics([p("a", "scam", "scam", 0.9, { sentToCloud: true }), p("b", "safe", "safe", 0.1)]);
    expect(m.onDevicePct).toBe(50);
    expect(m.accuracy).toBe(1);
  });
});
