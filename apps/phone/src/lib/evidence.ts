import type { Signal } from "@beacon/shared";

/** Split text into plain and evidence ranges (first match of each signal's `evidence`). */
export function evidenceRanges(text: string, signals: Signal[]): { start: number; end: number; signal: Signal }[] {
  const lower = text.toLowerCase();
  const ranges: { start: number; end: number; signal: Signal }[] = [];
  for (const s of signals) {
    if (!s.evidence || s.weight <= 0) continue;
    const start = lower.indexOf(s.evidence.toLowerCase());
    if (start < 0) continue;
    const end = start + s.evidence.length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue; // no overlaps
    ranges.push({ start, end, signal: s });
  }
  return ranges.sort((a, b) => a.start - b.start);
}
