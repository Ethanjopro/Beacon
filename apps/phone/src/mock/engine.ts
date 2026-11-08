import type { ScenarioSummary, TraceBody, TraceEvent, VerificationOutcome, VerificationRequest } from "@beacon/shared";
import { resolveBody, type ScriptStep } from "./build";
import { interpretReply } from "./interpret";
import { findMockScenario, MOCK_SCENARIOS, type MockVerification } from "./scenarios";

/**
 * A tiny in-browser stand-in for apps/server in `?mock=1`: fires canned
 * scenarios, stamps trace envelopes, holds pending verifications and lets
 * the demo console answer them. Timers are injectable so tests run instantly.
 */

export interface MockEngineOptions {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => Date;
  /** Let the scripted contact reply on their own (console can still beat them to it). */
  autoReply?: boolean;
}

interface PendingVerification {
  request: VerificationRequest;
  spec: MockVerification;
  autoTimer?: unknown;
}

export class MockEngine {
  autoReply: boolean;
  private seq = 0;
  private counter = 0;
  private readonly timers = new Set<unknown>();
  private readonly pending = new Map<string, PendingVerification>();
  private readonly listeners = new Set<(ev: TraceEvent) => void>();
  private readonly changeListeners = new Set<() => void>();
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => Date;

  constructor(opts: MockEngineOptions = {}) {
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = opts.now ?? (() => new Date());
    this.autoReply = opts.autoReply ?? true;
  }

  /** Trace items as they are emitted. Returns an unsubscribe function. */
  subscribe(listener: (ev: TraceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pending-verification list changed (for the console). */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  scenarios(): ScenarioSummary[] {
    return MOCK_SCENARIOS.map((s) => s.summary);
  }

  fire(scenarioId: string): { eventId: string } {
    const scenario = findMockScenario(scenarioId);
    if (!scenario) throw new Error(`Unknown mock scenario: ${scenarioId}`);
    this.counter += 1;
    const eventId = `evt_mock_${this.counter}_${scenarioId}`;
    const run = scenario.build({ eventId, startedAt: this.now().getTime() });
    this.play(eventId, run.steps, () => {
      if (run.verification) this.requestVerification(eventId, run.verification);
    });
    return { eventId };
  }

  pendingVerifications(): VerificationRequest[] {
    return [...this.pending.values()].map((p) => p.request);
  }

  /** Answer as the trusted contact. First answer wins; later ones are ignored. */
  reply(requestId: string, text: string): VerificationOutcome | undefined {
    const entry = this.pending.get(requestId);
    if (!entry) return undefined;
    this.pending.delete(requestId);
    if (entry.autoTimer !== undefined) this.cancel(entry.autoTimer);

    const status = interpretReply(text);
    const outcome: VerificationOutcome = {
      requestId,
      status,
      replyText: text,
      summary: `${entry.request.contactName} replied: "${text}"`,
      resolvedAt: this.now().toISOString(),
    };
    this.emit(entry.request.eventId, { type: "verification.resolved", outcome });
    this.notifyChange();
    this.play(entry.request.eventId, entry.spec.resolve(outcome));
    return outcome;
  }

  /** Stops everything in flight. Listeners stay subscribed. */
  reset(): void {
    for (const t of this.timers) this.clearTimer(t);
    this.timers.clear();
    this.pending.clear();
    this.notifyChange();
  }

  private requestVerification(eventId: string, spec: MockVerification): void {
    const request = spec.request(this.now().toISOString());
    const entry: PendingVerification = { request, spec };
    this.pending.set(request.id, entry);
    this.emit(eventId, { type: "verification.requested", request });
    this.notifyChange();
    if (this.autoReply && spec.autoReply) {
      const { text, delayMs } = spec.autoReply;
      entry.autoTimer = this.schedule(() => {
        if (this.autoReply) this.reply(request.id, text);
      }, delayMs);
    }
  }

  /** Emit steps one after another, honoring each step's delay. */
  private play(eventId: string, steps: ScriptStep[], done?: () => void): void {
    const next = (i: number) => {
      const step = steps[i];
      if (!step) {
        done?.();
        return;
      }
      const run = () => {
        this.emit(eventId, resolveBody(step, this.now().toISOString()));
        next(i + 1);
      };
      if (step.afterMs <= 0) run();
      else this.schedule(run, step.afterMs);
    };
    next(0);
  }

  private emit(eventId: string, body: TraceBody): void {
    const ev = { ...body, seq: ++this.seq, eventId, at: this.now().toISOString() } as TraceEvent;
    for (const listener of this.listeners) listener(ev);
  }

  private schedule(fn: () => void, ms: number): unknown {
    const handle: unknown = this.setTimer(() => {
      this.timers.delete(handle);
      fn();
    }, ms);
    this.timers.add(handle);
    return handle;
  }

  private cancel(handle: unknown): void {
    this.clearTimer(handle);
    this.timers.delete(handle);
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) listener();
  }
}
