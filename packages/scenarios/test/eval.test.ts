import { describe, expect, it } from "vitest";
import { libraryItems } from "../src/eval/datasets.js";
import { parseEvalArgs } from "../src/eval/index.js";
import { computeMetrics } from "../src/eval/metrics.js";
import { buildReport, renderMarkdown } from "../src/eval/report.js";
import { runEval } from "../src/eval/run.js";

describe("eval harness", () => {
  it("parses args and rejects bad ones", () => {
    expect(parseEvalArgs([])).toEqual({ dataset: "library", provider: "mock", limit: undefined });
    expect(parseEvalArgs(["--dataset", "tmobile", "--limit", "5"])).toMatchObject({ dataset: "tmobile", limit: 5 });
    expect(() => parseEvalArgs(["--dataset", "nope"])).toThrow();
  });

  it("runs the mock agent over a library slice and renders a report", async () => {
    const preds = await runEval(libraryItems(), { provider: "mock", limit: 4 });
    expect(preds).toHaveLength(4);
    const report = buildReport("library", "mock", preds, computeMetrics(preds));
    const md = renderMarkdown(report);
    expect(md).toContain("# Beacon eval: library");
    expect(md).toContain("Confusion matrix");
  });
});
