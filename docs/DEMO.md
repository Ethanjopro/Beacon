# Demo run-sheet (target: 3 minutes)

Everything here works **offline** first: the real server and agent run locally with
`LLM_PROVIDER=mock`, and trusted contacts are simulated. Live mode (real Nemotron +
real iMessage) is an upgrade, not a dependency.

## Setup (before judges arrive)
- Laptop: `pnpm dev`, browser on `http://localhost:5173` (phone frame + agent-trace panel).
- Cue the scenarios from a terminal with `pnpm -F @beacon/scenarios demo` (press Enter for
  each beat, in the order below), or open the demo console with the `d` key.
- Live mode only: `.env` has `LLM_PROVIDER=nvidia`, Photon creds, and
  `BEACON_VERIFY_MOM=imessage:<teammate's number>`. `pnpm dev:channels` running.
  The teammate playing "Mom" has their phone **unmuted** and in hand.
- Pre-flight: `pnpm scenario mom-dinner-legit` → a quiet "safe" verdict → `curl -X POST localhost:8787/api/reset`.

## Script

| Time | Beat | Fire | What the judge sees |
|---|---|---|---|
| 0:00 | **Hook** | — | "Americans reported losing over $12.5 billion to fraud in 2024 (FTC). Most scam detectors only say *probably fake*. Beacon *finds out*." *(Check for a newer FTC figure before the event.)* |
| 0:20 | **Act 1: Fast and private** | `toll-smish` | A fake "MetroTag" toll text lands → look-alike link and deadline signals pop in → SCAM within about a second. Privacy ledger: decided on this phone, nothing left it |
| 0:45 | **Act 2: Ask the real Mom** | `mom-new-number-giftcards` | "Mom" from a new number wants gift-card codes. The red flags already make Beacon nearly sure, **but it doesn't guess. It asks.** "Asking the real Mom at her saved number…" → *(live: the teammate's phone buzzes and they read it out)* → "No?? That's not me!" → **SCAM**, top reason "Mom says it wasn't her" |
| 1:25 | **Act 2b: No false alarm** | `mom-new-number-confirmed` | Same setup, but this time Mom really did get a new phone. Beacon asks → "Yes that's me!" → **SAFE**. Say: "A classifier would have flagged your actual mom. Asking the real person is how Beacon avoids that false alarm." |
| 1:50 | **Recovery** | — | Back to the Act 2 verdict, tap through the checklist: don't buy the cards, block, forward to 7726, and if you already sent codes, call the card issuer now |
| 2:10 | **Act 3: Cloned voice** | `grandson-bail-call` | Incoming call from "Sam", live transcript, rising meter, in-call banner: "Hang up and call Sam at his saved number" |
| 2:30 | **Proof** | — | Slide: eval vs. T-Mobile baseline (F1, per-type recall), calibration, "% of messages that never left the device" (`pnpm eval`) |
| 2:50 | **Close** | — | "Beacon: detection that checks with the real person, confidence you can trust, and a way back if you've already been hit." |

## Fallbacks
- **NVIDIA down / slow** → `LLM_PROVIDER=mock`; the story is the same. (With live Nemotron,
  Act 2 waits for the model before asking Mom, so allow 10–30 s.)
- **iMessage not arriving** → answer from the demo console ("reply as Mom"), or let the
  scenario's scripted reply fire. Say "in production this is an iMessage to Mom".
- **Server hiccup** → `curl -X POST localhost:8787/api/reset` and re-fire; a restart takes 2 s.
- **Laptop dies** → the backup video (recorded at H20) on a phone.

## Q&A prep
- *"Can Beacon read my texts?"* → iOS doesn't allow that. Users forward suspicious texts
  to Beacon's iMessage number, or a carrier runs it at the network level (the
  T-Mobile angle).
- *"If you were already 99% sure, why ask Mom?"* → Act 2b. Asking turns "almost certain" into
  "confirmed", and it's what keeps us from false-alarming on real family.
- *"What if Mom doesn't answer?"* → Verification times out, the band widens, and the advice
  becomes "call Mom at her saved number before doing anything".
- *"Why should I trust 98%?"* → Tap the meter: every reason with its weight. Then show the calibration table.
- *"What leaves my phone?"* → The privacy ledger: redacted text, and only for messages
  triage can't decide; contact names replaced; safe words never.
