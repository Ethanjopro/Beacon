import { getScenario, listScenarios, scenarios as allScenarios, scenarioToEvent, trustedContacts } from "@beacon/scenarios";
import { createAgent, createScreener, scrubSafeWords, type ScreenerOptions } from "@beacon/agent";
import {
  API,
  CallerSays,
  CodeWordCheck,
  DEFAULT_AGENT_CONFIG,
  DialCall,
  NewCall,
  NewEvent,
  NewTrustedContact,
  ReplyBody,
  type Agent,
  type AgentConfig,
  type HealthResponse,
  type IncomingEvent,
  type Scenario,
  type Screener,
  type ScreenerDeps,
  type TrustedContact,
} from "@beacon/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ZodType } from "zod";
import { TraceBus } from "./bus.js";
import { ElevenLabsPhotonCallback, type CallbackProvider } from "./callback.js";
import { CallSessions } from "./calls.js";
import { applyVerifyOverrides, toPublicContact } from "./contacts.js";
import {
  DialManager,
  sseContentChunk,
  sseEndCallChunk,
  sseFinishChunk,
  SSE_DONE,
  type DialManagerOptions,
} from "./dial.js";
import {
  normalizeEventCall,
  normalizeHandle,
  normalizePhotonWebhook,
  normalizeScenarioCall,
  normalizeSimCall,
  type NormalizedCall,
} from "./normalize.js";
import { TrustedRegistry, toRecord } from "./registry.js";
import { traceStream } from "./sse.js";
import { Store } from "./store.js";
import { VerificationBroker } from "./verify.js";

export const SERVER_VERSION = "0.1.0";

export interface CreateAppOptions {
  agentConfig?: Partial<AgentConfig>;
  /** Seed for the trusted registry when it's empty. Defaults to the scenarios package contacts. Env overrides apply on top. */
  contacts?: TrustedContact[];
  /** SQLite file for the trusted registry. Defaults to ":memory:" (tests); main.ts passes a file. */
  registryPath?: string;
  /** Call screener knobs (subscriber name, turn limits, test fetch). */
  screenerOptions?: ScreenerOptions;
  /** Swap the screener (tests). */
  screenerFactory?: (deps: ScreenerDeps, config: Partial<AgentConfig>) => Screener;
  /** Pause before each scripted caller line in sim calls. Tests use ~0. */
  scriptDelayMs?: number;
  scenarios?: Scenario[];
  /** Used for BEACON_VERIFY_<ID> overrides. Defaults to {} (main.ts passes process.env). */
  env?: Record<string, string | undefined>;
  /** Overrides the scripted simulator reply delay (tests). */
  simulatorDelayMs?: number;
  /** Secret for verifying Photon webhooks (X-Spectrum-Signature). */
  photonWebhookSecret?: string;
  /** Secret for verifying ElevenLabs webhooks (ElevenLabs-Signature). */
  elevenlabsWebhookSecret?: string;
  /** Outbound phone call provider when request.channel === "call". */
  callbackProvider?: CallbackProvider;
  /** Live voice dial manager. */
  dialManager?: DialManager;
  dialOptions?: DialManagerOptions;
  /** Swap the agent (tests). */
  agentFactory?: (deps: Parameters<typeof createAgent>[0], config: Partial<AgentConfig>) => Agent;
  clock?: () => Date;
  sseHeartbeatMs?: number;
  /** Called with agent failures and per-event timing. Defaults to console. */
  log?: (line: string) => void;
}

const newEventId = () => `evt_${randomBytes(5).toString("hex")}`;

