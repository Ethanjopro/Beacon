# apps/phone — Product app

**Owner:** SWE 2 · **Judged on:** usability, presentability, creativity. This is what judges *see*.

React 19 + Vite 6 + Tailwind v4 + `motion` + `lucide-react`. Mobile-first web app
that also runs inside a **desktop phone frame** for the stage demo. Talks to the
server only via `@beacon/shared` `API` routes (Vite proxies `/api` → `:8787`).

## Design direction
- **Name/metaphor:** Beacon — a lighthouse: calm, steady, watching out for you.
  Warm signal color (amber/gold) on a deep, calm background. Not alarmist red
  everywhere — red is reserved for the "scam" verdict.
- **No carrier branding.** Don't use T-Mobile's magenta, logo or name in the UI.
- Large type, high contrast (readable from the back of a judging room and by older users).
- Motion that explains: the risk meter fills as evidence arrives; signals drop in as chips
  with their weight; the verification card visibly "waits" for Mom's reply.
- Every number shown is explainable on tap (show your work).

## Screens
1. **Phone frame** — desktop: device frame centered, with an optional side panel
   showing the full agent trace for judges. Mobile (<500 px wide): full-screen, no frame.
2. **Home / Messages** — conversation list; "Beacon is protecting this phone" status.
3. **Thread + Beacon banner** — incoming message lands; a Beacon banner shows live
   stages ("Checking locally… Asking Mom… Verdict").
4. **Live trace** — stages, signals (title + weight), tool calls, privacy note,
   verification card ("Asked Mom via iMessage · waiting…" → her reply).
5. **Verdict sheet** — label, headline, pScam meter with band, confidence, top reasons,
   verification result, privacy ledger ("what left your phone"), CTAs.
6. **Recovery checklist** — steps grouped by urgency (now / soon / later), one-tap actions,
   checkable.
7. **Incoming call** — caller ID, live transcript (play segments by `atMs`), rising risk
   meter, in-call warning ("This may be a cloned voice. Hang up and call Sam at his saved number.").
8. **Demo console** (`#/console`, or press `d`) — list scenarios, fire, reply as the
   trusted contact for pending verifications, reset. Hidden from the phone view.

## Data
- `src/lib/api.ts` — typed fetch helpers over `API`.
- `src/lib/stream.ts` — SSE client on `API.stream` (`event: trace`), auto-reconnect with `?since=<lastSeq>`.
- `src/state/` — reducer keyed by `eventId`: event, trace[], running pScam, verification, verdict.
- **Mock mode** `?mock=1` — replays canned traces (built from shared types in
  `src/mock/`) with realistic timing and **no server**. Use it for UI dev and screenshots.

## Backlog
**Must**
- [x] SSE client + store; mock replay mode
- [x] Phone frame + responsive full-screen mode
- [x] Messages list, thread view, Beacon banner
- [x] Live trace timeline + animated risk meter
- [x] Verdict sheet (reasons with weights, band, verification, privacy ledger)
- [x] Recovery checklist with actions
- [x] Incoming-call screen with live transcript
- [x] Demo console (fire scenario, reply as contact, reset)
- [x] Loading / empty / server-down states
- [x] Looks right at 390×844 and in the desktop frame (Playwright screenshot check)

**Should**
- [x] PWA manifest + icons (add to home screen on a real phone)
- [ ] `navigator.vibrate` + subtle sound on a scam verdict _(vibrate done; sound not yet)_
- [x] "Simple mode" — plain-language verdicts for older users
- [ ] Guardian view: what a trusted family member sees when you're targeted

**Stretch**
- [ ] Live mic captions via Web Speech API for a real call demo

## Status
**Runs today, fully offline:** `pnpm -F @beacon/phone dev` → http://localhost:5173/?mock=1, press **D**, fire a scenario.
Live mode (no `?mock`) talks to apps/server through `/api` and shows a "Can't reach Beacon" state until the server is up.

**Layout.** `≥500px`: device frame (scaled to viewport height) + judges' **Agent trace** panel on the right;
`≥1280px` also shows the story rail on the left (Detect → Ask the real person → Honest verdict → Get safe, with the
current step lit). `<500px`: full-screen phone, no frame; the live trace is inside the Beacon banner (tap to expand).

