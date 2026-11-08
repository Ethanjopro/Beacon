import { describe, expect, it, vi } from "vitest";
import type { TraceEvent } from "@beacon/shared";
import { Bridge } from "../src/bridge.js";
import { backoffDelay, ServerClient, ServerUnavailableError } from "../src/server-client.js";
import type { InboundMessage, Transport } from "../src/transport.js";
import { request, verdict } from "./fixtures.js";

const env = { eventId: "ev_1", at: "2026-11-08T10:00:00.000Z" };

function fakeTransport() {
  const sent: Array<[string, string]> = [];
  const t: Transport = {
    name: "fake",
    messages: async function* () {},
    sendTo: async (h, text) => void sent.push([h, text]),
    stop: async () => {},
  };
  return { t, sent };
}

describe("backoffDelay", () => {
  it("grows exponentially and caps", () => {
    expect([0, 1, 2, 3, 10].map((n) => backoffDelay(n))).toEqual([500, 1000, 2000, 4000, 10000]);
  });
});

describe("ServerClient", () => {
  it("wraps connection failures in ServerUnavailableError", async () => {
    const c = new ServerClient("http://x", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    await expect(c.postEvent({ kind: "sms", source: "photon", from: { handle: "a" }, body: "b" })).rejects.toBeInstanceOf(ServerUnavailableError);
  });

  it("streams, reconnects after failure and resumes with ?since", async () => {
    const urls: string[] = [];
    const enc = new TextEncoder();
    const frame = (seq: number) => `event: trace\ndata: ${JSON.stringify({ seq, ...env, type: "thought", text: "hi" })}\n\n`;
    const bodyOf = (chunks: string[]) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          // split mid-frame on purpose
          for (const ch of chunks) c.enqueue(enc.encode(ch));
          c.close();
        },
      });
    let call = 0;
    const abort = new AbortController();
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      call++;
      if (call === 1) return new Response(bodyOf([frame(1).slice(0, 20), frame(1).slice(20), frame(2)]));
      if (call === 2) throw new TypeError("down");
      queueMicrotask(() => abort.abort());
      return new Response(bodyOf([frame(3)]));
    });
    const got: number[] = [];
    await new ServerClient("http://s", fetchMock as unknown as typeof fetch).stream({
      signal: abort.signal,
      onEvent: (e) => got.push(e.seq),
      sleep: async () => {},
    });
    expect(got).toEqual([1, 2, 3]);
    expect(urls[0]).toBe("http://s/api/stream");
    expect(urls[1]).toBe("http://s/api/stream?since=2");
    expect(urls[2]).toBe("http://s/api/stream?since=2");
  });
});

describe("Bridge", () => {
  it("sends verification questions to request.to once, then routes the reply back", async () => {
    const { t, sent } = fakeTransport();
    const server = { postEvent: vi.fn(), postReply: vi.fn(async () => ({})) };
    const b = new Bridge(t, server, () => {});
    const ev: TraceEvent = { seq: 1, ...env, type: "verification.requested", request: request() };
    await b.onTrace(ev);
    await b.onTrace(ev); // replay after reconnect
    expect(sent).toEqual([["+1 (555) 010-0142", expect.stringContaining("Did you just text Sam")]]);

    await b.handleInbound({ senderId: "+15550100142", text: "No, not me", reply: async () => {} });
    expect(server.postReply).toHaveBeenCalledWith("vr_1", { text: "No, not me", from: "+15550100142" });
    expect(b.pendingRequests()).toHaveLength(0);
  });

  it("ignores simulator-channel requests", async () => {
    const { t, sent } = fakeTransport();
    const b = new Bridge(t, { postEvent: vi.fn(), postReply: vi.fn() }, () => {});
    await b.onTrace({ seq: 1, ...env, type: "verification.requested", request: request({ channel: "simulator" }) });
    expect(sent).toHaveLength(0);
  });

  it("replies with a verdict to forwarded events, even if the verdict beats the POST response", async () => {
    const { t } = fakeTransport();
    const replies: string[] = [];
    const msg: InboundMessage = { senderId: "+15551230000", text: "Fwd: Pay now http://x.example. Is this a scam?", reply: async (x) => void replies.push(x) };

    // normal order
    const b = new Bridge(t, { postEvent: vi.fn(async () => ({ eventId: "ev_1" })), postReply: vi.fn() }, () => {});
    await b.handleInbound(msg);
    await b.onTrace({ seq: 2, ...env, type: "verdict", verdict: verdict() });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("SCAM");

    // verdict first
    replies.length = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const b2 = new Bridge(t, { postEvent: vi.fn(async () => (await gate, { eventId: "ev_1" })), postReply: vi.fn() }, () => {});
    const handling = b2.handleInbound(msg);
    await b2.onTrace({ seq: 2, ...env, type: "verdict", verdict: verdict() });
    release();
    await handling;
    expect(replies).toHaveLength(1);
  });

  it("does not reply to non-forwarded photon events", async () => {
    const { t } = fakeTransport();
    const reply = vi.fn(async () => {});
    const b = new Bridge(t, { postEvent: vi.fn(async () => ({ eventId: "ev_9" })), postReply: vi.fn() }, () => {});
    await b.handleInbound({ senderId: "+15559990000", text: "send gift cards", reply });
    await b.onTrace({ seq: 1, ...env, eventId: "ev_9", type: "verdict", verdict: verdict({ eventId: "ev_9" }) });
    expect(reply).not.toHaveBeenCalled();
  });
});
