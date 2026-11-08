import { getScenario, listScenarios, scenarios as allScenarios, scenarioToEvent, trustedContacts } from "@beacon/scenarios";
import { createAgent, createScreener, scrubSafeWords, type ScreenerOptions } from "@beacon/agent";
import {
  API,
  CallerSays,
  CodeWordCheck,
  DEFAULT_AGENT_CONFIG,
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
import { randomBytes } from "node:crypto";
import type { ZodType } from "zod";
import { TraceBus } from "./bus.js";
import { CallSessions } from "./calls.js";
import { applyVerifyOverrides, toPublicContact } from "./contacts.js";
import { normalizeEventCall, normalizeScenarioCall, normalizeSimCall, type NormalizedCall } from "./normalize.js";
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
  /** Swap the agent (tests). */
  agentFactory?: (deps: Parameters<typeof createAgent>[0], config: Partial<AgentConfig>) => Agent;
  clock?: () => Date;
  sseHeartbeatMs?: number;
  /** Called with agent failures and per-event timing. Defaults to console. */
  log?: (line: string) => void;
}

const newEventId = () => `evt_${randomBytes(5).toString("hex")}`;

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
    sessions.open(event.id, { firstWords: normalized.firstWords, script: normalized.script });
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
