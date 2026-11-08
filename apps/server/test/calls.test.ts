import { describe, expect, it } from "vitest";
import { TraceEvent, TrustedRecord, type EventDetail } from "@beacon/shared";
import { createApp, ElevenLabsPhotonCallback, type CreateAppOptions } from "../src/index.js";

/** Stands in for Nemotron (tests only — the screener itself has no offline brain). */
function fakeNemotron(replies: object[]) {
  const bodies: string[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body));
    const reply = replies[bodies.length - 1];
    if (!reply) throw new Error("fake Nemotron: script exhausted");
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", ...reply } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { bodies, impl };
}
const say = (o: object) => ({ content: JSON.stringify(o) });
const tool = (name: string, args: object) => ({ content: null, tool_calls: [{ id: `t_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });

const quiet: CreateAppOptions = { log: () => {}, simulatorDelayMs: 5, scriptDelayMs: 1, agentConfig: { verifyTimeoutMs: 2000 } };
const post = (ctx: ReturnType<typeof createApp>, url: string, body: unknown) =>
  ctx.app.request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("trusted registry API (SQLite)", () => {
  it("GET /api/trusted/:number returns ground truth without the code word", async () => {
    const ctx = createApp(quiet);
    const res = await ctx.app.request("/api/trusted/%2B15550100002");
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("maple canoe");
    const record = TrustedRecord.parse(JSON.parse(raw));
    expect(record).toMatchObject({ id: "sam", relationship: "family", callbackNumber: "+15550100002", hasCodeWord: true });
    expect((await ctx.app.request("/api/trusted/5550100099")).status).toBe(404);
  });

  it("finds a contact by who the caller claims to be", async () => {
    const ctx = createApp(quiet);
    const list = (await (await ctx.app.request("/api/trusted?claim=your%20grandson")).json()) as TrustedRecord[];
    expect(list.map((r) => r.id)).toEqual(["sam"]);
  });

  it("subscriber adds a contact with a code word; check-code compares on the server", async () => {
    const ctx = createApp(quiet);
    const created = await post(ctx, "/api/trusted", { name: "Jordan", relationship: "family", number: "+1 (555) 010-0180", codeWord: "Purple Otter" });
    expect(created.status).toBe(201);
    expect(await created.clone().text()).not.toContain("Otter");
    expect(TrustedRecord.parse(await created.json())).toMatchObject({ name: "Jordan", hasCodeWord: true, callbackNumber: "+1 (555) 010-0180" });

    const ok = await (await post(ctx, "/api/trusted/5550100180/check-code", { attempt: "it's purple otter!" })).json();
    const bad = await (await post(ctx, "/api/trusted/5550100180/check-code", { attempt: "blue heron" })).json();
    expect(ok).toEqual({ match: true, hasCodeWord: true });
    expect(bad).toEqual({ match: false, hasCodeWord: true });
    // New contacts are available to the screener immediately.
    expect(ctx.contacts.some((c) => c.name === "Jordan" && c.verifyVia.channel === "call")).toBe(true);
  });

  it("persists across restarts when given a file", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "mg-registry-"));
    const path = join(dir, "registry.sqlite");
    const first = createApp({ ...quiet, registryPath: path });
    await post(first, "/api/trusted", { name: "Jordan", relationship: "friend", number: "+15550100181" });
    first.registry.close();
    const second = createApp({ ...quiet, registryPath: path });
    expect((await second.app.request("/api/trusted/5550100181")).status).toBe(200);
    second.registry.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("calls: sim injection → normalize → screener → verdict", () => {
  it("screens an injected scam call end to end", async () => {
    const nemotron = fakeNemotron([
      tool("lookup_trusted_contact", { claim: "grandson" }),
      tool("scan_risk_patterns", {}),
      say({
        say: "I can't connect this call. Goodbye.",
        action: "end",
        risk: 95,
        signals: [],
        verdict: { verdict: "SCAM", confidence: 93, evidence: ["Claims to be the grandson from an unsaved number.", "Wants gift cards for bail."], next_action: "Blocked." },
      }),
    ]);
    const ctx = createApp({ ...quiet, agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" }, screenerOptions: { fetch: nemotron.impl } });
    const res = await post(ctx, "/api/calls", { from: { handle: "+15550104417", displayName: "Sam" }, firstWords: "Grandma it's me Sam, I'm in jail, I need gift cards for bail, don't tell Mom" });
    expect(res.status).toBe(202);
    const { callId } = (await res.json()) as { callId: string };
    await ctx.idle();

    const detail = (await (await ctx.app.request(`/api/events/${callId}`)).json()) as EventDetail;
    expect(detail.event).toMatchObject({ kind: "call", source: "simulator", from: { handle: "+15550104417" } });
    expect(detail.screening).toMatchObject({ action: "block", decidedBy: "nemotron", claimedContactId: "sam", verdict: { verdict: "SCAM", confidence: 93 } });

    const trace = ctx.bus.replay(0).filter((t) => t.eventId === callId);
    for (const t of trace) TraceEvent.parse(t);
    const types = trace.map((t) => t.type);
    expect(types[0]).toBe("event.received");
    expect(types).toContain("call.turn");
    expect(types).toContain("signal");
    expect(types.at(-1)).toBe("call.verdict");
    expect(ctx.sessions.has(callId)).toBe(false); // session closed, nothing kept
  });

  it("caller speech arrives later via POST /api/calls/:id/say (judge typing)", async () => {
    const nemotron = fakeNemotron([
      say({ say: null, action: "end", risk: 40, signals: [], verdict: { verdict: "SUSPICIOUS", confidence: 70, evidence: ["Won't say who they are."], next_action: "Voicemail." } }),
    ]);
    const ctx = createApp({ ...quiet, agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" }, screenerOptions: { fetch: nemotron.impl, listenTimeoutMs: 2000 } });
    const { callId } = (await (await post(ctx, "/api/calls", { from: { handle: "+15550107000" } })).json()) as { callId: string };
    expect((await post(ctx, `/api/calls/${callId}/say`, { text: "Hello? Who is this? I need to talk to the owner." })).status).toBe(200);
    await ctx.idle();
    expect((await post(ctx, `/api/calls/${callId}/say`, { text: "too late" })).status).toBe(404);
    expect(nemotron.bodies[0]).toContain("I need to talk to the owner");
    expect(ctx.store.detail(callId)?.screening?.verdict.verdict).toBe("SUSPICIOUS");
  });

  it("call scenarios route to the screener; without a key the call is not connected", async () => {
    const ctx = createApp(quiet); // no apiKey
    const res = await ctx.app.request("/api/scenarios/grandson-bail-call/fire", { method: "POST" });
    const { eventId } = (await res.json()) as { eventId: string };
    await ctx.idle();
    const detail = ctx.store.detail(eventId)!;
    expect(detail.event.transcript).toBeUndefined(); // the screener hears the script live, not a pre-baked transcript
    expect(detail.screening).toMatchObject({ decidedBy: "error", action: "voicemail" });
    expect(detail.verdict).toBeUndefined(); // the text pipeline never ran
  });

  it("performs real outbound callback with ElevenLabsPhotonCallback and blocks when contact denies", async () => {
    let capturedTo = "";
    let capturedBody: any = null;

    const fakeElevenLabsFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("outbound-call")) {
        capturedBody = JSON.parse(String(init?.body));
        capturedTo = capturedBody.to_number;
        return new Response(JSON.stringify({ conversation_id: "conv_live_123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("conversations/conv_live_123")) {
        return new Response(
          JSON.stringify({
            status: "done",
            transcript: [
              { role: "agent", message: "Is this you calling about bail?" },
              { role: "user", message: "No, that is NOT me!" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const callbackProvider = new ElevenLabsPhotonCallback({
      apiKey: "xi_test_key",
      agentId: "agent_test_abc",
      phoneNumberId: "phone_test_xyz",
      fetch: fakeElevenLabsFetch,
      pollIntervalMs: 20,
    });

    const nemotron = fakeNemotron([
      tool("lookup_trusted_contact", { claim: "grandson" }),
      tool("request_callback", { contact_ref: "CONTACT_1", question: "Is this you calling about bail?" }),
      { content: '{"status":"denied"}' },
      say({
        say: "I cannot connect you.",
        action: "end",
        risk: 98,
        signals: [],
        verdict: {
          verdict: "SCAM",
          confidence: 96,
          evidence: ["The real grandson answered the callback and denied calling."],
          next_action: "Blocked.",
        },
      }),
    ]);

    const ctx = createApp({
      ...quiet,
      env: { BEACON_VERIFY_SAM: "call:+15550100002" },
      callbackProvider,
      agentConfig: { ...quiet.agentConfig, apiKey: "test-key-not-real" },
      screenerOptions: { fetch: nemotron.impl },
    });

    const res = await post(ctx, "/api/calls", {
      from: { handle: "+15550104417", displayName: "Sam" },
      firstWords: "Grandma, it's Sam, I'm in jail and need bail money",
    });
    expect(res.status).toBe(202);
    const { callId } = (await res.json()) as { callId: string };
    await ctx.idle();

    // Verify ElevenLabs was dialed with Sam's saved registry number
    expect(capturedTo).toBe("+15550100002");
    expect(capturedBody.conversation_initiation_client_data.dynamic_variables.question).toBe("Is this you calling about bail?");

    const detail = ctx.store.detail(callId)!;
    expect(detail.screening).toMatchObject({
      action: "block",
      decidedBy: "nemotron",
      checks: { callback: "denied" },
      verdict: { verdict: "SCAM", confidence: 96 },
    });
  });

  it("rejects bad input", async () => {
    const ctx = createApp(quiet);
    expect((await post(ctx, "/api/calls", { from: {} })).status).toBe(400);
    expect((await post(ctx, "/api/trusted", { name: "x" })).status).toBe(400);
  });
});
