# Demo run-sheet (target: 3 minutes)

Everything here must work **offline in mock mode** first. Live mode (real Nemotron +
real iMessage) is an upgrade, not a dependency.

## Setup (before judges arrive)
- Laptop: `pnpm dev`, browser on `http://localhost:5173` (phone frame + trace panel), and
  the demo console on a second window (`#/console`) or behind the `d` key.
- Live mode only: `.env` has `LLM_PROVIDER=nvidia`, Photon creds, and
  `BEACON_VERIFY_MOM=imessage:<teammate's number>`. `pnpm dev:channels` running.
  Teammate playing "Mom" has their phone **unmuted** and in hand.
- Pre-flight: `pnpm scenario mom-dinner-legit` → verdict appears → `POST /api/reset`.

## Script

| Time | Beat | Action | What the judge sees |
|---|---|---|---|
| 0:00 | **Hook** | Say: "Americans reported losing over $12.5 billion to fraud in 2024 (FTC). Most scam detectors only say *probably fake*. Beacon *finds out*." *(Check for a newer FTC figure before the event.)* | Phone frame, "Beacon is protecting this phone" |
| 0:20 | **Act 1: Fast and private** | Fire `toll-smish` | Text lands → local signals pop in → SCAM in under a second. Privacy ledger: "Checked on-device · nothing left your phone" |
| 0:50 | **Act 2: The real person** | Fire `mom-new-number-giftcards` | "Mom" from a new number → meter climbs to *suspicious* → "Asking the real Mom via iMessage…" → **teammate's phone buzzes, they read it out and reply "No, that's not me!"** → verdict flips to **SCAM 98%** with the reason "Mom says it wasn't her" |
| 1:40 | **Recovery** | Tap through the checklist | "Don't buy the cards · Block · Forward to 7726 · If you already sent codes: call the card issuer now" |
| 2:00 | **Act 3: Cloned voice** *(if ready)* | Fire the call scenario | Incoming call from "Sam", live transcript, rising meter, in-call banner: "Hang up and call Sam at his saved number" |
| 2:30 | **Proof** | Switch to the slide | Eval vs. T-Mobile baseline (F1, per-type recall), calibration chart, "% of messages that never left the device" |
| 2:50 | **Close** | "Beacon: detection that verifies, confidence you can trust, and a way back if you've already been hit." | — |

## Fallbacks
- **NVIDIA down / slow** → `LLM_PROVIDER=mock`; the story is the same.
- **iMessage not arriving** → the demo console's "Reply as Mom", or let the scenario's scripted
  reply fire (simulator channel). Say "in production this is an iMessage to Mom".
- **Laptop dies** → the backup video (recorded at H20) on a phone.

## Q&A prep
- *"Can Beacon read my texts?"* → iOS doesn't allow that. Users forward suspicious texts
  to Beacon's iMessage number, or a carrier integrates it at the network level (the
  T-Mobile angle).
- *"What if Mom doesn't answer?"* → Verification times out, the verdict stays
  *suspicious* with a wider band, and the advice becomes "call Mom at her saved number before doing anything".
- *"Why should I trust 98%?"* → Show the reasons and weights, then the calibration chart.
- *"What leaves my phone?"* → The privacy ledger: redacted text only for suspicious
  messages, contact names replaced, safe words never.
