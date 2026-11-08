import { SSE_EVENT_NAME, type EventDetail, type PublicContact, type TraceEvent } from "@beacon/shared";
import { trustedContacts } from "@beacon/scenarios";
import { describe, expect, it } from "vitest";
import { createApp, type CreateAppOptions } from "../src/index.js";

const quiet: CreateAppOptions = { log: () => {}, simulatorDelayMs: 5, agentConfig: { verifyTimeoutMs: 2000 } };

async function fire(ctx: ReturnType<typeof createApp>, id: string) {
  const res = await ctx.app.request(`/api/scenarios/${id}/fire`, { method: "POST" });
  expect(res.status).toBe(202);
  const { eventId } = (await res.json()) as { eventId: string };
  await ctx.idle();
  return (await (await ctx.app.request(`/api/events/${eventId}`)).json()) as EventDetail;
}

/** Reads SSE text until `enough` says so (or the stream ends), then aborts. */
async function readSse(ctx: ReturnType<typeof createApp>, url: string, enough: (text: string) => boolean, init?: RequestInit) {
  const ac = new AbortController();
  const res = await ctx.app.request(url, { ...init, signal: ac.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!enough(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  ac.abort();
  await reader.cancel().catch(() => {});
  return { res, text };
}

describe("scenarios", () => {
  it("scam-with-denied-verification: Mom from a new number", async () => {
    const ctx = createApp(quiet);
    const detail = await fire(ctx, "mom-new-number-giftcards");
    expect(detail.verdict?.label).toBe("scam");
    expect(detail.verification?.status).toBe("denied");
    expect(ctx.broker.listPending()).toHaveLength(0);
  });

  it("flags the toll smish and keeps the legit message quiet", async () => {
    const ctx = createApp(quiet);
    expect((await fire(ctx, "toll-smish")).verdict?.label).toBe("scam");
    expect((await fire(ctx, "mom-dinner-legit")).verdict?.label).toBe("safe");
  });

  it("lists scenarios and 404s on unknown ids", async () => {
    const ctx = createApp(quiet);
    const list = (await (await ctx.app.request("/api/scenarios")).json()) as { id: string }[];
    expect(list.map((s) => s.id)).toContain("toll-smish");
    expect((await ctx.app.request("/api/scenarios/nope/fire", { method: "POST" })).status).toBe(404);
  });
});

describe("events api", () => {
  it("accepts a custom event with 202 and validates input", async () => {
    const ctx = createApp(quiet);
    const bad = await ctx.app.request("/api/events", { method: "POST", body: JSON.stringify({ kind: "nope" }), headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBeTruthy();
    const notJson = await ctx.app.request("/api/events", { method: "POST", body: "{{" });
    expect(notJson.status).toBe(400);

    const ok = await ctx.app.request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "sms", source: "simulator", from: { handle: "+15550101234" }, body: "Hello from a friend" }),
    });
    expect(ok.status).toBe(202);
    const { eventId } = (await ok.json()) as { eventId: string };
    expect(eventId).toMatch(/^evt_/);
    await ctx.idle();
    const detail = (await (await ctx.app.request(`/api/events/${eventId}`)).json()) as EventDetail;
    expect(detail.event.receivedAt).toBeTruthy();
    expect(detail.verdict).toBeDefined();
    expect((await ctx.app.request("/api/events/evt_missing")).status).toBe(404);
  });

  it("health reports provider and model", async () => {
    const body = await (await createApp(quiet).app.request("/api/health")).json();
    expect(body).toMatchObject({ ok: true, llmProvider: "mock" });
  });

  it("sends CORS headers", async () => {
    const res = await createApp(quiet).app.request("/api/health", { headers: { origin: "http://localhost:5173" } });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("reset clears state", async () => {
    const ctx = createApp(quiet);
    const detail = await fire(ctx, "toll-smish");
    expect((await ctx.app.request("/api/reset", { method: "POST" })).status).toBe(200);
    expect((await ctx.app.request(`/api/events/${detail.event.id}`)).status).toBe(404);
    expect(ctx.bus.replay(0)).toHaveLength(0);
  });

  it("reset starts a fresh agent so thread memory doesn't leak between demo runs", async () => {
    const ctx = createApp(quiet);
    const before = ctx.agent;
    await ctx.app.request("/api/reset", { method: "POST" });
    expect(ctx.agent).not.toBe(before);
    const again = await fire(ctx, "toll-smish");
    expect(again.verdict?.signals.some((s) => s.id.startsWith("thread_"))).toBe(false);
  });
});

describe("SSE", () => {
  it("streams trace events in the documented format and replays with ?since", async () => {
    const ctx = createApp(quiet);
    await fire(ctx, "toll-smish");
    const total = ctx.bus.replay(0).length;
    expect(total).toBeGreaterThan(3);

    const full = await readSse(ctx, "/api/stream", (t) => t.includes(`id: ${total}\n`));
    expect(full.res.headers.get("content-type")).toContain("text/event-stream");
    expect(full.text).toContain(`event: ${SSE_EVENT_NAME}`);
    expect(full.text).toContain("id: 1\n");
    const firstData = full.text.split("\n").find((l) => l.startsWith("data: "))!;
    const first = JSON.parse(firstData.slice(6)) as TraceEvent;
    expect(first.seq).toBe(1);
    expect(first.type).toBe("event.received");

    const since = 3;
    const replay = await readSse(ctx, `/api/stream?since=${since}`, (t) => t.includes(`id: ${total}\n`));
    expect(replay.text).not.toContain("id: 3\n");
    expect(replay.text).toContain(`id: ${since + 1}\n`);

    const viaHeader = await readSse(ctx, "/api/stream", (t) => t.includes(`id: ${total}\n`), { headers: { "Last-Event-ID": String(total - 1) } });
    expect(viaHeader.text).not.toContain(`id: ${total - 1}\n`);
    expect(viaHeader.text).toContain(`id: ${total}\n`);
  });

  it("delivers live events after connecting and unsubscribes on abort", async () => {
    const ctx = createApp(quiet);
    const pending = readSse(ctx, "/api/stream", (t) => t.includes("event.received"));
    await new Promise((r) => setTimeout(r, 20));
    await ctx.app.request("/api/scenarios/toll-smish/fire", { method: "POST" });
    const { text } = await pending;
    expect(text).toContain("event.received");
    await ctx.idle();
    await new Promise((r) => setTimeout(r, 20));
    // No leaked subscribers beyond the store's own.
    expect((ctx.bus as unknown as { listeners: Set<unknown> }).listeners.size).toBe(1);
  });
});

describe("verification broker", () => {
  const noScript: CreateAppOptions = { ...quiet, scenarios: [] };

  async function startQuestion(ctx: ReturnType<typeof createApp>) {
    // A message that claims to be Mom from an unknown number: the agent asks Mom out-of-band.
    const res = await ctx.app.request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "sms",
        source: "simulator",
        from: { handle: "+15550109999" },
        body: "Hi honey it's Mom, new number. I need you to buy 3 Apple gift cards right now and send me the codes.",
      }),
    });
    const { eventId } = (await res.json()) as { eventId: string };
    for (let i = 0; i < 100 && ctx.broker.listPending().length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    return eventId;
  }

  it("resolves a pending verification from a manual reply", async () => {
    const ctx = createApp({ ...noScript, agentConfig: { verifyTimeoutMs: 5000 } });
    const eventId = await startQuestion(ctx);
    const pending = (await (await ctx.app.request("/api/verifications/pending")).json()) as { id: string; to: string }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]!.to).toBe("+15550100001"); // Mom's known-good handle, not the sender

    const bad = await ctx.app.request(`/api/verifications/${pending[0]!.id}/reply`, { method: "POST", body: JSON.stringify({}) });
    expect(bad.status).toBe(400);
    const res = await ctx.app.request(`/api/verifications/${pending[0]!.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "No, that is not me!" }),
    });
    expect(res.status).toBe(200);
    await ctx.idle();
    const detail = (await (await ctx.app.request(`/api/events/${eventId}`)).json()) as EventDetail;
    expect(detail.verification?.status).toBe("denied");
    expect(detail.verdict?.label).toBe("scam");
    const again = await ctx.app.request(`/api/verifications/${pending[0]!.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "late" }),
    });
    expect(again.status).toBe(404);
  });

  it("times out when nobody answers, and never rejects", async () => {
    const ctx = createApp({ ...noScript, agentConfig: { verifyTimeoutMs: 60 } });
    const eventId = await startQuestion(ctx);
    await ctx.idle();
    const detail = (await (await ctx.app.request(`/api/events/${eventId}`)).json()) as EventDetail;
    expect(detail.verification?.status).toBe("timeout");
    expect(detail.verdict).toBeDefined();
    expect(ctx.broker.listPending()).toHaveLength(0);
  });

  it("reset unblocks waiting agents", async () => {
    const ctx = createApp({ ...noScript, agentConfig: { verifyTimeoutMs: 60_000 } });
    await startQuestion(ctx);
    await ctx.app.request("/api/reset", { method: "POST" });
    await ctx.idle();
    expect(ctx.broker.listPending()).toHaveLength(0);
  });
});

