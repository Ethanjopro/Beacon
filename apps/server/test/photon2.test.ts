import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp, type CreateAppOptions } from "../src/index.js";
import { PhotonSender, parsePhotonEvent, verifyStandardWebhook } from "../src/photon.js";

/** Photon 2.0 / Standard Webhooks test fixtures (synthetic numbers only). */
const SECRET = `whsec_${Buffer.from("test-signing-key-0123456789").toString("base64")}`;
const sign = (id: string, ts: number, body: string) =>
  `v1,${createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;

const inbound = (text: string, overrides: Record<string, unknown> = {}) => ({
  type: "message.received",
  data: {
    id: "msg_1",
    status: "received",
    platform: "imessage",
    content: { type: "text", format: "plain", text },
    sentBy: { kind: "human", handle: "+15550104417", id: "usr_texter", platform: "imessage" },
    receivedBy: { kind: "agent", handle: "+15550109000", id: "usr_line" },
    space: { id: "spc_1", kind: "direct" },
    ...overrides,
  },
});

function fakeNemotron(replies: object[]) {
  let n = 0;
  return (async () => {
    const r = replies[n++] ?? replies[replies.length - 1];
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", ...r } }] }), { status: 200 });
  }) as typeof fetch;
}

function app(sent: { url: string; headers: Record<string, string>; body: any }[]) {
  const photonFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
  }) as typeof fetch;
  const opts: CreateAppOptions = {
    log: () => {},
    photonWebhookSecret: SECRET,
    photonSender: new PhotonSender({ projectId: "pho_prj_test", apiKey: "pho_sk_test", fetch: photonFetch }),
    agentConfig: { apiKey: "test-key-not-real", verifyTimeoutMs: 2000 },
    screenerOptions: {
      listenTimeoutMs: 50,
      recap: false,
      fetch: fakeNemotron([
        { content: JSON.stringify({ say: "Who is this, and what's the emergency?", action: "continue", risk: 60, signals: [] }) },
        { content: JSON.stringify({ say: "I can't connect this.", action: "end", risk: 90, signals: [], verdict: { verdict: "SCAM", confidence: 90, evidence: ["Wants bail money."], next_action: "Blocked." } }) },
      ]),
    },
  };
  return createApp(opts);
}

const post = (ctx: ReturnType<typeof createApp>, body: object, id = "evt_wh_1", ts = Math.floor(Date.now() / 1000), sig?: string) => {
  const raw = JSON.stringify(body);
  return ctx.app.request("/webhooks/photon", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig ?? sign(id, ts, raw) },
    body: raw,
  });
};

describe("Photon 2.0 messaging", () => {
  it("verifies Standard Webhooks signatures", () => {
    const ts = 1_800_000_000;
    expect(verifyStandardWebhook("{}", { id: "a", timestamp: String(ts), signature: sign("a", ts, "{}") }, SECRET, ts)).toBe(true);
    expect(verifyStandardWebhook("{}", { id: "a", timestamp: String(ts), signature: `v1,AAAA ${sign("a", ts, "{}")}` }, SECRET, ts)).toBe(true);
    expect(verifyStandardWebhook("{ }", { id: "a", timestamp: String(ts), signature: sign("a", ts, "{}") }, SECRET, ts)).toBe(false);
    expect(verifyStandardWebhook("{}", { id: "a", timestamp: String(ts), signature: sign("a", ts, "{}") }, SECRET, ts + 600)).toBe(false);
  });

  it("reads an inbound text and ignores our own outbound messages", () => {
    const got = parsePhotonEvent(inbound("hi"));
    expect(got).toMatchObject({ kind: "text", text: "hi", handle: "+15550104417", spaceId: "spc_1", lineUserId: "usr_line", messageId: "msg_1" });
    expect(parsePhotonEvent(inbound("hi", { status: "accepted" })).kind).toBe("ignore");
    expect(parsePhotonEvent(inbound("hi", { sentBy: { kind: "agent", handle: "+15550109000", id: "usr_line" } })).kind).toBe("ignore");
    expect(parsePhotonEvent({ type: "space.typing.update" }).kind).toBe("unknown");
  });

  it("screens a real-shape inbound text and texts Magenta-Guard's lines back into the same conversation", async () => {
    const sent: { url: string; headers: Record<string, string>; body: any }[] = [];
    const ctx = app(sent);
    const res = await post(ctx, inbound("Grandma it's Sam, I'm in jail and need bail money"));
    expect(res.status).toBe(202);
    const { callId } = (await res.json()) as { callId: string };
    await ctx.idle();

    expect(ctx.store.detail(callId)?.event).toMatchObject({ kind: "call", source: "photon" });
    expect(ctx.store.detail(callId)?.screening?.verdict.verdict).toBe("SCAM");
    const texts = sent.map((s) => s.body.content.text);
    expect(texts[0]).toMatch(/AI assistant/); // the disclosure goes out first
    expect(texts).toContain("Who is this, and what's the emergency?");
    expect(sent[0]!.url).toBe("https://api.photon.codes/v1/projects/pho_prj_test/messages");
    expect(sent[0]!.headers.authorization).toBe("Bearer pho_sk_test");
    expect(sent[0]!.body).toMatchObject({ spaceId: "spc_1", senderId: "usr_line", parentMessageId: "msg_1" });
    expect(new Set(sent.map((s) => s.headers["idempotency-key"])).size).toBe(sent.length);
  });

  it("rejects a bad signature (400), ignores our own messages and retried deliveries (204)", async () => {
    const sent: any[] = [];
    const ctx = app(sent);
    expect((await post(ctx, inbound("hi"), "evt_bad", undefined, "v1,AAAA")).status).toBe(400);
    expect((await post(ctx, inbound("hi", { status: "accepted" }), "evt_own")).status).toBe(204);
    expect((await post(ctx, inbound("hello"), "evt_dup")).status).toBe(202);
    expect((await post(ctx, inbound("hello"), "evt_dup")).status).toBe(204);
    await ctx.idle();
  });
});
