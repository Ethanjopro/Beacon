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
src/callback.ts  outbound phone callback provider (ElevenLabsPhotonCallback)
src/calls.ts     live call sessions: listen/say/handle routing
src/contacts.ts  safe-word stripping + BEACON_VERIFY_<ID> overrides
src/normalize.ts normalizes calls from sim, scenarios, events, and Photon webhooks
src/registry.ts  trusted contacts SQLite store
src/sse.ts       SSE handler (replay, heartbeat, abort cleanup)
src/store.ts     events, verdicts, outcomes by eventId
src/verify.ts    verification broker (pending map, simulator auto-reply, callback provider, timeouts)
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
- `POST /webhooks/photon` — inbound signed message webhook; HMAC-SHA256 verified against `PHOTON_WEBHOOK_SECRET`
  with 5-minute timestamp tolerance. Feeds caller speech into active sessions or ingests a new screened call.
- `POST /webhooks/elevenlabs` — webhook endpoint for post-call transcripts or live answer tools from ElevenLabs.

## Verification broker (`AgentDeps.verify`)
The agent emits `verification.requested`, then awaits `verify(req)`. The broker:
1. stores the request as pending;
2. if `req.channel === "call"` and a `CallbackProvider` is configured: calls `callbackProvider.call(req)`;
3. if `req.channel === "simulator"` and the event came from a scenario whose
   `trustedContactReply.contactId === req.contactId` → auto-reply after `delayMs`;
4. otherwise waits for `POST /api/verifications/:id/reply` (from apps/channels or the demo console);
5. resolves `{ status: "timeout" }` after `req.timeoutMs`. Never rejects.

## Live-demo contact overrides
`BEACON_VERIFY_<CONTACT_ID>=<channel>:<handle>` (e.g. `BEACON_VERIFY_SAM=call:+15551234567`)
rewrites that contact's `verifyVia` at boot, so a teammate's real phone can play "Sam"
without committing a real number.

## Live Photon & ElevenLabs setup

### 1. Tunnel
Expose the local server (`8787`) with a public tunnel:
```bash
cloudflared tunnel --url http://localhost:8787
# or: ngrok http 8787
```
Set `PUBLIC_BASE_URL=https://<your-tunnel-subdomain>` in `.env`.

### 2. Photon Dashboard (Inbound Messages)
1. Go to `app.photon.codes` → Webhooks.
2. Register a webhook pointing to `https://<your-tunnel-subdomain>/webhooks/photon`.
3. Copy the Signing Secret and set `PHOTON_WEBHOOK_SECRET=<secret>` in `.env`.

### 3. ElevenLabs Conversational AI (Outbound Phone Callback)
1. Set up a Conversational AI agent in ElevenLabs (`elevenlabs.io`).
2. Connect your Photon SIP trunk number (`sip.photon.codes:5061`) to ElevenLabs under
   Telephony / Phone Numbers.
3. In ElevenLabs agent configuration:
   - Dynamic Variables: add `question`, `contact_name`, `request_id`, `claim`.
   - First Message: set it to exactly `{{question}}`. We don't send a `first_message` override
     (ElevenLabs rejects overrides unless enabled in the agent's Security tab).
   - System prompt: you're checking a call for a family member; listen to the answer, then end the call.
   - Tools: keep the **End Call** system tool on, so the call ends right after the answer
     (the verdict waits for the call to finish).
   - Post-Call Webhook: point to `https://<your-tunnel-subdomain>/webhooks/elevenlabs`.
4. Copy credentials to `.env`:
   - `ELEVENLABS_API_KEY=xi_...`
   - `ELEVENLABS_AGENT_ID=agent_...`
   - `ELEVENLABS_PHONE_NUMBER_ID=phone_...` (from `/v1/convai/phone-numbers`)
   - `ELEVENLABS_WEBHOOK_SECRET=...` **required for the webhook**: without it `/webhooks/elevenlabs`
     returns 401 (an unsigned answer could fake "yes, it's me"); answers then arrive by polling the transcript.
   - `VERIFY_TIMEOUT_MS=90000` for the stage: ringing + question + answer + ElevenLabs' processing takes longer than 45 s.
5. Security while the tunnel is up: the whole server is public, including the demo console's
   `POST /api/verifications/:id/reply`. Keep the tunnel up only during the live demo.
6. Never log the teammate's number: `callback.ts` masks digit runs in its logs.

## Backlog
**Must**
- [x] Everything under Behavior + Verification broker + overrides
- [x] CORS for local dev; JSON error bodies; zod validation on every input
- [x] Tests: fire a scenario → verdict in store; SSE format + replay; reply resolves pending; timeout path; safe words never leave
- [x] Inbound Photon webhook listener (`POST /webhooks/photon`) with HMAC verification and live session routing
- [x] Outbound callback provider (`ElevenLabsPhotonCallback`) and verification broker integration
- [x] ElevenLabs webhook listener (`POST /webhooks/elevenlabs`) with post-call transcript processing and fallback polling

**Should**
- [ ] Optional JSON-file persistence of the last session (survive a restart mid-demo)
- [x] Request log line per event with latency

## Status
- Done: all Must items and the log-line Should item. `pnpm -F @beacon/server test` (39 tests) covers scenarios, calls, SSE format/replay/live, manual reply, timeout, reset, safe-word secrecy, env overrides, Photon webhook HMAC verification, and ElevenLabs callback resolution, signed-only ElevenLabs webhook, failed-call handling and number-free logs.
- Run: `pnpm -F @beacon/server start` (or `pnpm dev` at the root).
- Known gaps: JSON-file persistence not done; no auth (dev/demo only); SSE cursor ahead of server seq restarts from 0.

## Requests from other lanes
_(append here)_
