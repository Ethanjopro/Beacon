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
- [ ] SSE client + store; mock replay mode
- [ ] Phone frame + responsive full-screen mode
- [ ] Messages list, thread view, Beacon banner
- [ ] Live trace timeline + animated risk meter
- [ ] Verdict sheet (reasons with weights, band, verification, privacy ledger)
- [ ] Recovery checklist with actions
- [ ] Incoming-call screen with live transcript
- [ ] Demo console (fire scenario, reply as contact, reset)
- [ ] Loading / empty / server-down states
- [ ] Looks right at 390×844 and in the desktop frame (Playwright screenshot check)

**Should**
- [ ] PWA manifest + icons (add to home screen on a real phone)
- [ ] `navigator.vibrate` + subtle sound on a scam verdict
- [ ] "Simple mode" — plain-language verdicts for older users
- [ ] Guardian view: what a trusted family member sees when you're targeted

**Stretch**
- [ ] Live mic captions via Web Speech API for a real call demo

## Status
- Placeholder `src/main.tsx` only.

## Requests from other lanes
_(append here)_
