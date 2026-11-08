import {
  confidenceFor,
  labelFor,
  logistic,
  type PrivacyReport,
  type RecoveryStep,
  type ScamType,
  type Signal,
  type TraceBody,
  type Verdict,
} from "@beacon/shared";

/**
 * Helpers for writing canned traces that look exactly like the agent's:
 * running scores are computed from the signals with the shared confidence
 * math, so every number the UI shows in mock mode is explainable.
 */

/** Same prior the agent uses (docs/ARCHITECTURE.md → Confidence math). */
export const MOCK_PRIOR = -1.5;

export interface ScriptStep {
  /** Delay after the previous step, ms. */
  afterMs: number;
  /** A body, or a function of the emission time (for timestamps like `decidedAt`). */
  body: TraceBody | ((nowIso: string) => TraceBody);
}

export function resolveBody(step: ScriptStep, nowIso: string): TraceBody {
  return typeof step.body === "function" ? step.body(nowIso) : step.body;
}

export class TraceScript {
  readonly steps: ScriptStep[] = [];
  readonly signals: Signal[] = [];

  constructor(readonly prior: number = MOCK_PRIOR) {}

  add(afterMs: number, body: ScriptStep["body"]): this {
    this.steps.push({ afterMs, body });
    return this;
  }

  stage(afterMs: number, stage: Extract<TraceBody, { type: "stage" }>["stage"], status: "started" | "completed" | "skipped", note?: string) {
    return this.add(afterMs, { type: "stage", stage, status, ...(note ? { note } : {}) });
  }

  thought(afterMs: number, text: string) {
    return this.add(afterMs, { type: "thought", text });
  }

  tool(afterMs: number, name: string, status: "called" | "result" | "error", summary: string) {
    return this.add(afterMs, { type: "tool", name, status, summary });
  }

  /** Adds a signal and, shortly after, the running score it produces. */
  signal(afterMs: number, signal: Signal) {
    this.signals.push(signal);
    this.add(afterMs, { type: "signal", signal });
    return this.add(140, { type: "score", pScam: round(this.pScam) });
  }

  get pScam(): number {
    return pScamFor(this.prior, this.signals);
  }
}

export function pScamFor(prior: number, signals: Signal[]): number {
  return logistic(prior + signals.reduce((sum, s) => sum + s.weight, 0));
}

const round = (p: number) => Math.round(p * 1000) / 1000;
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

export interface VerdictInput {
  eventId: string;
  prior: number;
  signals: Signal[];
  scamType: ScamType;
  headline: string;
  /** Half-width of the uncertainty band in log-odds (wider = less sure). */
  bandLogOdds: number;
  recovery: RecoveryStep[];
  privacy: PrivacyReport;
  stagesRun: string[];
  latencyMs: number;
  verification?: Verdict["verification"];
  decidedAt: string;
}

export function buildVerdict(input: VerdictInput): Verdict {
  const logOdds = input.prior + input.signals.reduce((sum, s) => sum + s.weight, 0);
  const pScam = round(logistic(logOdds));
  const label = labelFor(pScam);
  return {
    eventId: input.eventId,
    label,
    pScam,
    confidence: round(confidenceFor(label, pScam)),
    band: [
      round(clamp01(logistic(logOdds - input.bandLogOdds))),
      round(clamp01(logistic(logOdds + input.bandLogOdds))),
    ],
    scamType: input.scamType,
    headline: input.headline,
    signals: [...input.signals].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    ...(input.verification ? { verification: input.verification } : {}),
    recovery: input.recovery,
    privacy: input.privacy,
    stagesRun: input.stagesRun,
    latencyMs: input.latencyMs,
    decidedAt: input.decidedAt,
  };
}

export function totalDelay(steps: ScriptStep[]): number {
  return steps.reduce((sum, s) => sum + s.afterMs, 0);
}
