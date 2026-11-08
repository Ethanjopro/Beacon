import type { TraceBody, TraceEvent } from "@beacon/shared";

export type TraceListener = (event: TraceEvent) => void;

const DEFAULT_CAPACITY = 5000;

/** Stamps seq + timestamp onto agent trace bodies, keeps a ring buffer for SSE replay, fans out to subscribers. */
export class TraceBus {
  private seq = 0;
  private buffer: TraceEvent[] = [];
  private listeners = new Set<TraceListener>();

  constructor(
    private readonly capacity = DEFAULT_CAPACITY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Matches `AgentDeps.emit`. Never throws. */
  emit = (eventId: string, body: TraceBody): TraceEvent => {
    const event = { seq: ++this.seq, eventId, at: this.now().toISOString(), ...body } as TraceEvent;
    this.buffer.push(event);
    if (this.buffer.length > this.capacity) this.buffer.splice(0, this.buffer.length - this.capacity);
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // one bad subscriber must not affect the others or the agent
      }
    }
    return event;
  };

  subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Buffered events with seq greater than `since`. */
  replay(since = 0): TraceEvent[] {
    return this.buffer.filter((e) => e.seq > since);
  }

  /** Highest seq handed out so far. */
  get lastSeq(): number {
    return this.seq;
  }

  /** Drops the buffer but keeps seq monotonic so connected clients never see it go backwards. */
  clear(): void {
    this.buffer = [];
  }
}
