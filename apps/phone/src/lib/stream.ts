import { API, SSE_EVENT_NAME, TraceEvent } from "@beacon/shared";

/**
 * SSE client for `API.stream`. The browser's EventSource reconnects to the
 * SAME url on its own, which would replay from the start; we close it and
 * reopen with `?since=<lastSeq>` ourselves so a dropped connection resumes
 * exactly where it left off.
 */

export type ConnectionStatus = "connecting" | "live" | "down";

/** The slice of the EventSource API we use — lets tests inject a fake. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface TraceStreamOptions {
  onTrace: (event: TraceEvent, meta: { replay: boolean }) => void;
  onStatus?: (status: ConnectionStatus) => void;
  createEventSource?: EventSourceFactory;
  url?: string;
  /** Consecutive failures before we tell the UI the server is down. */
  downAfterFailures?: number;
  /** Backoff for reconnect attempt n (1-based). */
  backoffMs?: (attempt: number) => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export interface TraceStream {
  close(): void;
  /** Highest seq seen so far (resume point), or undefined before the first event. */
  lastSeq(): number | undefined;
  /** Forget the resume point (after a server reset seq numbers can restart). */
  resetCursor(): void;
}

const defaultBackoff = (attempt: number) => Math.min(500 * 2 ** (attempt - 1), 5000);

/** Items stamped this long before the connection opened are history, not live. */
const REPLAY_SLACK_MS = 750;

export function streamUrl(base: string, since: number | undefined): string {
  return since === undefined ? `${base}?since=0` : `${base}?since=${since}`;
}

export function openTraceStream(opts: TraceStreamOptions): TraceStream {
  const create: EventSourceFactory = opts.createEventSource ?? ((url) => new EventSource(url));
  const base = opts.url ?? API.stream;
  const downAfter = opts.downAfterFailures ?? 2;
  const backoff = opts.backoffMs ?? defaultBackoff;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = opts.now ?? Date.now;

  let source: EventSourceLike | undefined;
  let lastSeq: number | undefined;
  let failures = 0;
  let openedAt = now();
  let retryTimer: unknown;
  let closed = false;

  const connect = () => {
    if (closed) return;
    openedAt = now();
    if (failures === 0) opts.onStatus?.("connecting");
    const es = create(streamUrl(base, lastSeq));
    source = es;

    es.onopen = () => {
      failures = 0;
      opts.onStatus?.("live");
    };

    es.addEventListener(SSE_EVENT_NAME, (msg: MessageEvent) => {
      const parsed = safeParse(msg.data);
      if (!parsed) return;
      if (lastSeq === undefined || parsed.seq > lastSeq) lastSeq = parsed.seq;
      const replay = Date.parse(parsed.at) < openedAt - REPLAY_SLACK_MS;
      opts.onTrace(parsed, { replay });
    });

    es.onerror = () => {
      es.close();
      if (closed || source !== es) return;
      failures += 1;
      if (failures >= downAfter) opts.onStatus?.("down");
      retryTimer = setTimer(connect, backoff(failures));
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (retryTimer !== undefined) clearTimer(retryTimer);
      source?.close();
    },
    lastSeq: () => lastSeq,
    resetCursor() {
      lastSeq = undefined;
    },
  };
}

function safeParse(data: unknown): TraceEvent | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const result = TraceEvent.safeParse(JSON.parse(data));
    return result.success ? (result.data as TraceEvent) : undefined;
  } catch {
    return undefined;
  }
}
