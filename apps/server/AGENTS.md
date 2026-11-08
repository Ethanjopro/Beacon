# apps/server — Host (HTTP + SSE + verification broker)

**Owner:** CENG 1 · **Judged on:** it never breaks during the demo.

Hono on Node (`@hono/node-server`), port `BEACON_PORT` (default 8787). Runs the
agent in-process, keeps state in memory, streams trace over SSE, brokers
out-of-band verification. Routes and payloads are defined in `@beacon/shared` `API`.

## Shape
```
src/main.ts      boot: read env → agentConfigFromEnv → createApp → serve
src/index.ts     export { createApp } for tests
src/app.ts       createApp({ agentConfig, contacts, scenarios, clock? }) → { app, bus, store }
src/bus.ts       trace bus: stamps seq/at, ring buffer (~5k), subscribers
src/store.ts     events, verdicts, outcomes by eventId
src/verify.ts    verification broker (pending map, simulator auto-reply, timeouts)
src/routes/*.ts  one file per resource
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
- [ ] Everything under Behavior + Verification broker + overrides
- [ ] CORS for local dev; JSON error bodies; zod validation on every input
- [ ] Tests: fire a scenario → verdict in store; SSE format + replay; reply resolves pending; timeout path; safe words never leave

**Should**
- [ ] Optional JSON-file persistence of the last session (survive a restart mid-demo)
- [ ] Request log line per event with latency

## Status
- Placeholder `src/main.ts` only.

## Requests from other lanes
_(append here)_
