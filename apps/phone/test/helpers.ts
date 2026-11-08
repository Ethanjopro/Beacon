/**
 * A manual clock + timer queue so mock-engine / pacer / stream tests run
 * instantly and deterministically (no fake-timer globals needed).
 */
export class ManualClock {
  private nowMs: number;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();

  constructor(start = Date.parse("2026-11-08T18:00:00.000Z")) {
    this.nowMs = start;
  }

  now = (): number => this.nowMs;
  date = (): Date => new Date(this.nowMs);

  setTimer = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.nowMs + Math.max(0, ms), fn });
    return id;
  };

  clearTimer = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };

  get pendingTimers(): number {
    return this.timers.size;
  }

  /** Advance time, firing due timers in order (including ones they schedule). */
  advance(ms: number): void {
    const target = this.nowMs + ms;
    for (;;) {
      let nextId: number | undefined;
      let nextAt = Infinity;
      for (const [id, t] of this.timers) {
        if (t.at <= target && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId === undefined) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.nowMs = Math.max(this.nowMs, timer.at);
      timer.fn();
    }
    this.nowMs = target;
  }

  /** Run until no timers remain (bounded). */
  runAll(limitMs = 120_000): void {
    this.advance(limitMs);
  }
}
