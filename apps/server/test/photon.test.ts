import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { DEFAULT_AGENT_CONFIG } from "@beacon/shared";
import { createApp, type CreateAppOptions } from "../src/index.js";

const TEST_SECRET = "sk_test_photon_secret_123456";
const quiet: CreateAppOptions = {
  log: () => {},
  simulatorDelayMs: 5,
  scriptDelayMs: 1,
  agentConfig: { verifyTimeoutMs: 2000 },
  photonWebhookSecret: TEST_SECRET,
};

function signPayload(rawBody: string, timestampSec: number, secret: string = TEST_SECRET): string {
  return "v0=" + createHmac("sha256", secret).update(`v0:${timestampSec}:${rawBody}`).digest("hex");
}

function samplePayload(senderHandle: string = "+15550104417", text: string = "Grandma it's me Sam"): string {
  return JSON.stringify({
    event: "messages",
    space: { id: "space_test_1" },
    message: {
      id: "msg_test_1",
      content: { type: "text", text },
      sender: { id: senderHandle, displayName: "Sam" },
    },
  });
}

describe("Photon inbound webhook (POST /webhooks/photon)", () => {
  it("rejects request with 400 when signature or timestamp headers are missing", async () => {
    const ctx = createApp(quiet);
    const body = samplePayload();

    // Missing all headers
    const res1 = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res1.status).toBe(400);

    // Missing signature header
    const res2 = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: { "content-type": "application/json", "x-spectrum-timestamp": String(Math.floor(Date.now() / 1000)) },
      body,
    });
    expect(res2.status).toBe(400);

    // Missing timestamp header
    const res3 = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: { "content-type": "application/json", "x-spectrum-signature": "v0=123" },
      body,
    });
    expect(res3.status).toBe(400);
  });

  it("rejects request with 401 when timestamp is older than 5 minutes (stale)", async () => {
    const nowSec = 1700000000;
    const ctx = createApp({ ...quiet, clock: () => new Date(nowSec * 1000) });
    const staleSec = nowSec - 305; // 5 min 5 sec ago
    const body = samplePayload();
    const sig = signPayload(body, staleSec);

    const res = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-spectrum-timestamp": String(staleSec),
        "x-spectrum-signature": sig,
      },
      body,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Stale timestamp");
  });

  it("rejects request with 401 when signature is invalid", async () => {
    const nowSec = 1700000000;
    const ctx = createApp({ ...quiet, clock: () => new Date(nowSec * 1000) });
    const body = samplePayload();
    const badSig = "v0=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    const res = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-spectrum-timestamp": String(nowSec),
        "x-spectrum-signature": badSig,
      },
      body,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid signature");
  });

  it("accepts valid request with 202 and ingests a call", async () => {
    const nowSec = 1700000000;
    const ctx = createApp({ ...quiet, clock: () => new Date(nowSec * 1000) });
    const body = samplePayload("+15550104417", "Grandma, it's me Sam, please help");
    const sig = signPayload(body, nowSec);

    const res = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-spectrum-timestamp": String(nowSec),
        "x-spectrum-signature": sig,
      },
      body,
    });
    expect(res.status).toBe(202);
    const data = (await res.json()) as { ok: boolean; callId: string };
    expect(data.ok).toBe(true);
    expect(typeof data.callId).toBe("string");

    const detail = ctx.store.detail(data.callId);
    expect(detail).toBeDefined();
    expect(detail?.event).toMatchObject({
      kind: "call",
      source: "photon",
      from: { handle: "+15550104417", displayName: "Sam" },
    });
  });

  it("routes subsequent text to active call session when sender handle already has a call live", async () => {
    const nowSec = 1700000000;
    const handle = "+15550104417";
    let resolveListener: ((val: string | null) => void) | undefined;
    let turn2Received: string | null = null;

    const ctx = createApp({
      ...quiet,
      clock: () => new Date(nowSec * 1000),
      screenerFactory: (deps, config) => ({
        config: { ...DEFAULT_AGENT_CONFIG, ...config },
        screen: async (event) => {
          // Turn 1: consumes firstWords ("Grandma, it's Sam") from the queue
          await deps.listen(event.id, 1000);
          // Turn 2: queue is now empty, so listen will wait for next caller speech
          turn2Received = await new Promise<string | null>((resolve) => {
            resolveListener = resolve;
            deps.listen(event.id, 5000).then(resolve);
          });
          return {
            callId: event.id,
            verdict: { verdict: "SCAM", confidence: 90, evidence: [], next_action: "" },
            action: "block",
            checks: { codeWord: "not_checked", callback: "not_placed" },
            decidedBy: "nemotron",
            turns: 2,
            latencyMs: 10,
            decidedAt: new Date().toISOString(),
          };
        },
      }),
    });

    // First call arrives via webhook
    const body1 = samplePayload(handle, "Grandma, it's Sam");
    const sig1 = signPayload(body1, nowSec);
    const res1 = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-spectrum-timestamp": String(nowSec),
        "x-spectrum-signature": sig1,
      },
      body: body1,
    });
    expect(res1.status).toBe(202);
    const { callId } = (await res1.json()) as { ok: boolean; callId: string };
    expect(ctx.sessions.has(callId)).toBe(true);

    // Second message from the SAME caller arrives while call is live
    const body2 = samplePayload(handle, "Are you there? I really need help");
    const sig2 = signPayload(body2, nowSec);
    const res2 = await ctx.app.request("/webhooks/photon", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-spectrum-timestamp": String(nowSec),
        "x-spectrum-signature": sig2,
      },
      body: body2,
    });
    expect(res2.status).toBe(202);
    const data2 = (await res2.json()) as { ok: boolean; callId: string; routed?: string };
    expect(data2.routed).toBe("say");
    expect(data2.callId).toBe(callId);

    // Verify turn 2 received the caller's text
    expect(turn2Received).toBe("Are you there? I really need help");
    resolveListener?.(null);
    await ctx.idle();
  });
});
