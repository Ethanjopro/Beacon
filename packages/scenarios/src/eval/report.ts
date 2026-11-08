import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LABELS, type BaselineComparison, type EvalMetrics, type Prediction } from "./metrics.js";

export interface EvalReport {
  dataset: string;
  provider: string;
  generatedAt: string;
  metrics: EvalMetrics;
  baseline?: BaselineComparison;
  /** Items where the prediction differs from the truth label. */
  misses: Array<{ id: string; truth: string; predicted: string; pScam: number; truthType: string; predType: string }>;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(2);

export function buildReport(dataset: string, provider: string, preds: Prediction[], metrics: EvalMetrics, baseline?: BaselineComparison): EvalReport {
  return {
    dataset,
    provider,
    generatedAt: new Date().toISOString(),
    metrics,
    baseline,
    misses: preds
      .filter((p) => p.predLabel !== p.truthLabel)
      .map((p) => ({ id: p.id, truth: p.truthLabel, predicted: p.predLabel, pScam: p.pScam, truthType: p.truthType, predType: p.predType })),
  };
}

const prfRow = (name: string, r: { precision: number; recall: number; f1: number }) => `| ${name} | ${pct(r.precision)} | ${pct(r.recall)} | ${pct(r.f1)} |`;

export function renderMarkdown(r: EvalReport): string {
  const m = r.metrics;
  const out: string[] = [
    `# Beacon eval: ${r.dataset}`,
    "",
    `Provider: \`${r.provider}\` · items: ${m.n} · generated ${r.generatedAt}`,
    "",
    "## Headline",
    `- Accuracy (3-way label): **${pct(m.accuracy)}**`,
    `- Scam recall (suspicious counts as flagged): **${pct(m.lenient.recall)}**, precision ${pct(m.lenient.precision)}`,
    `- Decided without any cloud call: **${m.onDevicePct.toFixed(0)}%**`,
    `- Latency p50 / p95: ${m.latencyP50.toFixed(0)} ms / ${m.latencyP95.toFixed(0)} ms`,
    `- Calibration ECE: ${f2(m.ece)}`,
    "",
    "## Scam vs not",
    "| Variant | Precision | Recall | F1 |",
    "|---|---|---|---|",
    prfRow("Lenient (suspicious = positive)", m.lenient),
    prfRow("Strict (only scam = positive)", m.strict),
    "",
    "## Confusion matrix (rows = truth, cols = predicted)",
    `| | ${LABELS.join(" | ")} |`,
    `|---|${LABELS.map(() => "---").join("|")}|`,
    ...LABELS.map((a) => `| **${a}** | ${LABELS.map((b) => m.confusion[a][b]).join(" | ")} |`),
    "",
    "## Per-scam-type recall",
    "| Type | n | Flagged | Type correct |",
    "|---|---|---|---|",
    ...m.perType.map((t) => `| ${t.type} | ${t.n} | ${pct(t.recall)} | ${pct(t.typeRecall)} |`),
    "",
    "## Reliability (pScam vs observed scam rate)",
    "| Bin | n | Mean pScam | Observed |",
    "|---|---|---|---|",
    ...m.reliability.filter((b) => b.n > 0).map((b) => `| ${f2(b.lo)}-${f2(b.hi)} | ${b.n} | ${f2(b.meanPredicted)} | ${f2(b.observedRate)} |`),
    "",
  ];
  if (r.baseline) {
    const b = r.baseline;
    out.push(
      `## Baseline comparison (${b.n} items)`,
      "| System | Accuracy | Precision | Recall | F1 |",
      "|---|---|---|---|---|",
      `| Beacon | ${pct(b.beacon.accuracy)} | ${pct(b.beacon.precision)} | ${pct(b.beacon.recall)} | ${pct(b.beacon.f1)} |`,
      `| T-Mobile baseline | ${pct(b.baseline.accuracy)} | ${pct(b.baseline.precision)} | ${pct(b.baseline.recall)} | ${pct(b.baseline.f1)} |`,
      "",
    );
  }
  out.push("## Misses");
  out.push(r.misses.length === 0 ? "None." : "| Item | Truth | Predicted | pScam |\n|---|---|---|---|");
  for (const x of r.misses) out.push(`| ${x.id} | ${x.truth} (${x.truthType}) | ${x.predicted} (${x.predType}) | ${f2(x.pScam)} |`);
  return out.join("\n") + "\n";
}

/** Compact console summary for the terminal. */
export function renderConsole(r: EvalReport): string {
  const m = r.metrics;
  const lines = [
    `dataset=${r.dataset} provider=${r.provider} n=${m.n}`,
    `accuracy        ${pct(m.accuracy)}`,
    `recall (lenient) ${pct(m.lenient.recall)}   precision ${pct(m.lenient.precision)}   F1 ${pct(m.lenient.f1)}`,
    `recall (strict)  ${pct(m.strict.recall)}   precision ${pct(m.strict.precision)}   F1 ${pct(m.strict.f1)}`,
    `ECE ${f2(m.ece)}   latency p50 ${m.latencyP50.toFixed(0)}ms p95 ${m.latencyP95.toFixed(0)}ms   on-device ${m.onDevicePct.toFixed(0)}%`,
    "confusion (truth→pred)        scam  susp  safe",
    ...LABELS.map((a) => `  ${a.padEnd(12)}              ${LABELS.map((b) => String(m.confusion[a][b]).padStart(5)).join(" ")}`),
  ];
  if (r.baseline) lines.push(`baseline: beacon acc ${pct(r.baseline.beacon.accuracy)} vs T-Mobile ${pct(r.baseline.baseline.accuracy)} (n=${r.baseline.n})`);
  if (r.misses.length) lines.push(`misses: ${r.misses.map((x) => `${x.id}(${x.truth}→${x.predicted})`).join(", ")}`);
  return lines.join("\n");
}

export function writeReport(reportsDir: string, r: EvalReport): { md: string; json: string } {
  mkdirSync(reportsDir, { recursive: true });
  const md = resolve(reportsDir, `eval-${r.dataset}.md`);
  const json = resolve(reportsDir, `eval-${r.dataset}.json`);
  writeFileSync(md, renderMarkdown(r));
  writeFileSync(json, JSON.stringify(r, null, 2));
  return { md, json };
}