describe("contacts", () => {
  it("never exposes a safe word", async () => {
    const ctx = createApp(quiet);
    const res = await ctx.app.request("/api/contacts");
    const raw = await res.text();
    for (const c of trustedContacts) if (c.safeWord) expect(raw).not.toContain(c.safeWord);
    expect(raw).not.toContain("safeWord");
    const list = JSON.parse(raw) as PublicContact[];
    expect(list.find((c) => c.id === "mom")?.hasSafeWord).toBe(true);
    expect(list.find((c) => c.id === "sam")?.hasSafeWord).toBe(false);
  });

  it("never leaks a safe word through events or the trace", async () => {
    const ctx = createApp(quiet);
    const res = await ctx.app.request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "sms", source: "simulator", from: { handle: "+15550109999" }, body: "the word is blue heron" }),
    });
    const { eventId } = (await res.json()) as { eventId: string };
    await ctx.idle();
    const detail = await (await ctx.app.request(`/api/events/${eventId}`)).text();
    expect(detail).not.toContain("blue heron");
    expect(JSON.stringify(ctx.bus.replay(0))).not.toContain("blue heron");
  });

  it("applies BEACON_VERIFY_<ID> overrides at boot without leaking into the registry", async () => {
    const ctx = createApp({ ...quiet, env: { BEACON_VERIFY_MOM: "imessage:+15551234567", BEACON_VERIFY_SAM: "garbage" } });
    const list = (await (await ctx.app.request("/api/contacts")).json()) as PublicContact[];
    expect(list.find((c) => c.id === "mom")?.verifyVia).toEqual({ channel: "imessage", handle: "+15551234567" });
    expect(list.find((c) => c.id === "sam")?.verifyVia.channel).toBe("simulator");
    expect(trustedContacts.find((c) => c.id === "mom")?.verifyVia.channel).toBe("simulator");
  });
});
