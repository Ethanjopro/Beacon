import type { ScamType, VerdictLabel } from "@beacon/shared";

/** Pure metric math for the eval harness. No I/O so it is easy to unit test. */

export interface Prediction {
  id: string;
  /** Ground truth. */
  truthScam: boolean;
  truthLabel: VerdictLabel;
  truthType: ScamType;
  predLabel: VerdictLabel;
  predType: ScamType;
  pScam: number;
  latencyMs: number;
  sentToCloud: boolean;
}

export interface PRF {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

const div = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function prf(pairs: Array<{ truth: boolean; pred: boolean }>): PRF {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const { truth, pred } of pairs) {
    if (truth && pred) tp++;
    else if (!truth && pred) fp++;
    else if (truth && !pred) fn++;
    else tn++;
  }
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  return { tp, fp, fn, tn, precision, recall, f1: div(2 * precision * recall, precision + recall) };
}

export const accuracy = (preds: Prediction[]): number => div(preds.filter((p) => p.predLabel === p.truthLabel).length, preds.length);

/** Lenient: "suspicious" counts as flagging. Strict: only "scam" does. */
export function scamVsNot(preds: Prediction[], mode: "lenient" | "strict"): PRF {
  return prf(preds.map((p) => ({ truth: p.truthScam, pred: mode === "lenient" ? p.predLabel !== "safe" : p.predLabel === "scam" })));
}

export const LABELS: VerdictLabel[] = ["scam", "suspicious", "safe"];

/** matrix[actual][predicted] = count */
export function confusion3(preds: Prediction[]): Record<VerdictLabel, Record<VerdictLabel, number>> {
  const m = Object.fromEntries(LABELS.map((a) => [a, Object.fromEntries(LABELS.map((b) => [b, 0]))])) as Record<VerdictLabel, Record<VerdictLabel, number>>;
  for (const p of preds) m[p.truthLabel][p.predLabel]++;
  return m;
}

export interface TypeRecall {
  type: ScamType;
  n: number;
  /** Flagged (scam or suspicious) with any type. */
  flagged: number;
  /** Flagged AND the scam type is right. */
  typeCorrect: number;
  recall: number;
  typeRecall: number;
}

/** Per-ScamType recall over truly-scam items. `recall` = flagged; `typeRecall` also needs the right type. */
export function perTypeRecall(preds: Prediction[]): TypeRecall[] {
  const byType = new Map<ScamType, Prediction[]>();
  for (const p of preds) if (p.truthScam) byType.set(p.truthType, [...(byType.get(p.truthType) ?? []), p]);
  return [...byType.entries()]
    .map(([type, ps]) => {
      const flagged = ps.filter((p) => p.predLabel !== "safe").length;
      const typeCorrect = ps.filter((p) => p.predLabel !== "safe" && p.predType === type).length;
      return { type, n: ps.length, flagged, typeCorrect, recall: div(flagged, ps.length), typeRecall: div(typeCorrect, ps.length) };
    })
    .sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  meanPredicted: number;
  observedRate: number;
}

/** Equal-width bins on pScam; last bin includes 1.0. Empty bins are kept (n = 0). */
export function reliability(preds: Array<{ pScam: number; truthScam: boolean }>, bins = 10): CalibrationBin[] {
  const out = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sumP: 0, pos: 0 }));
  for (const p of preds) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p.pScam * bins)));
    const b = out[idx]!;
    b.n++;
    b.sumP += p.pScam;
    if (p.truthScam) b.pos++;
  }
  return out.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanPredicted: div(b.sumP, b.n), observedRate: div(b.pos, b.n) }));
}

/** Expected calibration error: weighted mean |observed − predicted| over bins. */
export function ece(preds: Array<{ pScam: number; truthScam: boolean }>, bins = 10): number {
  const total = preds.length;
  return reliability(preds, bins).reduce((sum, b) => sum + (b.n / total) * Math.abs(b.observedRate - b.meanPredicted), 0) || 0;
}

/** Nearest-rank percentile (q in 0..100). */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((q / 100) * sorted.length));
  return sorted[rank - 1]!;
}

export const onDeviceRate = (preds: Prediction[]): number => div(preds.filter((p) => !p.sentToCloud).length, preds.length);

export interface BaselineComparison {
  n: number;
  beacon: PRF & { accuracy: number };
  baseline: PRF & { accuracy: number };
}

/** Score Beacon (lenient) vs the baseline's boolean predictions on the same items. */
export function compareBaseline(preds: Prediction[], baseline: Map<string, boolean>): BaselineComparison | undefined {
  const rows = preds.filter((p) => baseline.has(p.id));
  if (rows.length === 0) return undefined;
  const acc = (pairs: Array<{ truth: boolean; pred: boolean }>) => div(pairs.filter((x) => x.truth === x.pred).length, pairs.length);
  const b = rows.map((p) => ({ truth: p.truthScam, pred: p.predLabel !== "safe" }));
  const base = rows.map((p) => ({ truth: p.truthScam, pred: baseline.get(p.id)! }));
  return { n: rows.length, beacon: { ...prf(b), accuracy: acc(b) }, baseline: { ...prf(base), accuracy: acc(base) } };
}

export interface EvalMetrics {
  n: number;
  accuracy: number;
  lenient: PRF;
  strict: PRF;
  confusion: Record<VerdictLabel, Record<VerdictLabel, number>>;
  perType: TypeRecall[];
  ece: number;
  reliability: CalibrationBin[];
  latencyP50: number;
  latencyP95: number;
  onDevicePct: number;
}

export function computeMetrics(preds: Prediction[]): EvalMetrics {
  return {
    n: preds.length,
    accuracy: accuracy(preds),
    lenient: scamVsNot(preds, "lenient"),
    strict: scamVsNot(preds, "strict"),
    confusion: confusion3(preds),
    perType: perTypeRecall(preds),
    ece: ece(preds),
    reliability: reliability(preds),
    latencyP50: percentile(preds.map((p) => p.latencyMs), 50),
    latencyP95: percentile(preds.map((p) => p.latencyMs), 95),
    onDevicePct: onDeviceRate(preds) * 100,
  };
}
