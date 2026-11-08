import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_CONFIG, type TraceBody } from "@beacon/shared";
import { extractJson, AnalysisOutput } from "../src/llm/schema.js";
import { LlmClient, runToolLoop } from "../src/llm/client.js";
import { SAFE_WORD, harness, makeEvent, stageTrace } from "./helpers.js";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { model: string; messages: { role: string; content: string | null }[]; tools?: unknown[] };
}

type Reply = { content?: string; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] } | { status: number } | "hang";

/** A fake fetch that serves scripted chat-completion replies in order and records every request. */
function fakeFetch(script: Reply[] | ((call: Call) => Reply)) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) };
    calls.push(call);
    const reply = typeof script === "function" ? script(call) : script[calls.length - 1];
    if (!reply) throw new Error("fake fetch: script exhausted");
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    if ("status" in reply) return new Response("upstream error", { status: reply.status });
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, impl };
}

const toolCall = (id: string, name: string, args: object) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

const NVIDIA = { llmProvider: "nvidia" as const, apiKey: "test-key-not-real", baseUrl: "https://nim.example/v1" };

/** Mid-risk, claims to be Mom, contains a callback number AND the family safe word. */
const MID_RISK = `It's Mom, ${SAFE_WORD}. New number! Call me at (555) 010-7777 and send $500 on Zelle right now`;

const finalAnswer = JSON.stringify({
  scamType: "family_emergency",
  claimedContactId: "CONTACT_1",
  claim: "Says it's the user's mother on a new number and wants money.",
  pScam: 0.9,
  signals: [
    { id: "emotional_pressure", title: "Plays on family emotions", detail: "Uses closeness to rush a payment.", weight: 6 },
    { id: "new_number_claim", title: "dup of a triage id", detail: "", weight: 2 },
  ],
});

