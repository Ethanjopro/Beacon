import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@beacon/shared";
import { openTraceStream, type ConnectionStatus, type EventSourceLike } from "../src/lib/stream";
import { ManualClock } from "./helpers";

class FakeEventSource implements EventSourceLike {
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, (ev: MessageEvent) => void>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event("open"));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  send(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

function setup() {
  const clock = new ManualClock();
  const sources: FakeEventSource[] = [];
  const received: { ev: TraceEvent; replay: boolean }[] = [];
  const statuses: ConnectionStatus[] = [];
  const stream = openTraceStream({
    url: "/api/stream",
    createEventSource: (url) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    },
    onTrace: (ev, meta) => received.push({ ev, replay: meta.replay }),
    onStatus: (s) => statuses.push(s),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    backoffMs: () => 1000,
  });
  return { clock, sources, received, statuses, stream };
}

const thought = (seq: number, at: string): TraceEvent => ({ type: "thought", text: `t${seq}`, seq, eventId: "e1", at });

describe("openTraceStream", () => {
  it("parses `trace` events and tracks the last seq", () => {
    const { clock, sources, received, stream } = setup();
    const now = new Date(clock.now()).toISOString();
    sources[0]!.open();
    sources[0]!.send("trace", thought(4, now));
    sources[0]!.send("trace", { nonsense: true });
    expect(received).toHaveLength(1);
    expect(stream.lastSeq()).toBe(4);
  });

  it("reconnects with ?since=<lastSeq> after an error and reports down/live", () => {
    const { clock, sources, statuses } = setup();
    const now = new Date(clock.now()).toISOString();
    expect(sources[0]!.url).toBe("/api/stream?since=0");
    sources[0]!.open();
    sources[0]!.send("trace", thought(7, now));
    sources[0]!.fail();
    expect(sources[0]!.closed).toBe(true);
    clock.advance(1000);
    expect(sources[1]!.url).toBe("/api/stream?since=7");
    sources[1]!.fail();
    expect(statuses).toContain("down");
    clock.advance(1000);
    sources[2]!.open();
    expect(statuses[statuses.length - 1]).toBe("live");
  });

  it("marks items stamped before the connection opened as replay", () => {
    const { clock, sources, received } = setup();
    sources[0]!.open();
    sources[0]!.send("trace", thought(1, new Date(clock.now() - 60_000).toISOString()));
    sources[0]!.send("trace", thought(2, new Date(clock.now()).toISOString()));
    expect(received.map((r) => r.replay)).toEqual([true, false]);
  });

  it("close stops reconnecting", () => {
    const { clock, sources, stream } = setup();
    sources[0]!.fail();
    stream.close();
    clock.advance(10_000);
    expect(sources).toHaveLength(1);
  });
});
