# apps/channels — Photon Spectrum bridge

**Owner:** CENG 1 · **Judged on:** "it works on a real phone" — the Photon story.

Bridges real messaging (Photon Spectrum, npm `spectrum-ts`) to the Beacon server
over HTTP + SSE. Runs as its own process (`pnpm dev:channels`). Talks to the server
only via `@beacon/shared` `API`.

## Providers
- `CHANNELS_PROVIDER=terminal` (default): no credentials. Type a message in the shell
  as if it arrived on the protected phone. Great for dev.
- `CHANNELS_PROVIDER=imessage`: Spectrum Cloud iMessage line (`SPECTRUM_PROJECT_ID` /
  `SPECTRUM_PROJECT_SECRET` from app.photon.codes).
- Spectrum API: `Spectrum({ projectId, projectSecret, providers: [...] })`,
  `for await (const [space, message] of app.messages)`, `message.content.type === "text"`,
  `message.content.text`, `message.sender?.id`, `space.send(...)`, `message.reply(...)`,
  `space.responding(async () => …)` (typing indicator). Inspect the installed
  `node_modules/spectrum-ts` types for how to open a DM to a handle for outbound sends.

## Flows
1. **Inbound message → event.** A message arrives on Beacon's line:
   - sender matches a pending verification's `to` handle → it's the trusted contact
     answering → `POST /api/verifications/:id/reply`;
   - else → `POST /api/events` (`source: "photon"`, or `"forwarded"` if the user
     forwarded a suspicious text to Beacon to check it).
2. **Outbound verification.** Subscribe to `API.stream`; on `verification.requested`
   with channel `imessage`/`sms`/`whatsapp`, send `request.question` to `request.to`.
3. **Verdict reply (forward-to-check).** For events that came in as `forwarded`, reply
   in the same chat with a short verdict: label, confidence, top 2 reasons, first recovery step.

Keep routing/formatting as pure functions (`src/route.ts`, `src/format.ts`) with
unit tests — Spectrum itself can't run in CI.

## Voice (stretch — read before starting)
Photon voice is **SIP-only** (`sip.spectrum.photon.codes`, TLS 5061, project ID/secret as
SIP creds), RTP audio, no built-in speech-to-text, SDK call control "coming soon".
A live call path needs a SIP user agent + STT — budget it as a stretch. Cheaper
alternatives first: (a) scripted call scenarios in the phone UI (already planned),
(b) iMessage **voice memos** → transcription → agent.

## Backlog
**Must**
- [x] `src/main.ts`: provider from env, graceful fallback to terminal with a clear message
- [x] Inbound routing (verification reply vs. new event vs. forwarded)
- [x] Outbound verification sends via SSE subscription (reconnect + `since`)
- [x] Forward-to-check verdict replies
- [x] Unit tests for routing + formatting; server-down retry with backoff

**Stretch**
- [ ] Voice memo → transcript → event
- [x] SIP call path design doc first: see `VOICE.md` (design only, not implemented)

## Status
All **Must** items done; 33 vitest tests pass; `pnpm -F @beacon/channels typecheck` clean.

**Layout** (`src/`): `config.ts` (env -> config, falls back to terminal with a warning), `handles.ts` (phone/email
normalization), `route.ts` (pure: verification-reply vs new-event, forward unwrapping), `format.ts` (pure: question +
<=480-char verdict, strips links), `sse.ts` (chunk-safe SSE parser), `server-client.ts` (typed HTTP + SSE with backoff and
`?since` resume), `bridge.ts` (state + wiring, testable with fakes), `transport.ts` (interface),
`spectrum-transport.ts` (Photon adapter), `stdio-transport.ts` (plain stdin fallback), `main.ts`.

**Run:** `pnpm dev:channels`. Default is the terminal provider. With a TTY it uses Spectrum's terminal TUI; without one
(pipes, CI) or if Spectrum fails to start it uses plain stdin/stdout. In stdin mode type `+15550100142> No, that's not me`
to speak as another handle (e.g. the trusted contact answering a verification). Real iMessage: set
`CHANNELS_PROVIDER=imessage`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`.

**Smoke test (server down):** `echo test | timeout 8 npx tsx src/main.ts` starts in stdin mode, logs
"Beacon server not reachable ... retrying in 0.7s" with growing backoff (0.5s -> 10s cap), no crash.

**Known gaps:** the real Spectrum iMessage and terminal-TUI paths are typed against the SDK `.d.ts` but untested
(no credentials / no TTY here); the terminal provider's outbound `space.create(handle)` is unverified, so a failed
send is only logged. `voice` content (memos) is ignored. Forwards carry the forwarder as `from` unless the
forward header names the original sender. Only one pending request per handle is answered per reply (latest wins).
Pending/verdict state is in-memory (lost on restart; pending is re-seeded from `GET /api/verifications/pending`).

## Requests from other lanes
_(append here)_
