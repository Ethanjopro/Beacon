import {
  API,
  SSE_EVENT_NAME,
  TraceEvent,
  VerificationRequest,
  type CreatedEvent,
  type NewEvent,
  type ReplyBody,
} from "@beacon/shared";
import { SseParser } from "./sse.js";

export class ServerUnavailableError extends Error {
  constructor(url: string, cause?: unknown) {
    super(`Beacon server not reachable at ${url}${cause instanceof Error ? ` (${cause.message})` : ""}`);
    this.name = "ServerUnavailableError";
  }
}

/** Exponential backoff with a cap: 0.5s, 1s, 2s, 4s, 8s, 10s, 10s… (jitter is added by the caller). */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 10_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
}

export interface StreamOptions {
  signal: AbortSignal;
  /** Resume point: only events with seq greater than this are replayed. */
  since?: number;
  onEvent: (event: TraceEvent) => void;
  /** Friendly status lines ("connected", "retrying in 2s …"). */
  onStatus?: (message: string) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class ServerClient {
  private lastSeq: number | undefined;

  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, init);
    } catch (err) {
      throw new ServerUnavailableError(this.baseUrl, err);
    }
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  postEvent(event: NewEvent): Promise<CreatedEvent> {
    return this.post<CreatedEvent>(API.events, event);
  }

  postReply(requestId: string, body: ReplyBody): Promise<unknown> {
    return this.post(API.verificationReply(requestId), body);
  }

  async getPendingVerifications(): Promise<VerificationRequest[]> {
    const raw = await this.request<unknown[]>(API.pendingVerifications);
    return raw.flatMap((r) => {
      const parsed = VerificationRequest.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }

  /**
   * Subscribe to the trace SSE stream until `signal` aborts. Reconnects with
   * backoff and resumes from the last seen `seq` via `?since=`.
   */
  async stream(opts: StreamOptions): Promise<void> {
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    if (opts.since !== undefined) this.lastSeq = opts.since;
    let attempt = 0;
    while (!opts.signal.aborted) {
      try {
        const qs = this.lastSeq !== undefined ? `?since=${this.lastSeq}` : "";
        const res = await this.fetchImpl(this.baseUrl + API.stream + qs, {
          headers: { accept: "text/event-stream" },
          signal: opts.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        opts.onStatus?.(`connected to ${this.baseUrl}`);
        attempt = 0;
        await this.consume(res.body, opts);
        if (!opts.signal.aborted) opts.onStatus?.("stream closed by server");
      } catch (err) {
        if (opts.signal.aborted) return;
        const wait = backoffDelay(attempt++) + Math.floor(Math.random() * 250);
        const why = err instanceof Error ? err.message : String(err);
        opts.onStatus?.(
          `Beacon server not reachable at ${this.baseUrl} (${why}); retrying in ${(wait / 1000).toFixed(1)}s. ` +
            `Start it with "pnpm dev" if it isn't running.`,
        );
        await sleep(wait);
        continue;
      }
      // Clean close: brief pause so a flapping server doesn't spin us.
      await sleep(backoffDelay(0));
    }
  }

  private async consume(body: ReadableStream<Uint8Array>, opts: StreamOptions): Promise<void> {
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        for (const msg of parser.push(decoder.decode(value, { stream: true }))) {
          if (msg.event !== SSE_EVENT_NAME) continue;
          let json: unknown;
          try {
            json = JSON.parse(msg.data);
          } catch {
            continue;
          }
          const parsed = TraceEvent.safeParse(json);
          if (!parsed.success) continue;
          this.lastSeq = Math.max(this.lastSeq ?? -1, parsed.data.seq);
          opts.onEvent(parsed.data);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
