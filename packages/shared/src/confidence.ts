import type { VerdictLabel } from "./verdict.js";

/**
 * Shared confidence math so the agent, the eval harness and the UI agree on
 * what a number means. pScam = logistic(priorLogOdds + Σ signal.weight).
 */
export const LABEL_THRESHOLDS = {
  /** pScam at or above this → "scam". */
  scam: 0.8,
  /** pScam at or above this (and below scam) → "suspicious". Below → "safe". */
  suspicious: 0.4,
} as const;

export const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  return Math.log(q / (1 - q));
};

export function labelFor(pScam: number): VerdictLabel {
  if (pScam >= LABEL_THRESHOLDS.scam) return "scam";
  if (pScam >= LABEL_THRESHOLDS.suspicious) return "suspicious";
  return "safe";
}

/** Confidence in the chosen label (not in "scam"). */
export function confidenceFor(label: VerdictLabel, pScam: number): number {
  if (label === "scam") return pScam;
  if (label === "safe") return 1 - pScam;
  // "suspicious" is an honest "we're not sure" — confidence peaks mid-band.
  const mid = (LABEL_THRESHOLDS.scam + LABEL_THRESHOLDS.suspicious) / 2;
  const half = (LABEL_THRESHOLDS.scam - LABEL_THRESHOLDS.suspicious) / 2;
  return Math.max(0.5, 1 - Math.abs(pScam - mid) / (2 * half));
}
