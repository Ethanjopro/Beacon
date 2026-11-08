import { describe, expect, it } from "vitest";
import type { VerificationRequest } from "@beacon/shared";
import { createHmac } from "node:crypto";
import { createApp, ElevenLabsPhotonCallback, verifyElevenLabsSignature, type CreateAppOptions } from "../src/index.js";
import { maskNumbers } from "../src/callback.js";

const sampleRequest: VerificationRequest = {
  id: "ver_test_123",
  eventId: "evt_test_123",
  contactId: "sam",
  contactName: "Sam",
  channel: "call",
  to: "+15550100002",
  question: "Did you just call asking for bail money?",
  claim: "Caller says they are Sam",
  sentAt: new Date().toISOString(),
  timeoutMs: 1000,
};

describe("ElevenLabsPhotonCallback", () => {
  it("resolves unreachable when not fully configured", async () => {
    const callback = new ElevenLabsPhotonCallback({});
    expect(callback.isConfigured()).toBe(false);

    const result = await callback.call(sampleRequest);
    expect(result.status).toBe("unreachable");
    if (result.status === "unreachable") {
      expect(result.detail).toContain("not configured");
    }
  });

  it("initiates an outbound call with correct payload and headers", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ conversation_id: "conv_test_999" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const callback = new ElevenLabsPhotonCallback({
      apiKey: "xi_test_key",
      agentId: "agent_test_abc",
      phoneNumberId: "phone_test_xyz",
      fetch: fakeFetch,
    });
    expect(callback.isConfigured()).toBe(true);

    // Call and verify initiation request
    const promise = callback.call({ ...sampleRequest, timeoutMs: 50 });
    expect(capturedUrl).toContain("sip-trunk/outbound-call");
    expect(capturedHeaders["xi-api-key"]).toBe("xi_test_key");
    expect(capturedBody).toMatchObject({
      agent_id: "agent_test_abc",
      agent_phone_number_id: "phone_test_xyz",
      to_number: "+15550100002",
      conversation_initiation_client_data: {
        dynamic_variables: {
          question: "Did you just call asking for bail money?",
          contact_name: "Sam",
          request_id: "ver_test_123",
        },
      },
    });
    // No first_message override: ElevenLabs rejects overrides that aren't enabled on the agent.
    expect(capturedBody.conversation_initiation_client_data.conversation_config_override).toBeUndefined();

    const result = await promise;
    expect(result.status).toBe("timeout");
  });

  it("resolves with replied status when webhook answers the call", async () => {
    const fakeFetch = (async () => {
      return new Response(JSON.stringify({ conversation_id: "conv_test_111" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const callback = new ElevenLabsPhotonCallback({
      apiKey: "xi_test_key",
      agentId: "agent_test_abc",
      phoneNumberId: "phone_test_xyz",
      fetch: fakeFetch,
    });

    const promise = callback.call(sampleRequest);
    // Simulate webhook arrival
    const resolved = callback.resolvePending("ver_test_123", "No, I'm at work! That's not me.");
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result.status).toBe("replied");
    if (result.status === "replied") {
      expect(result.reply.text).toBe("No, I'm at work! That's not me.");
      expect(result.reply.requestId).toBe("ver_test_123");
    }
  });

  it("falls back to polling transcript when no webhook arrives", async () => {
    let callCount = 0;
    const fakeFetch = (async (url: string | URL | Request) => {
      callCount++;
      const u = String(url);
      if (u.includes("outbound-call")) {
        return new Response(JSON.stringify({ conversation_id: "conv_poll_123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("conversations/conv_poll_123")) {
        return new Response(
          JSON.stringify({
            status: "done",
            transcript: [
              { role: "agent", message: "Did you just call asking for bail money?" },
              { role: "user", message: "No, that's not me at all!" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const callback = new ElevenLabsPhotonCallback({
      apiKey: "xi_test_key",
      agentId: "agent_test_abc",
      phoneNumberId: "phone_test_xyz",
      fetch: fakeFetch,
      pollIntervalMs: 20,
    });

    const result = await callback.call({ ...sampleRequest, timeoutMs: 2000 });
    expect(result.status).toBe("replied");
    if (result.status === "replied") {
      expect(result.reply.text).toBe("No, that's not me at all!");
    }
  });

  it("ends right away when ElevenLabs reports the call failed", async () => {
    const fakeFetch = (async (url: string | URL | Request) =>
      String(url).includes("outbound-call")
        ? new Response(JSON.stringify({ success: true, conversation_id: "conv_fail" }), { status: 200 })
        : new Response(JSON.stringify({ status: "failed" }), { status: 200 })) as typeof fetch;
    const callback = new ElevenLabsPhotonCallback({ apiKey: "k", agentId: "a", phoneNumberId: "p", fetch: fakeFetch, pollIntervalMs: 10, log: () => {} });
    const started = Date.now();
    const result = await callback.call({ ...sampleRequest, timeoutMs: 5000 });
    expect(result.status).toBe("unreachable");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("never logs the dialed number", async () => {
    const lines: string[] = [];
    const fakeFetch = (async () => new Response("bad number +15550100002", { status: 422 })) as typeof fetch;
    const callback = new ElevenLabsPhotonCallback({ apiKey: "k", agentId: "a", phoneNumberId: "p", fetch: fakeFetch, log: (l) => lines.push(l) });
    const result = await callback.call(sampleRequest);
    expect(result.status).toBe("unreachable");
    expect(lines.join(" | ")).not.toContain("0100002");
    expect(maskNumbers("call +1 (555) 010-0002 now")).toBe("call [number] now");
  });

  it("rejects ElevenLabs webhooks when no secret is configured (no forged answers)", async () => {
    const ctx = createApp({ log: () => {}, agentConfig: { verifyTimeoutMs: 2000 } });
    const res = await ctx.app.request("/webhooks/elevenlabs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request_id: "ver_test_123", text: "yes that's me" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts v0 and v1 signature formats and rejects stale ones", () => {
    const body = '{"x":1}';
    const ts = 1_800_000_000;
    const hex = createHmac("sha256", "s3cret").update(`${ts}.${body}`).digest("hex");
    expect(verifyElevenLabsSignature(body, `t=${ts},v0=${hex}`, "s3cret", ts)).toBe(true);
    expect(verifyElevenLabsSignature(body, `t=${ts},v1=${hex}`, "s3cret", ts)).toBe(true);
    expect(verifyElevenLabsSignature(body, `t=${ts},v0=${hex}`, "wrong", ts)).toBe(false);
    expect(verifyElevenLabsSignature(body, `t=${ts},v0=${hex}`, "s3cret", ts + 3600)).toBe(false);
  });

  it("handles a signed POST /webhooks/elevenlabs and resolves the broker", async () => {
    const quiet: CreateAppOptions = {
      log: () => {},
      simulatorDelayMs: 5,
      agentConfig: { verifyTimeoutMs: 2000 },
      elevenlabsWebhookSecret: "whsec_test",
    };
    const ctx = createApp(quiet);

    // Register a pending verification in the broker
    let brokerResult: any = null;
    ctx.broker.verify(sampleRequest).then((r) => {
      brokerResult = r;
    });

    // POST /webhooks/elevenlabs with post_call_transcription format
    const payload = {
      type: "post_call_transcription",
      data: {
        // Where ElevenLabs puts dynamic variables in post-call webhooks.
        conversation_initiation_client_data: { dynamic_variables: { request_id: "ver_test_123" } },
        transcript: [
          { role: "agent", message: "Did you just call asking for bail money?" },
          { role: "user", message: "No, that was not me, do not send money!" },
        ],
      },
    };

    const raw = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_test").update(`${ts}.${raw}`).digest("hex");
    const res = await ctx.app.request("/webhooks/elevenlabs", {
      method: "POST",
      headers: { "content-type": "application/json", "ElevenLabs-Signature": `t=${ts},v0=${sig}` },
      body: raw,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    expect(brokerResult).toMatchObject({
      status: "replied",
      reply: {
        requestId: "ver_test_123",
        text: "No, that was not me, do not send money!",
      },
    });
  });
});
