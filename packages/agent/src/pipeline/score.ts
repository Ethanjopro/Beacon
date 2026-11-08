/**
 * Confidence math. pScam = logistic(PRIOR + Σ signal.weight) — every point of
 * the score is a named Signal the user can see ("show your work").
 */
import { logistic, logit, type Signal, type VerificationStatus } from "@beacon/shared";

/** Base rate in log-odds: most messages are not scams (p ≈ 0.18). */
export const PRIOR_LOG_ODDS = -1.5;
/** One model opinion can't dominate: each LLM signal and the LLM total are capped. */
export const LLM_WEIGHT_CAP = 2.5;

export class Evidence {
  private readonly items: Signal[] = [];

  /** Returns false if a signal with the same id is already counted (no double counting). */
  add(signal: Signal): boolean {
    if (this.items.some((s) => s.id === signal.id)) return false;
    this.items.push(signal);
    return true;
  }

  has(id: string): boolean {
    return this.items.some((s) => s.id === id);
  }

  get signals(): readonly Signal[] {
    return this.items;
  }

  logOdds(): number {
    return PRIOR_LOG_ODDS + this.items.reduce((sum, s) => sum + s.weight, 0);
  }

  pScam(): number {
    return logistic(this.logOdds());
  }

  /** Sorted by |weight| descending, as the Verdict contract requires. */
  sorted(): Signal[] {
    return [...this.items].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Clamp each LLM signal to ±cap, then scale the set so the LLM's total
 * contribution is also within ±cap. Weights stay exact, so the shown weights
 * still add up to the score.
 */
export function boundLlmWeights<T extends { weight: number }>(signals: T[], cap = LLM_WEIGHT_CAP): T[] {
  const clamped = signals.map((s) => ({ ...s, weight: Math.max(-cap, Math.min(cap, s.weight)) }));
  const total = clamped.reduce((sum, s) => sum + s.weight, 0);
  const scale = Math.abs(total) > cap ? cap / Math.abs(total) : 1;
  return clamped.map((s) => ({ ...s, weight: round2(s.weight * scale) }));
}

export interface BandInputs {
  logOdds: number;
  signalCount: number;
  /** A trusted contact was claimed, so verification mattered. */
  claimed: boolean;
  verification?: VerificationStatus;
  /** The LLM's own pScam, if it gave one — disagreement widens the band. */
  llmPScam?: number;
}

/**
 * Honest-uncertainty band, computed in log-odds space (so it narrows naturally
 * near 0 and 1). It widens when evidence is thin, when verification was needed
 * but missing, and when the model disagrees with the fused score.
 */
export function bandFor(input: BandInputs): [number, number] {
  let half = 0.5;
  if (input.signalCount < 2) half += 0.3;
  if (input.claimed) {
    if (input.verification === "denied" || input.verification === "confirmed") half -= 0.2;
    else half += 0.7; // the one check that would settle it didn't happen
  }
  if (input.llmPScam !== undefined) {
    half += Math.min(1.0, Math.abs(logit(input.llmPScam) - input.logOdds) * 0.25);
  }
  const p = logistic(input.logOdds);
  // Rounding must never push the band off the point estimate.
  const lo = Math.min(round3(logistic(input.logOdds - half)), p);
  const hi = Math.max(round3(logistic(input.logOdds + half)), p);
  return [lo, hi];
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
