/**
 * Releases items one at a time with a readable stagger, so a pipeline that
 * finishes in 40 ms still tells its story on stage. It never holds the final
 * state hostage: the stagger shrinks as the queue grows so the whole backlog
 * drains within `maxLagMs`, and `immediate` items (history replayed on
 * reconnect) or a hidden tab flush everything at once.
 */

export interface PacerOptions {
  staggerMs?: number;
  minStaggerMs?: number;
  maxLagMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  isHidden?: () => boolean;
  now?: () => number;
}

export class Pacer<T> {
  private queue: T[] = [];
  private timer: unknown;
  private readonly stagger: number;
  private readonly minStagger: number;
  private readonly maxLag: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly isHidden: () => boolean;
  private readonly now: () => number;
  /** Everything queued so far should be out by this time. */
  private deadline = 0;

  constructor(
    private readonly release: (item: T) => void,
    opts: PacerOptions = {},
  ) {
    this.stagger = opts.staggerMs ?? 320;
    this.minStagger = opts.minStaggerMs ?? 60;
    this.maxLag = opts.maxLagMs ?? 2500;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.isHidden = opts.isHidden ?? (() => typeof document !== "undefined" && document.hidden);
    this.now = opts.now ?? Date.now;
  }

  push(item: T, { immediate = false }: { immediate?: boolean } = {}): void {
    if (immediate || this.isHidden()) {
      this.flush();
      this.release(item);
      return;
    }
    this.queue.push(item);
    this.deadline = this.now() + this.maxLag;
    if (this.timer === undefined) this.tick();
  }

  /** Release everything queued right now, in order. */
  flush(): void {
    this.cancelTimer();
    const items = this.queue;
    this.queue = [];
    for (const item of items) this.release(item);
  }

  /** Drop everything queued (e.g. on demo reset). */
  clear(): void {
    this.cancelTimer();
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Delay before the next release, shrinking so the backlog drains by the deadline. */
  currentDelay(): number {
    if (this.queue.length === 0) return this.stagger;
    const budget = (this.deadline - this.now()) / this.queue.length;
    return Math.max(this.minStagger, Math.min(this.stagger, budget));
  }

  private tick = (): void => {
    this.timer = undefined;
    const next = this.queue.shift();
    if (next === undefined) return;
    this.release(next);
    if (this.queue.length > 0) this.timer = this.setTimer(this.tick, this.currentDelay());
    else this.timer = this.setTimer(() => this.idle(), this.stagger);
  };

  /** Keeps the stagger between a release and the next push that arrives soon after. */
  private idle(): void {
    this.timer = undefined;
    if (this.queue.length > 0) this.tick();
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }
}