**Map of `src/`**
- `main.tsx` picks `MockBackend` (`?mock=1`) or `LiveBackend`. `App.tsx` = layout shell, `#/console` route, `d`/Esc keys.
- `backend/` — the `Backend` interface the UI codes against. `live.ts` (HTTP via `lib/api.ts` + SSE via `lib/stream.ts`),
  `mock.ts` (wraps `mock/engine.ts`), `resetChannel.ts` (BroadcastChannel so a console window's Reset clears the phone window).
- `lib/stream.ts` — EventSource on `API.stream`, listens for `trace`, closes and reopens itself with `?since=<lastSeq>` and
  backoff (the native auto-reconnect would replay from the start). 2 consecutive failures → status `down`.
  Items stamped >750 ms before the connection opened are flagged `replay` and applied instantly.
- `lib/pacer.ts` — releases trace items with a ~320 ms stagger so a 40 ms pipeline still reads on stage; the stagger
  shrinks so a backlog drains within ~2.5 s, and replayed items / hidden tabs flush immediately.
- `state/reducer.ts` — pure reducer keyed by `eventId` (dedupe on seq, stages, signals, running pScam, verification, verdict).
  `state/store.tsx` — context provider; exposes `arrival`/`verdictArrival` (drive auto-navigation and the auto-opened sheet).
- `mock/` — `scenarios.ts` has 4 canned, type-checked scripts mirroring packages/scenarios: `toll-smish` (decided on-device),
  `mom-new-number-giftcards` (asks real Mom → "No?? That's not me!" → SCAM 98%), `mom-dinner-legit` (safe, never leaves
  the phone), `grandson-bail-call` (cloned-voice call with timed transcript, asks Sam mid-call). Scores are computed
  from the signals with the shared math (`mock/build.ts`), so every number in mock mode is explainable.
  `engine.ts` holds pending verifications; the console can answer before the scripted auto-reply (toggle in console);
  `interpret.ts` maps the reply to denied/confirmed/unclear and the rest of the trace branches on it.
- `screens/` — Home (protection card + inbox with seeded synthetic threads), Thread (banner, flagged phrases underlined in
  the bubble), VerdictSheet (headline, pScam + band, confidence, "How we got this number" math, real-person card, reasons
  with weights + source badges, privacy ledger, CTAs), Recovery (now/today/later, checkable, one-tap actions), Call.
- `components/` — RiskMeter (zones at shared thresholds, band capsule), TraceTimeline, VerificationCard, MathCard,
  TracePanel, StoryRail, DemoConsole, PhoneFrame, BeaconMark (inline SVG logo).

**Behaviors worth knowing**
- New text → its thread opens; new call → the call screen rings. A non-safe verdict opens the sheet after 0.9 s and
  vibrates on scams (where supported). Hanging up opens the verdict sheet.
- Call transcript segments appear at `atMs` measured from the event's first trace timestamp; the in-call warning shows at
  pScam ≥ 0.8 or when verification is denied.
- In the desktop frame, recovery actions are simulated (toast) so a click on stage never opens FaceTime/Messages; on a
  real phone they are real `tel:` / `sms:` / `https:` links. Targets come only from the verdict (trusted sources).
- Console: number keys 1–9 fire scenarios while it's open. Simple mode (home toggle or console) swaps in plain-language
  verdicts and hides the numbers; persisted in localStorage.
- PWA: `public/manifest.webmanifest` + `public/icon.svg`.

**Tests** (`test/`, vitest, pure logic — no DOM lib installed): reducer, pacer, SSE client (fake EventSource),
mock engine (every canned item passes `TraceEvent.parse`, labels match `expected`, verification goes to the saved handle,
no safe word leaks, console reply branches), banner copy, inbox, math, formatting.

**Screenshots:** `npx vite --port 9150 --strictPort` then `node scripts/screenshots.cjs [desk|mob]` (needs Playwright installed) → `.scratch/phone/` (gitignored).

**Known gaps / next**
- `?mock=1` canned set (toll, mom scam, mom-dinner-legit, grandson call) doesn't include
  `mom-new-number-confirmed`, which is now demo Act 2b (`docs/DEMO.md`). Add a mock for it, or rehearse Act 2b on the live server.
- `#/console` in a separate window only drives the phone in live mode (mock engine lives in the phone tab; use `d` there).
- Guardian view, Spanish verdict copy, scam sound, live mic captions not started.
- Bundle is ~560 kB (zod + motion); fine for the demo, code-split if it matters.
- Needs from other lanes: see "Requests from other lanes" below.

## Requests from other lanes
_(append here)_

_Resolved (integration):_ scenarios added the call as `grandson-bail-call` (the mock now uses the same id);
the server treats `since` as exclusive with `seq` starting at 1 (now documented in `packages/shared/src/api.ts`).
The reset-event request moved to `packages/shared/AGENTS.md`.

~~**From phone → scenarios (CENG 2):** add a `grandson-voice-call` scenario (kind `call`, `from.displayName: "Sam"` on a
non-saved number, timed `transcript`, `trustedContactReply` from `sam`). The phone's mock version is in
`apps/phone/src/mock/scenarios.ts` — copy its transcript so mock and live tell the same story.~~

**From phone → server (CENG 1):** (1) the phone connects with `?since=0` on first load to restore state after a refresh;
please treat `since` as exclusive and start `seq` at 1. (2) After `POST /api/reset` nothing on the stream tells clients;
the phone uses a same-origin BroadcastChannel today — a `reset` SSE event would make it robust across devices.
