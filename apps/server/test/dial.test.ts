import { describe, expect, it } from "vitest";
import { DialCall, TraceEvent } from "@beacon/shared";
import { createApp, DialManager, type CreateAppOptions } from "../src/index.js";

/** Stands in for Nemotron (tests only). */
function fakeNemotron(replies: object[]) {
  const bodies: string[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body));
    const reply = replies[bodies.length - 1];
    if (!reply) throw new Error("fake Nemotron: script exhausted");
    return new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", ...reply } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { bodies, impl };
}

const say = (o: object) => ({ content: JSON.stringify(o) });
const tool = (name: string, args: object) => ({
  content: null,
  tool_calls: [{ id: `t_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

const quiet: CreateAppOptions = {
  log: () => {},
  simulatorDelayMs: 5,
  scriptDelayMs: 1,
  agentConfig: { verifyTimeoutMs: 2000 },
};

const mockDialConfig = {
  apiKey: "fake-elevenlabs-key",
  agentId: "fake-agent-id",
  phoneNumberId: "fake-phone-id",
  fetch: (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch,
};

describe("live voice dial: POST /api/calls/dial", () => {
  it("rejects numbers not on DIAL_ALLOWLIST with 403", async () => {
    const ctx = createApp({
      ...quiet,
      dialOptions: {
        allowlist: "+15550101111,+15550102222",
      },
    });

    const res = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550109999" }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error).toMatch(/allowlist/i);
  });

  it("enforces DIAL_TOKEN via X-Dial-Token header with 401 when invalid or missing", async () => {
    const ctx = createApp({
      ...quiet,
      dialOptions: {
        allowlist: "+15550101111",
        token: "secret-dial-token-123",
      },
    });

    // Missing token
    const resNoToken = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550101111" }),
    });
    expect(resNoToken.status).toBe(401);

    // Wrong token
    const resBadToken = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Dial-Token": "wrong-token",
      },
      body: JSON.stringify({ number: "+15550101111" }),
    });
    expect(resBadToken.status).toBe(401);

    // Valid token
    const resOk = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Dial-Token": "secret-dial-token-123",
      },
      body: JSON.stringify({ number: "+15550101111" }),
    });
    expect(resOk.status).toBe(202);
  });

  it("limits to a single concurrent active dial session (409)", async () => {
    const nemotron = fakeNemotron([
      say({
        say: "Hello, this is Magenta-Guard. Who is calling?",
        action: "ask",
        risk: 10,
        signals: [],
        verdict: null,
      }),
    ]);

    const ctx = createApp({
      ...quiet,
      agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" },
      screenerOptions: { fetch: nemotron.impl, listenTimeoutMs: 5000 },
      dialOptions: {
        ...mockDialConfig,
        allowlist: "+15550101111,+15550102222",
      },
    });

    const first = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550101111" }),
    });
    expect(first.status).toBe(202);

    const second = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550102222" }),
    });
    expect(second.status).toBe(409);
    const json = (await second.json()) as any;
    expect(json.error).toMatch(/already in progress/i);
  });

  it("protects privacy: real number never appears in trace, store, or response", async () => {
    const outboundCalls: Array<{ url: string; body: any }> = [];
    const fakeFetch: typeof fetch = (async (url: any, init: any) => {
      outboundCalls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    const nemotron = fakeNemotron([
      tool("scan_risk_patterns", {}),
      say({
        say: "Hello, this is Magenta-Guard. What is your name?",
        action: "continue",
        risk: 10,
        signals: [],
        verdict: null,
      }),
    ]);

    const realNumber = "+1 (555) 010-4417";
    const ctx = createApp({
      ...quiet,
      agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" },
      screenerOptions: { fetch: nemotron.impl, listenTimeoutMs: 5000 },
      dialOptions: {
        allowlist: realNumber,
        apiKey: "fake-elevenlabs-key",
        agentId: "fake-agent-id",
        phoneNumberId: "fake-phone-id",
        fetch: fakeFetch,
      },
    });

    const res = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: realNumber, displayName: "Friend" }),
    });

    expect(res.status).toBe(202);
    const { callId } = (await res.json()) as any;
    expect(callId).toMatch(/^evt_/);

    // Wait for the screener to speak and trigger the outbound call
    await new Promise((r) => setTimeout(r, 60));

    // Outbound call to ElevenLabs was placed with real number
    expect(outboundCalls.length).toBe(1);
    expect(outboundCalls[0]!.body.to_number).toBe("+15550104417");
    expect(outboundCalls[0]!.body.conversation_initiation_client_data.dynamic_variables.call_id).toBe(callId);
    // No first_message override: ElevenLabs rejects it unless enabled on the agent, and no call is placed.
    expect(outboundCalls[0]!.body.conversation_initiation_client_data.conversation_config_override).toBeUndefined();
    expect(outboundCalls[0]!.body.conversation_initiation_client_data.dynamic_variables.greeting).toContain(
      "Magenta-Guard",
    );

    // Check privacy in bus trace: real number must NOT appear anywhere in traces
    const traces = ctx.bus.replay(0);
    const traceJson = JSON.stringify(traces);
    expect(traceJson).not.toContain("4417");
    expect(traceJson).not.toContain("+15550104417");

    // Check store: real number must NOT appear in stored event or detail
    const detail = ctx.store.detail(callId);
    expect(detail).toBeDefined();
    expect(detail?.event.from.handle).toMatch(/^\+1555010\d{4}$/);
    expect(detail?.event.from.handle).not.toBe("+15550104417");
    expect(JSON.stringify(detail)).not.toContain("4417");
  });
});

describe("custom LLM: POST /v1/elevenlabs-llm/chat/completions", () => {
  it("enforces ELEVENLABS_CUSTOM_LLM_SECRET bearer authentication with 401", async () => {
    const ctx = createApp({
      ...quiet,
      dialOptions: {
        allowlist: "+15550101111",
        customLlmSecret: "super-secret-custom-llm",
      },
    });

    // No auth
    const resNoAuth = await ctx.app.request("/v1/elevenlabs-llm/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
    });
    expect(resNoAuth.status).toBe(401);

    // Bad auth
    const resBadAuth = await ctx.app.request("/v1/elevenlabs-llm/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
    });
    expect(resBadAuth.status).toBe(401);

    // Correct auth with empty speech returns 200 without error
    const resOk = await ctx.app.request("/v1/elevenlabs-llm/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer super-secret-custom-llm",
      },
      body: JSON.stringify({
        messages: [{ role: "assistant", content: "Greeting" }],
        stream: false,
      }),
    });
    // With no active call and empty user msg, or empty turn
    expect([200, 404]).toContain(resOk.status);
  });

  it("handles conversational turn and streams SSE chunks back from screener", async () => {
    const nemotron = fakeNemotron([
      // First model turn (in response to caller words after AI disclosure)
      tool("scan_risk_patterns", {}),
      say({
        say: "Thank you for letting me know. What is your relationship to the subscriber?",
        action: "continue",
        risk: 15,
        signals: [],
        verdict: null,
      }),
    ]);

    const ctx = createApp({
      ...quiet,
      agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" },
      screenerOptions: { fetch: nemotron.impl, listenTimeoutMs: 5000 },
      dialOptions: {
        ...mockDialConfig,
        allowlist: "+15550105555",
        customLlmSecret: "my-custom-llm-secret",
      },
    });

    // 1. Dial call
    const dialRes = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550105555" }),
    });
    expect(dialRes.status).toBe(202);
    const { callId } = (await dialRes.json()) as any;

    // Wait for disclosure turn to emit and screener to enter listen state
    await new Promise((r) => setTimeout(r, 40));

    // 2. Caller speaks into Custom LLM endpoint
    const llmRes = await ctx.app.request("/v1/elevenlabs-llm/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer my-custom-llm-secret",
      },
      body: JSON.stringify({
        call_id: callId,
        stream: true,
        messages: [
          { role: "assistant", content: "I am an AI call screener. Who is calling?" },
          { role: "user", content: "Hi, this is Jordan, a coworker." },
        ],
      }),
    });

    expect(llmRes.status).toBe(200);
    expect(llmRes.headers.get("content-type")).toContain("text/event-stream");

    const sseText = await llmRes.text();
    expect(sseText).toContain("data: {");
    expect(sseText).toContain("data: [DONE]");
    expect(sseText).toContain("relationship");
  });

  it("streams closing line and end_call tool call upon screener verdict", async () => {
    const nemotron = fakeNemotron([
      // Caller asks for money; screener marks scam and terminates
      tool("scan_risk_patterns", {}),
      say({
        say: "This call has been identified as a scam. Terminating call.",
        action: "end",
        risk: 95,
        signals: [],
        verdict: {
          verdict: "SCAM",
          confidence: 95,
          evidence: ["Urgent wire transfer request"],
          next_action: "Blocking call and alerting subscriber.",
        },
      }),
    ]);

    const ctx = createApp({
      ...quiet,
      agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" },
      screenerOptions: { fetch: nemotron.impl, listenTimeoutMs: 5000 },
      dialOptions: {
        ...mockDialConfig,
        allowlist: "+15550107777",
      },
    });

    const dialRes = await ctx.app.request("/api/calls/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+15550107777" }),
    });
    const { callId } = (await dialRes.json()) as any;

    await new Promise((r) => setTimeout(r, 40));

    const llmRes = await ctx.app.request("/v1/elevenlabs-llm/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        call_id: callId,
        stream: true,
        messages: [{ role: "user", content: "Send me 5000 dollars right now!" }],
      }),
    });

    expect(llmRes.status).toBe(200);
    const sseText = await llmRes.text();

    // Verify end_call tool call chunk is emitted
    expect(sseText).toContain("end_call");
    expect(sseText).toContain("verdict_reached");
    expect(sseText).toContain("data: [DONE]");

    // Verify active dial session was cleared
    expect(ctx.dialManager.hasActive()).toBe(false);
  });
});

describe("DialManager.watchCall", () => {
  it("reports a call the SIP trunk refused, with the reason and no digits", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ status: "failed", metadata: { error: { reason: "dial failed with 403 Forbidden (SIP 403) to +15550100002" } } }), { status: 200 })) as typeof fetch;
    const dm = new DialManager({ apiKey: "k", fetch: fakeFetch, log: () => {} });
    let reason = "";
    await dm.watchCall("conv_1", (r) => (reason = r), { intervalMs: 5, maxMs: 500 });
    expect(reason).toContain("SIP 403");
    expect(reason).not.toContain("0100002");
  });

  it("stops watching once the call is live", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ status: "in-progress" }), { status: 200 })) as typeof fetch;
    const dm = new DialManager({ apiKey: "k", fetch: fakeFetch, log: () => {} });
    let failed = false;
    await dm.watchCall("conv_2", () => (failed = true), { intervalMs: 5, maxMs: 500 });
    expect(failed).toBe(false);
  });
});
