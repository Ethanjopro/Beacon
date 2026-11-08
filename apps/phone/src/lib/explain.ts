import { logit, logistic, type Signal } from "@beacon/shared";

/**
 * "Show your work": pScam = logistic(prior + Σ weights). The prior is
 * derived from the agent's own number (logit(pScam) − Σ weights) rather than
 * hardcoded, so the explanation stays right if the agent lane retunes it.
 */
export const DEFAULT_PRIOR = -1.5;

export interface ScoreExplanation {
  prior: number;
  signals: Signal[];
  sum: number;
  logOdds: number;
  pScam: number;
}

export function explainScore(signals: Signal[], pScam?: number): ScoreExplanation {
  const sorted = [...signals].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const sum = sorted.reduce((s, x) => s + x.weight, 0);
  const derived = pScam === undefined ? DEFAULT_PRIOR : logit(pScam) - sum;
  // Rounding in pScam makes the derived prior jitter; snap to one decimal.
  const prior = Math.round(derived * 10) / 10;
  const logOdds = prior + sum;
  return { prior, signals: sorted, sum, logOdds, pScam: pScam ?? logistic(logOdds) };
}