/** Verifies Photon Spectrum HMAC-SHA256 signature (X-Spectrum-Signature = v0=<hex>). */
export function verifySpectrumSignature(
  rawBody: string,
  sigHeader: string,
  tsHeader: string,
  secret: string,
): boolean {
  if (!sigHeader.startsWith("v0=")) return false;
  const receivedHex = sigHeader.slice(3);
  const payload = `v0:${tsHeader}:${rawBody}`;
  const computedHex = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(receivedHex, "hex");
  const b = Buffer.from(computedHex, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifies an ElevenLabs webhook HMAC-SHA256 signature. Their public docs don't spell out the
 * header format, so this accepts "t=<ts>,v0=<hex>" or "t=<ts>,v1=<hex>" (HMAC of "<ts>.<body>")
 * and a bare hex HMAC of the body. A timestamp older than 30 minutes is rejected (replay).
 * If a real webhook gets 401, compare with their SDK's constructEvent.
 */
export function verifyElevenLabsSignature(
  rawBody: string,
  sigHeader: string | undefined,
  secret: string,
  nowSec?: number,
): boolean {
  if (!sigHeader || !secret) return false;
  let signature = sigHeader.trim();
  let timestamp: string | undefined;
  const tMatch = sigHeader.match(/t=(\d+)/);
  const vMatch = sigHeader.match(/v[01]=([a-f0-9]+)/i);
  if (vMatch) {
    signature = vMatch[1] ?? "";
    timestamp = tMatch ? tMatch[1] : undefined;
  }
  if (timestamp && nowSec !== undefined && Math.abs(nowSec - Number(timestamp)) > 30 * 60) return false;
  const candidates: string[] = [];
  if (timestamp) {
    candidates.push(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  }
  candidates.push(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const b = Buffer.from(signature, "hex");
  for (const cand of candidates) {
    const a = Buffer.from(cand, "hex");
    if (a.length === b.length && a.length > 0 && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Parses a JSON body with zod; throws a 400-mapped error on failure. */
class BadRequest extends Error {
  constructor(message: string, readonly issues?: unknown) {
    super(message);
  }
}
async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new BadRequest("Body must be valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new BadRequest("Invalid request body", parsed.error.issues);
  return parsed.data;
}

export function createApp(options: CreateAppOptions = {}) {
  const clock = options.clock ?? (() => new Date());
  const log = options.log ?? ((line: string) => console.log(`[beacon] ${line}`));
  const scenarioList = options.scenarios ?? allScenarios;
  const registry = new TrustedRegistry(options.registryPath ?? ":memory:", options.contacts ?? trustedContacts);
  /** Registry + live-demo overrides, read fresh so contacts added during the demo count immediately. */
  const contacts = () => applyVerifyOverrides(registry.all(), options.env ?? {});
  const agentConfig: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...options.agentConfig };

  const callbackProvider =
    options.callbackProvider ??
    (options.env?.ELEVENLABS_API_KEY && options.env?.ELEVENLABS_AGENT_ID && options.env?.ELEVENLABS_PHONE_NUMBER_ID
      ? new ElevenLabsPhotonCallback({
          apiKey: options.env.ELEVENLABS_API_KEY,
          agentId: options.env.ELEVENLABS_AGENT_ID,
          phoneNumberId: options.env.ELEVENLABS_PHONE_NUMBER_ID,
          outboundUrl:
            options.env.ELEVENLABS_OUTBOUND_URL ||
            (options.env.ELEVENLABS_TELEPHONY_PROVIDER === "twilio"
              ? "https://api.elevenlabs.io/v1/convai/twilio/outbound-call"
              : "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call"),
          now: clock,
        })
      : undefined);

  const dialManager =
    options.dialManager ??
    new DialManager({
      allowlist: options.dialOptions?.allowlist ?? options.env?.DIAL_ALLOWLIST,
      token: options.dialOptions?.token ?? options.env?.DIAL_TOKEN,
      agentId: options.dialOptions?.agentId ?? options.env?.ELEVENLABS_DIAL_AGENT_ID,
      phoneNumberId: options.dialOptions?.phoneNumberId ?? options.env?.ELEVENLABS_PHONE_NUMBER_ID,
      apiKey: options.dialOptions?.apiKey ?? options.env?.ELEVENLABS_API_KEY,
      outboundUrl: options.dialOptions?.outboundUrl ?? options.env?.ELEVENLABS_OUTBOUND_URL,
      customLlmSecret: options.dialOptions?.customLlmSecret ?? options.env?.ELEVENLABS_CUSTOM_LLM_SECRET,
      fetch: options.dialOptions?.fetch,
      log,
    });

  const bus = new TraceBus(undefined, clock);
  const store = new Store();
  bus.subscribe((trace) => store.record(trace));
  const broker = new VerificationBroker({
    scenarioForEvent: (eventId) => {
      const scenarioId = store.getEvent(eventId)?.scenarioId;
      return scenarioId ? scenarioList.find((s) => s.id === scenarioId) : undefined;
    },
    simulatorDelayMs: options.simulatorDelayMs,
    now: clock,
    callbackProvider,
  });
  const deps = { contacts, verify: broker.verify, emit: bus.emit, now: clock };
  const makeAgent = () => (options.agentFactory ? options.agentFactory(deps, agentConfig) : createAgent(deps, agentConfig));
  // `let`: reset swaps in a fresh agent so per-thread memory from earlier demo runs doesn't leak.
  let agent = makeAgent();

  const sessions = new CallSessions({ scriptDelayMs: options.scriptDelayMs });
  const screenerDeps: ScreenerDeps = { contacts, listen: sessions.listen, verify: broker.verify, emit: bus.emit, now: clock };
  const screener = options.screenerFactory ? options.screenerFactory(screenerDeps, agentConfig) : createScreener(screenerDeps, agentConfig, options.screenerOptions);

  /** Resolves when the agent finished; used by tests to await without polling. */
  const inflight = new Set<Promise<unknown>>();

  /** A call: answer it with the screener (never the text pipeline). */
  function ingestCall(normalized: NormalizedCall): string {
    const input = normalized.event;
    const event: IncomingEvent = { ...input, id: input.id ?? newEventId(), body: "", transcript: undefined, receivedAt: input.receivedAt ?? clock().toISOString() };
    store.putEvent(event);
    bus.emit(event.id, { type: "event.received", event });
    sessions.open(event.id, { handle: normalized.event.from.handle, firstWords: normalized.firstWords, script: normalized.script });
    const started = Date.now();
    const job = screener
      .screen(event)
      .then((r) => log(`${event.id} call ${r.verdict.verdict} ${r.verdict.confidence}% → ${r.action} (${r.decidedBy}) in ${Date.now() - started}ms`))
      .catch((err) => {
        log(`${event.id} screener failed: ${err instanceof Error ? err.message : String(err)}`);
        bus.emit(event.id, { type: "error", message: "Magenta-Guard hit an internal error" });
      })
      .finally(() => {
        sessions.close(event.id);
        dialManager.clearActive(event.id);
        inflight.delete(job);
      });
    inflight.add(job);
    return event.id;
  }

  /** Stores the event, announces it, and runs the agent in the background. */
  function ingest(input: NewEvent): string {
    if (input.kind === "call") return ingestCall(normalizeEventCall(input));
    const event: IncomingEvent = { ...input, id: input.id ?? newEventId(), body: input.body ?? "", receivedAt: input.receivedAt ?? clock().toISOString() };
    // The agent sees the raw event; the store and trace never carry a safe word.
    const shown = { ...event, body: scrubSafeWords(event.body, contacts()).text };
    store.putEvent(shown);
    bus.emit(event.id, { type: "event.received", event: shown });
    const started = Date.now();
    const job = agent
      .run(event)
      .then((v) => log(`${event.id} ${v.label} p=${v.pScam.toFixed(2)} in ${Date.now() - started}ms`))
      .catch((err) => {
        log(`${event.id} agent failed: ${err instanceof Error ? err.message : String(err)}`);
        bus.emit(event.id, { type: "error", message: "Beacon hit an internal error" });
      })
      .finally(() => inflight.delete(job));
    inflight.add(job);
    return event.id;
  }

  const app = new Hono();
  app.use("*", cors());
  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message, issues: err.issues }, 400);
    log(`unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.get(API.health, (c) => {
    const body: HealthResponse = { ok: true, llmProvider: agent.config.llmProvider, model: agent.config.model, version: SERVER_VERSION };
    return c.json(body);
  });

  app.post(API.events, async (c) => {
    const input = await parseBody(c.req.raw, NewEvent);
    return c.json({ eventId: ingest(input) }, 202);
  });
  app.get("/api/events/:id", (c) => {
    const detail = store.detail(c.req.param("id"));
    return detail ? c.json(detail) : c.json({ error: "Unknown event" }, 404);
  });

  app.get(API.stream, (c) => traceStream(c, bus, options.sseHeartbeatMs));

  app.get(API.contacts, (c) => c.json(contacts().map(toPublicContact)));

  app.get(API.scenarios, (c) => c.json(options.scenarios ? scenarioList.map(summarize) : listScenarios()));
  app.post("/api/scenarios/:id/fire", (c) => {
    const scenario = options.scenarios ? scenarioList.find((s) => s.id === c.req.param("id")) : getScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "Unknown scenario" }, 404);
    const eventId = scenario.event.kind === "call" ? ingestCall(normalizeScenarioCall(scenario)) : ingest(scenarioToEvent(scenario));
    return c.json({ eventId }, 202);
  });

  // ── Calls (Magenta-Guard): sim injection → normalize → screener ──
  app.post(API.calls, async (c) => {
    const input = await parseBody(c.req.raw, NewCall);
    return c.json({ callId: ingestCall(normalizeSimCall(input)) }, 202);
  });
  app.post("/api/calls/:id/say", async (c) => {
    const { text } = await parseBody(c.req.raw, CallerSays);
    if (!sessions.say(c.req.param("id"), text)) return c.json({ error: "No live call with that id" }, 404);
    return c.json({ ok: true });
  });

  // ── Live Voice Dial: dial friend via ElevenLabs over Photon SIP trunk ──
  app.post(API.callsDial, async (c) => {
    // 1. Check DIAL_TOKEN if configured
    const providedToken = c.req.header("X-Dial-Token") ?? c.req.header("x-dial-token");
    if (!dialManager.isTokenValid(providedToken)) {
      return c.json({ error: "Unauthorized: invalid or missing X-Dial-Token" }, 401);
    }

    // 2. Parse body
    const { number, displayName } = await parseBody(c.req.raw, DialCall);
    const normalizedTarget = normalizeHandle(number);

    // 3. Check allowlist
    if (!dialManager.isAllowed(normalizedTarget)) {
      return c.json({ error: "Number not in dial allowlist" }, 403);
    }

    // 4. Ensure only ONE dial session at a time
    if (dialManager.hasActive()) {
      return c.json({ error: "A dial call is already in progress" }, 409);
    }

    // 5. Generate synthetic handle (+1555010xxxx)
    // Real number must NEVER appear in trace, store, logs or response (hard rule 4)
    const syntheticHandle = `+1555010${Math.floor(1000 + Math.random() * 9000)}`;
    const callId = newEventId();

    dialManager.setActive({
      callId,
      realNumber: normalizedTarget,
      syntheticHandle,
      startedAt: Date.now(),
    });

    // 6. Subscribe to the bus BEFORE ingesting to catch first agent disclosure turn
    let unsubscribed = false;
    const unsub = bus.subscribe(async (trace) => {
      if (trace.eventId === callId && trace.type === "call.turn" && trace.speaker === "agent") {
        if (unsubscribed) return;
        unsubscribed = true;
        unsub();
        const greeting = trace.text;
        try {
          await dialManager.placeOutboundCall(callId, normalizedTarget, greeting);
        } catch (err) {
          log(`[dial] outbound call placement failed: ${err instanceof Error ? err.message : String(err)}`);
          bus.emit(callId, { type: "error", message: "Failed to place outbound phone call" });
          sessions.close(callId);
          dialManager.clearActive(callId);
        }
      } else if (trace.eventId === callId && (trace.type === "call.verdict" || trace.type === "error")) {
        if (!unsubscribed) {
          unsubscribed = true;
          unsub();
        }
        dialManager.clearActive(callId);
      }
    });

    // 7. Ingest call into screener
    const normalized: NormalizedCall = {
      event: {
        id: callId,
        kind: "call",
        source: "photon",
        from: { handle: syntheticHandle, displayName: displayName || "Live caller" },
        body: "",
        threadId: `call_${syntheticHandle}`,
      },
    };
    ingestCall(normalized);

    return c.json({ callId }, 202);
  });

  // ── Custom LLM endpoint for ElevenLabs Conversational AI ──
  const handleCustomLlm = async (c: any) => {
    const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
    if (!dialManager.isCustomLlmAuthValid(authHeader)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Body must be valid JSON" }, 400);
    }

    const callId =
      body.dynamic_variables?.call_id ??
      body.dynamic_variables?.callId ??
      body.call_id ??
      body.callId ??
      c.req.query("call_id") ??
      c.req.query("callId") ??
      dialManager.getActiveCallId();

    if (!callId || !sessions.has(callId)) {
      return c.json({ error: "No active dial call session found" }, 404);
    }

    const userMessages = Array.isArray(body.messages) ? body.messages.filter((m: any) => m && m.role === "user") : [];
    const lastUserMsg = userMessages.at(-1);
    const userText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content.trim() : "";

    const isStreaming = body.stream !== false;

    if (!userText) {
      if (isStreaming) {
        return new Response(sseFinishChunk("stop") + SSE_DONE, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }
      return c.json({
        id: "chatcmpl-empty",
        object: "chat.completion",
        created: Math.floor(clock().getTime() / 1000),
        choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
      });
    }

    // Deliver caller speech into the screener session
    sessions.say(callId, userText);

    // Wait for the screener's next agent response or verdict
    const result = await new Promise<{ type: "turn"; text: string } | { type: "verdict"; text?: string; endCall: boolean }>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pendingTurnText: string | undefined;
      let microTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (val: { type: "turn"; text: string } | { type: "verdict"; text?: string; endCall: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(microTimer);
        unsub();
        resolve(val);
      };

      timer = setTimeout(() => {
        finish({ type: "turn", text: "" });
      }, 25_000);

      const unsub = bus.subscribe((trace) => {
        if (trace.eventId === callId && trace.type === "call.turn" && trace.speaker === "agent") {
          pendingTurnText = trace.text;
          // Wait a tick: if call.verdict follows in this turn (finalize), treat as verdict with endCall
          microTimer = setTimeout(() => {
            finish({ type: "turn", text: pendingTurnText! });
          }, 20);
        } else if (trace.eventId === callId && trace.type === "call.verdict") {
          const actionText = trace.result.verdict.next_action;
          finish({
            type: "verdict",
            text: pendingTurnText ?? actionText,
            endCall: true,
          });
        }
      });
    });

    if (result.type === "verdict") {
      dialManager.clearActive(callId);
    }

    if (isStreaming) {
      const streamText = result.type === "turn" ? result.text : (result.text ?? "");
      const isEndCall = result.type === "verdict";

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          if (streamText) {
            const words = streamText.split(" ");
            for (let i = 0; i < words.length; i++) {
              const token = (i === 0 ? "" : " ") + words[i];
              controller.enqueue(encoder.encode(sseContentChunk(token)));
            }
          }
          if (isEndCall) {
            controller.enqueue(encoder.encode(sseEndCallChunk("verdict_reached")));
            controller.enqueue(encoder.encode(sseFinishChunk("tool_calls")));
          } else {
            controller.enqueue(encoder.encode(sseFinishChunk("stop")));
          }
          controller.enqueue(encoder.encode(SSE_DONE));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } else {
      const content = result.text ?? "";
      return c.json({
        id: `chatcmpl-${randomBytes(8).toString("hex")}`,
        object: "chat.completion",
        created: Math.floor(clock().getTime() / 1000),
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: result.type === "verdict" ? "stop" : "stop",
          },
        ],
      });
    }
  };

  app.post("/v1/elevenlabs-llm/chat/completions", handleCustomLlm);
  app.post("/v1/elevenlabs-llm", handleCustomLlm);

  // ── Photon webhook listener ──
  app.post("/webhooks/photon", async (c) => {
    const sigHeader = c.req.header("X-Spectrum-Signature") ?? c.req.header("x-spectrum-signature");
    const tsHeader = c.req.header("X-Spectrum-Timestamp") ?? c.req.header("x-spectrum-timestamp");

    if (!sigHeader || !tsHeader) {
      return c.json({ error: "Missing signature headers" }, 400);
    }

    const tsNum = Number(tsHeader);
    if (Number.isNaN(tsNum)) {
      return c.json({ error: "Invalid timestamp header" }, 400);
    }

    const nowSec = Math.floor(clock().getTime() / 1000);
    if (Math.abs(nowSec - tsNum) > 300) {
      return c.json({ error: "Stale timestamp" }, 401);
    }

    const secret = options.photonWebhookSecret ?? options.env?.PHOTON_WEBHOOK_SECRET ?? "";
    if (!secret) {
      return c.json({ error: "Webhook secret not configured" }, 401);
    }

    const rawBody = await c.req.text();
    if (!verifySpectrumSignature(rawBody, sigHeader, tsHeader, secret)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Body must be valid JSON" }, 400);
    }

    let normalized: NormalizedCall;
    try {
      normalized = normalizePhotonWebhook(json);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }

    const liveCallId = sessions.findByHandle(normalized.event.from.handle);
    if (liveCallId) {
      if (normalized.firstWords) {
        sessions.say(liveCallId, normalized.firstWords);
      }
      return c.json({ ok: true, callId: liveCallId, routed: "say" }, 202);
    }

    const callId = ingestCall(normalized);
    return c.json({ ok: true, callId }, 202);
  });

  // ── ElevenLabs webhook listener (post-call transcript or server tool) ──
  app.post("/webhooks/elevenlabs", async (c) => {
    const secret = options.elevenlabsWebhookSecret ?? options.env?.ELEVENLABS_WEBHOOK_SECRET;
    // No secret, no endpoint: an unsigned answer could fake "yes, it's me" and pass the bridge gate.
    // Without a secret the callback still works by polling the call transcript.
    if (!secret) return c.json({ error: "Webhook secret not configured" }, 401);
    const rawBody = await c.req.text();
    const sigHeader = c.req.header("ElevenLabs-Signature") ?? c.req.header("elevenlabs-signature");
    if (!verifyElevenLabsSignature(rawBody, sigHeader, secret, Math.floor(clock().getTime() / 1000))) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Body must be valid JSON" }, 400);
    }

    const conversationId =
      body.data?.conversation_id ??
      body.conversation_id ??
      body.conversationId ??
      body.data?.conversationId;

    let requestId =
      body.requestId ??
      body.request_id ??
      // Where ElevenLabs puts our dynamic variables in post-call webhooks.
      body.data?.conversation_initiation_client_data?.dynamic_variables?.request_id ??
      body.data?.dynamic_variables?.request_id ??
      c.req.query("request_id") ??
      c.req.query("requestId");

    if (!requestId && conversationId && callbackProvider instanceof ElevenLabsPhotonCallback) {
      requestId = callbackProvider.getRequestIdForConversation(conversationId);
    }

    let text =
      body.text ??
      body.answer ??
      body.message;

    if (!text && Array.isArray(body.data?.transcript)) {
      const userLines = body.data.transcript
        .filter((t: any) => t && t.role === "user")
        .map((t: any) => String(t.message ?? ""))
        .filter(Boolean);
      text = userLines.join(" ").trim();
    } else if (!text && Array.isArray(body.transcript)) {
      const userLines = body.transcript
        .filter((t: any) => t && t.role === "user")
        .map((t: any) => String(t.message ?? ""))
        .filter(Boolean);
      text = userLines.join(" ").trim();
    }

    if (requestId && text) {
      const replied = broker.reply(requestId, { text });
      if (callbackProvider instanceof ElevenLabsPhotonCallback) {
        callbackProvider.resolvePending(requestId, text);
      }
      return c.json({ ok: true, requestId, replied }, 200);
    }

    return c.json({ ok: false, note: "Webhook received but could not match a pending request with answer" }, 200);
  });

  // ── Trusted registry (SQLite). Code words never leave over HTTP. ──
  app.get(API.trusted, (c) => {
    const claim = c.req.query("claim");
    return c.json((claim ? registry.byClaim(claim) : registry.all()).map(toRecord));
  });
  app.post(API.trusted, async (c) => {
    const input = await parseBody(c.req.raw, NewTrustedContact);
    return c.json(toRecord(registry.upsert(input)), 201);
  });
  app.get("/api/trusted/:number", (c) => {
    const contact = registry.byNumber(c.req.param("number"));
    return contact ? c.json(toRecord(contact)) : c.json({ error: "Not a trusted contact" }, 404);
  });
  app.post("/api/trusted/:number/check-code", async (c) => {
    const { attempt } = await parseBody(c.req.raw, CodeWordCheck);
    const result = registry.checkCode(c.req.param("number"), attempt);
    return result ? c.json(result) : c.json({ error: "Not a trusted contact" }, 404);
  });

  app.get(API.pendingVerifications, (c) => c.json(broker.listPending()));
  app.post("/api/verifications/:id/reply", async (c) => {
    const body = await parseBody(c.req.raw, ReplyBody);
    const id = c.req.param("id");
    if (!broker.reply(id, body)) return c.json({ error: "No pending verification with that id" }, 404);
    return c.json({ ok: true, requestId: id });
  });

  app.post(API.reset, (c) => {
    sessions.clear();
    dialManager.clearActive();
    broker.clear();
    store.clear();
    bus.clear();
    agent = makeAgent();
    return c.json({ ok: true });
  });

  /** Test helper: resolves once every in-flight agent run has finished. */
  const idle = async () => {
    while (inflight.size) await Promise.allSettled([...inflight]);
  };

  return {
    app,
    bus,
    store,
    broker,
    registry,
    sessions,
    screener,
    callbackProvider,
    dialManager,
    /** Registry contacts with live-demo overrides applied (code words included — server-side only). */
    get contacts() {
      return contacts();
    },
    /** The current agent (replaced on reset). */
    get agent() {
      return agent;
    },
    idle,
  };
}

function summarize({ id, title, summary, tags, expected, event }: Scenario) {
  return { id, title, summary, tags, expected, kind: event.kind };
}

export type BeaconApp = ReturnType<typeof createApp>;
