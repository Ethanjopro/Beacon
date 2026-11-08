import { SSE_EVENT_NAME, type TraceEvent } from "@beacon/shared";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { TraceBus } from "./bus.js";

const HEARTBEAT_MS = 15_000;

function parseSeq(value: string | undefined | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** SSE stream of trace events. Replays from `?since=` / `Last-Event-ID`, then goes live. */
export function traceStream(c: Context, bus: TraceBus, heartbeatMs = HEARTBEAT_MS): Response {
  const requested = parseSeq(c.req.query("since") ?? c.req.header("last-event-id"));
  // A cursor from before a server restart is ahead of us: start over rather than miss everything.
  const since = requested > bus.lastSeq ? 0 : requested;
  return streamSSE(c, async (stream) => {
    const send = (e: TraceEvent) => stream.writeSSE({ event: SSE_EVENT_NAME, id: String(e.seq), data: JSON.stringify(e) });
    // Queue live events while replaying so nothing is lost or reordered.
    const queue: TraceEvent[] = [];
    let wake: (() => void) | undefined;
    const unsubscribe = bus.subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    let closed = false;
    stream.onAbort(() => {
      closed = true;
      unsubscribe();
      wake?.();
    });

    let last = since;
    try {
      // Tell the client the stream is open right away (also flushes headers).
      await stream.write(": connected\n\n");
      for (const e of bus.replay(since)) {
        await send(e);
        last = e.seq;
      }
      while (!closed) {
        while (queue.length) {
          const e = queue.shift()!;
          if (e.seq <= last) continue;
          await send(e);
          last = e.seq;
        }
        if (closed) break;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, heartbeatMs);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake = undefined;
        if (!closed && !queue.length) await stream.write(": ping\n\n");
      }
    } finally {
      unsubscribe();
    }
  });
}
