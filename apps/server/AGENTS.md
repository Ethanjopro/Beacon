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
- `POST /api/calls/dial` — live voice dial initiation. Validates allowlist (`DIAL_ALLOWLIST`) and optional token (`DIAL_TOKEN`), creates a screened call under a synthetic handle (`+1555010xxxx`), and triggers ElevenLabs outbound call over Photon SIP trunk once the agent's AI disclosure turn emits.
- `POST /v1/elevenlabs-llm/chat/completions` (and `POST /v1/elevenlabs-llm`) — ElevenLabs Custom LLM endpoint for two-way live voice calls. Receives caller speech, feeds to `CallSessions.say()`, awaits screener turn or verdict via `bus.subscribe`, streams OpenAI SSE chunks back, and terminates the call via `end_call` tool call on verdict.

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

### 4. ElevenLabs Conversational AI (Live Voice Dial Screener Agent)
For live two-way calls dialed from the demo phone:
1. Create a dedicated Conversational AI agent in ElevenLabs for live dialing.
2. Under **Model / LLM**, select **Custom LLM**:
   - URL: `https://<your-tunnel-subdomain>/v1/elevenlabs-llm`
   - Authentication: configure Bearer token and set `ELEVENLABS_CUSTOM_LLM_SECRET=<secret>` in `.env`.
3. In Agent Configuration:
   - Dynamic Variables: add `call_id`, `greeting`.
   - First Message: set to `{{greeting}}` (matches the Nemotron screener's AI disclosure turn).
   - Tools: enable the **End Call** system tool (called when verdict is reached).
   - Voice: choose an authoritative, clear voice (e.g. Brian, George, or Sarah).
4. Environment Variables in `.env`:
   - `ELEVENLABS_DIAL_AGENT_ID=agent_...` (or falls back to `ELEVENLABS_AGENT_ID`)
   - `ELEVENLABS_CUSTOM_LLM_SECRET=...` (Bearer token protecting Custom LLM endpoint)
   - `DIAL_ALLOWLIST=+15551234567,+15559876543` (comma-separated list of allowed dial numbers in E.164)
   - `DIAL_TOKEN=...` (optional shared secret required in `X-Dial-Token` header)
5. Security:
   - Only numbers on `DIAL_ALLOWLIST` can be dialed.
   - Only one live dial session can run at a time (409 if busy).
   - The dialed person's real number is kept only in ephemeral memory and never appears in logs, traces, store, or responses (Hard Rule 4).

## Backlog
**Must**
- [x] Everything under Behavior + Verification broker + overrides
- [x] CORS for local dev; JSON error bodies; zod validation on every input
- [x] Tests: fire a scenario → verdict in store; SSE format + replay; reply resolves pending; timeout path; safe words never leave
- [x] Inbound Photon webhook listener (`POST /webhooks/photon`) with HMAC verification and live session routing
- [x] Outbound callback provider (`ElevenLabsPhotonCallback`) and verification broker integration
- [x] ElevenLabs webhook listener (`POST /webhooks/elevenlabs`) with post-call transcript processing and fallback polling
- [x] Live voice dial route (`POST /api/calls/dial`) with allowlist/token gate, synthetic privacy handle, and ElevenLabs outbound trigger
- [x] Custom LLM endpoint (`POST /v1/elevenlabs-llm/chat/completions`) streaming screener turns and terminating call with `end_call` on verdict

**Should**
- [ ] Optional JSON-file persistence of the last session (survive a restart mid-demo)
- [x] Request log line per event with latency

## Status
- Done: all Must items and the log-line Should item. Tests cover scenarios, calls, SSE format/replay/live, manual reply, timeout, reset, safe-word secrecy, env overrides, Photon webhook HMAC verification, ElevenLabs callback resolution, signed-only ElevenLabs webhook, live voice dial authorization/allowlist/synthetic privacy, and Custom LLM OpenAI SSE streaming.
- Run: `pnpm -F @beacon/server start` (or `pnpm dev` at the root).
- Known gaps: JSON-file persistence not done; no auth (dev/demo only); SSE cursor ahead of server seq restarts from 0.

## Requests from other lanes
_(append here)_