describe("extractJson", () => {
  it("tolerates <think> blocks, prose and code fences", () => {
    expect(extractJson('<think>let me reason {not json}</think>\nHere you go:\n```json\n{"a": {"b": "}"}}\n```')).toEqual({ a: { b: "}" } });
    expect(extractJson('reasoning... </think> {"x":1}')).toEqual({ x: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("validates the analysis shape and normalises odd values", () => {
    const out = AnalysisOutput.parse({ scamType: "made_up_type", claim: "x", pScam: 85, signals: [] });
    expect(out.scamType).toBe("other");
    expect(out.pScam).toBe(0.85);
    expect(() => AnalysisOutput.parse({ scamType: "romance", pScam: "high" })).toThrow();
  });
});

describe("LlmClient rate limits", () => {
  it("waits and retries a 429, switching to the next key when several are given", async () => {
    const keys: string[] = [];
    let n = 0;
    const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
      keys.push(String((init?.headers as Record<string, string>).authorization));
      if (++n === 1) return new Response("slow down", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const client = new LlmClient({ baseUrl: "https://nim.example/v1", apiKey: "key-a, key-b", fetch: impl, timeoutMs: 5000, deadlineMs: 15000 });
    const reply = await client.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(reply.content).toBe("ok");
    expect(keys).toEqual(["Bearer key-a", "Bearer key-b"]);
  });
});

describe("LlmClient", () => {
  it("retries once after a 5xx and runs the tool loop", async () => {
    const f = fakeFetch([{ status: 503 }, { tool_calls: [toolCall("t1", "echo", { v: 1 })] }, { content: '{"done":true}' }]);
    const client = new LlmClient({ baseUrl: "https://nim.example/v1/", apiKey: "k", fetch: f.impl, timeoutMs: 500, deadlineMs: 2000 });
    const executed: unknown[] = [];
    const out = await runToolLoop(client, { model: "m", messages: [{ role: "user", content: "hi" }], tools: [{}] }, (_n, a) => (executed.push(a), { ok: true }));
    expect(out.content).toBe('{"done":true}');
    expect(executed).toEqual([{ v: 1 }]);
    expect(f.calls).toHaveLength(3);
    expect(f.calls[0]!.url).toBe("https://nim.example/v1/chat/completions");
    expect(f.calls[0]!.headers.authorization).toBe("Bearer k");
    expect(f.calls[2]!.body.messages.at(-1)).toMatchObject({ role: "tool", content: '{"ok":true}' });
  });
});

describe("analyze with Nemotron (fake fetch)", () => {
  it("runs tools, bounds LLM weights, records the cloud call, and never leaks PII or safe words", async () => {
    const f = fakeFetch((call) => {
      if (call.body.model === DEFAULT_AGENT_CONFIG.fastModel) return { content: '{"status":"denied"}' };
      const round = call.body.messages.filter((m) => m.role === "assistant").length;
      return round === 0
        ? { tool_calls: [toolCall("a", "lookup_contact", { query: "CONTACT_1" }), toolCall("b", "search_scam_library", { text: "new number send money" })] }
        : { content: `<think>The sender claims to be mom.</think>\n\`\`\`json\n${finalAnswer}\n\`\`\`` };
    });
    const h = harness({ config: NVIDIA, internals: { fetch: f.impl }, reply: `Hmm? ${SAFE_WORD}?` });
    const v = await h.run(makeEvent(MID_RISK, "+15550107777"));

    // Cloud call happened and is recorded honestly.
    expect(stageTrace(h.trace, "analyze")).toEqual(["started", "completed"]);
    expect(v.privacy.sentToCloud).toBe(true);
    expect(v.privacy.model).toContain(DEFAULT_AGENT_CONFIG.model);
    expect(v.privacy.redactions.phone).toBeGreaterThanOrEqual(1);

    // Tools ran and were traced.
    const tools = h.trace.filter((t): t is Extract<TraceBody, { type: "tool" }> => t.type === "tool");
    expect(tools.map((t) => `${t.name}:${t.status}`)).toEqual(expect.arrayContaining(["lookup_contact:called", "lookup_contact:result", "search_scam_library:result"]));

    // LLM evidence is bounded, labelled, and deduplicated against triage.
    const llm = v.signals.filter((s) => s.source === "llm");
    expect(llm.map((s) => s.id)).toEqual(["llm_emotional_pressure"]);
    expect(llm[0]!.weight).toBeLessThanOrEqual(2.5);

    // Nothing private left the device: not the safe word, not the callback number.
    const sent = JSON.stringify(f.calls.map((c) => c.body));
    expect(sent.toLowerCase()).not.toContain("heron");
    expect(sent).not.toContain("010-7777");
    expect(sent).not.toContain("+15550107777");
    expect(sent).toContain("untrusted");

    // Ambiguous reply went to the fast model (redacted) and was resolved.
    expect(f.calls.some((c) => c.body.model === DEFAULT_AGENT_CONFIG.fastModel)).toBe(true);
    expect(v.verification?.status).toBe("denied");

    // And the safe word appears nowhere the user or a log could see.
    expect(JSON.stringify([h.trace, v]).toLowerCase()).not.toContain("heron");
  });

  it("falls back to the on-device brain after malformed JSON (and its one repair)", async () => {
    const f = fakeFetch(() => ({ content: "<think>hmm</think> I think it is probably a scam!" }));
    const h = harness({ config: NVIDIA, internals: { fetch: f.impl } });
    const v = await h.run(makeEvent("Hi it's Mom, this is my new number. Can you send me $300 tonight?", "+15550107777"));
    expect(f.calls.length).toBe(2); // final answer + one corrective turn
    expect(h.trace.some((t) => t.type === "error" && t.stage === "analyze")).toBe(true);
    expect(h.trace.some((t) => t.type === "thought" && /on-device analysis/.test(t.text))).toBe(true);
    expect(stageTrace(h.trace, "analyze")).toContain("completed");
    expect(v.privacy.sentToCloud).toBe(true); // a request DID leave — say so
    expect(v.signals.every((s) => s.source !== "llm")).toBe(true);
    expect(h.trace.at(-1)?.type).toBe("verdict");
  });

  it("times out, retries once, then falls back — quickly", async () => {
    const f = fakeFetch(() => "hang");
    const h = harness({ config: NVIDIA, internals: { fetch: f.impl, llmTimeoutMs: 30 } });
    const started = Date.now();
    const v = await h.run(makeEvent("Hi it's Mom, this is my new number. Can you send me $300 tonight?", "+15550107777"));
    expect(Date.now() - started).toBeLessThan(1500);
    expect(f.calls).toHaveLength(2);
    expect(h.trace.some((t) => t.type === "error")).toBe(true);
    expect(["scam", "suspicious", "safe"]).toContain(v.label);
    expect(h.trace.at(-1)?.type).toBe("verdict");
  });

  it("never calls the cloud for clearly safe or clear-cut messages", async () => {
    const f = fakeFetch(() => ({ content: "{}" }));
    const safe = harness({ config: NVIDIA, internals: { fetch: f.impl } });
    await safe.run(makeEvent("Are you still coming for dinner Sunday?", "+15550100001"));
    const toll = harness({ config: NVIDIA, internals: { fetch: f.impl } });
    const v = await toll.run(makeEvent("TxTag: You have an unpaid toll balance of $6.85. To avoid a $50 late fee pay within 24 hours: https://txtag-billing.top/pay", "+12345550123"));
    expect(f.calls).toHaveLength(0);
    expect(v.privacy.sentToCloud).toBe(false);
  });
});
