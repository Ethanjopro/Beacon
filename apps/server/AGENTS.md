# apps/server — Host (HTTP + SSE + verification broker)

**Owner:** CENG 1 · **Judged on:** it never breaks during the demo.

Hono on Node (`@hono/node-server`), port `BEACON_PORT` (default 8787). Runs the
agent in-process, keeps state in memory, streams trace over SSE, brokers
out-of-band verification. Routes and payloads are defined in `@beacon/shared` `API`.

## Shape
```
src/main.ts      boot: read env → agentConfigFromEnv → createApp → serve
src/index.ts     export { createApp } for tests
src/app.ts       createApp(options) → { app, bus, store, broker, contacts, agent, idle } + all routes
src/bus.ts       trace bus: stamps seq/at, ring buffer (~5k), subscribers
src/store.ts     events, verdicts, outcomes by eventId
src/verify.ts    verification broker (pending map, simulator auto-reply, timeouts)
src/sse.ts       SSE handler (replay, heartbeat, abort cleanup)
src/contacts.ts  safe-word stripping + BEACON_VERIFY_<ID> overrides
test/*.test.ts   app.request()-based tests (no real network)
```

## Behavior
- `POST /api/events` — validate `NewEvent`, assign `id` (`evt_…`) + `receivedAt`,
  emit `event.received`, run `agent.run(event)` **async**, return `202 { eventId }`.
- `GET /api/stream` — SSE, `event: trace`, `data: <TraceEvent JSON>`, `id: <seq>`.
  `?since=<seq>` (or `Last-Event-ID`) replays from the ring buffer. Heartbeat comment every 15 s.
- `GET /api/events/:id` — `EventDetail`.
- `GET /api/contacts` — `PublicContact[]` (**strip `safeWord`**, set `hasSafeWord`).
- `GET /api/scenarios`, `POST /api/scenarios/:id/fire` — via `@beacon/scenarios`.
- `GET /api/verifications/pending`, `POST /api/verifications/:id/reply` — resolve a pending verification.
- `POST /api/reset` — clear state (demo).
- `GET /api/health` — provider + model.

## Verification broker (`AgentDeps.verify`)
The agent emits `verification.requested`, then awaits `verify(req)`. The broker:
1. stores the request as pending;
2. if `req.channel === "simulator"` and the event came from a scenario whose
   `trustedContactReply.contactId === req.contactId` → auto-reply after `delayMs`;
3. otherwise waits for `POST /api/verifications/:id/reply` (from apps/channels or the demo console);
4. resolves `{ status: "timeout" }` after `req.timeoutMs`. Never rejects.

## Live-demo contact overrides
`BEACON_VERIFY_<CONTACT_ID>=<channel>:<handle>` (e.g. `BEACON_VERIFY_MOM=imessage:+15551234567`)
rewrites that contact's `verifyVia` at boot, so a teammate's real phone can play "Mom"
without committing a real number.

## Backlog
**Must**
- [x] Everything under Behavior + Verification broker + overrides
- [x] CORS for local dev; JSON error bodies; zod validation on every input
- [x] Tests: fire a scenario → verdict in store; SSE format + replay; reply resolves pending; timeout path; safe words never leave

**Should**
- [ ] Optional JSON-file persistence of the last session (survive a restart mid-demo)
- [x] Request log line per event with latency

## Status
- Done: all Must items and the log-line Should item. `pnpm -F @beacon/server test` (15 tests) covers scenarios, SSE format/replay/live, manual reply, timeout, reset, safe-word secrecy, env overrides.
- Run: `pnpm -F @beacon/server start` (or `pnpm dev` at the root). Env: `BEACON_PORT`, `LLM_PROVIDER`, `NVIDIA_API_KEY`, `VERIFY_TIMEOUT_MS`, `BEACON_VERIFY_<CONTACT_ID>=<channel>:<handle>`.
- Testing: `createApp({ simulatorDelayMs, agentConfig: { verifyTimeoutMs }, scenarios, env, log })`; `await ctx.idle()` waits for agent runs.
- Safe words are scrubbed from stored/traced `event.received` bodies; the agent gets the raw event.
- `POST /api/reset` clears store/buffer and resolves waiting verifications as `unreachable`; trace `seq` stays monotonic.
- Known gaps: JSON-file persistence not done; no auth (dev/demo only); SSE cursor ahead of server seq restarts from 0.

## Requests from other lanes
_(append here)_
