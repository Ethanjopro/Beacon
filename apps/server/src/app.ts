import { getScenario, listScenarios, scenarios as allScenarios, scenarioToEvent, trustedContacts } from "@beacon/scenarios";
import { createAgent, scrubSafeWords } from "@beacon/agent";
import {
  API,
  DEFAULT_AGENT_CONFIG,
  NewEvent,
  ReplyBody,
  type Agent,
  type AgentConfig,
  type HealthResponse,
  type IncomingEvent,
  type Scenario,
  type TrustedContact,
} from "@beacon/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomBytes } from "node:crypto";
import type { ZodType } from "zod";
import { TraceBus } from "./bus.js";
import { applyVerifyOverrides, toPublicContact } from "./contacts.js";
import { traceStream } from "./sse.js";
import { Store } from "./store.js";
import { VerificationBroker } from "./verify.js";

export const SERVER_VERSION = "0.1.0";

export interface CreateAppOptions {
  agentConfig?: Partial<AgentConfig>;
  /** Defaults to the scenarios package registry (with env overrides applied). */
  contacts?: TrustedContact[];
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
  const contacts = applyVerifyOverrides(options.contacts ?? trustedContacts, options.env ?? {});
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
  const deps = { contacts: () => contacts, verify: broker.verify, emit: bus.emit, now: clock };
  const makeAgent = () => (options.agentFactory ? options.agentFactory(deps, agentConfig) : createAgent(deps, agentConfig));
  // `let`: reset swaps in a fresh agent so per-thread memory from earlier demo runs doesn't leak.
  let agent = makeAgent();

  /** Resolves when the agent finished; used by tests to await without polling. */
  const inflight = new Set<Promise<unknown>>();

  /** Stores the event, announces it, and runs the agent in the background. */
  function ingest(input: NewEvent): string {
    const event: IncomingEvent = { ...input, id: input.id ?? newEventId(), body: input.body ?? "", receivedAt: input.receivedAt ?? clock().toISOString() };
    // The agent sees the raw event; the store and trace never carry a safe word.
    const shown = { ...event, body: scrubSafeWords(event.body, contacts).text };
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

  app.get(API.contacts, (c) => c.json(contacts.map(toPublicContact)));

  app.get(API.scenarios, (c) => c.json(options.scenarios ? scenarioList.map(summarize) : listScenarios()));
  app.post("/api/scenarios/:id/fire", (c) => {
    const scenario = options.scenarios ? scenarioList.find((s) => s.id === c.req.param("id")) : getScenario(c.req.param("id"));
    if (!scenario) return c.json({ error: "Unknown scenario" }, 404);
    return c.json({ eventId: ingest(scenarioToEvent(scenario)) }, 202);
  });

  app.get(API.pendingVerifications, (c) => c.json(broker.listPending()));
  app.post("/api/verifications/:id/reply", async (c) => {
    const body = await parseBody(c.req.raw, ReplyBody);
    const id = c.req.param("id");
    if (!broker.reply(id, body)) return c.json({ error: "No pending verification with that id" }, 404);
    return c.json({ ok: true, requestId: id });
  });

  app.post(API.reset, (c) => {
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
    contacts,
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
