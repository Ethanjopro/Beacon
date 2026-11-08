# Beacon — Hackathon plan (v2)

This revises the original team plan after reading the sponsor track and the
sponsor SDKs. Lane briefs live in each directory's `AGENTS.md`; this file is the why
and the when.

## The pitch in one line

**Scam detection tells you a message is *probably* fake. Beacon *finds out* by
asking the real person over a channel you already trust, then tells you
honestly how sure it is and what to do next.**

T-Mobile's brief asks for protection "in ways we haven't thought of yet", says
detection is "a core piece, not the whole product", and wants "clear next steps,
honest confidence, privacy by design". Most teams will ship a classifier with a
UI. Our edge is the **out-of-band verification loop**. Nobody else will have a judge
watch a teammate's phone buzz with *"Did you just text Alex asking for gift cards?"*
and see the verdict flip when they answer.

## What changed from v1 and why

| v1 | v2 | Why |
|---|---|---|
| CENG 2 builds the scam dataset because "T-Mobile requires teams to make their own data" | T-Mobile **provides** a synthetic message set, a taxonomy and a baseline classifier. CENG 2 builds the **eval harness** (we must show we beat the baseline), **call/voice and multi-step scenarios** the set lacks, and the demo run-sheet | Sponsor page, checked 2026-11-08. "Detection accuracy" is a judging criterion, so numbers against their baseline are the strongest evidence we can show |
| "Challenge" = challenge the suspicious sender | "Challenge" = **challenge the claim, out-of-band**: ask the real contact via their known-good handle. Asking the sender for a safe word is opt-in only | Replying to a scammer confirms the number is live and invites more attacks. The out-of-band check is also the more novel part |
| Verify through another channel = voice callback | Must-have = **iMessage via Photon** to the trusted contact. Voice callback stays a stretch goal | Photon voice is SIP-only, with no speech-to-text and SDK call control "coming soon". iMessage is Photon's strongest surface and is demoable live |
| Speech-to-text feeds the agent | Call scenarios use scripted, timed transcripts in the UI. Live STT is a stretch (browser Web Speech API or Nemotron Nano Omni audio input, to be verified) | De-risks the must-have demo |
| — | **Privacy ledger + local-first triage**: obviously safe messages never leave the device, PII is redacted before the cloud, and the verdict shows exactly what left the phone | "Security and privacy" is a judging criterion, and "privacy by design" is in the brief |
| — | **Honest confidence**: probability from summed log-odds evidence, an uncertainty band, every reason with its weight, and calibration measured in the eval | "Honest confidence" is in the brief, and it's what makes judges trust the number |
| — | **Forward-to-check**: forward any text to Beacon's iMessage number and get a verdict back, with no app install | Usability and impact. It works on any phone today |
| — | **Prompt injection as a signal**: a message that tries to steer an AI is itself strong scam evidence | Creativity and security. A small change with an interesting story |
| — | **Spanish-language** scenarios and verdicts | Impact for the Dallas audience. Low cost if prompts allow it |
| CENG 1 = channels + voice | CENG 1 = **server + channels** (systems). Lead owns `packages/shared` contracts | The server is systems work, and someone has to own the integration seam |

## Scope

**Must-have (demo-critical):** fake scam → local triage → Nemotron analysis →
out-of-band verification (simulated in mock mode, real iMessage live) → verdict
with reasons, band and privacy ledger → recovery checklist, all on the phone UI.
Plus an eval report against T-Mobile's baseline.

**Should:** incoming-call screen with scripted cloned-voice scenario; forward-to-check
over iMessage; Spanish; simple mode for older users; PWA on a real phone.

**Stretch:** live call (SIP or browser STT); Nano Omni audio analysis; guardian
view; calibrated weights (Platt scaling) from T-Mobile data; embedding similarity.

**Out of scope:** real carrier integration, reading the OS SMS inbox (iOS doesn't
allow it — that's why forward-to-check and the Beacon line exist), and real people's data.

## Timeline (24 h; adjust to the real schedule)

| Hour | Everyone | Checkpoint |
|---|---|---|
| 0–1 | Clone, `pnpm install`, `pnpm dev`, read your lane's `AGENTS.md`. Get an NVIDIA key and a Photon project; drop T-Mobile data in `data/tmobile/` | Everyone sees a verdict in mock mode |
| 1–6 | Build the lane **Must** lists | **H6:** real Nemotron in `analyze`; iMessage verify round-trip to a teammate's phone; verdict sheet; first eval numbers |
| 6–12 | Integrate; fix seams; demo run-sheet | **H12:** dry run #1 of `docs/DEMO.md` |
| 12–18 | Accuracy push (eval → prompts/weights), UI polish, call screen | **H18:** dry run #2; eval beats baseline |
| 18–20 | Last features | **H20: feature freeze** |
| 20–22 | Record backup demo video, slides (eval + calibration chart), Devpost | Backup video exists |
| 22–24 | Rehearse. Bug fixes only | 3 clean run-throughs |

## Risks

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi / NVIDIA API down | Mock brain is the default and fully demoable; simulator contacts; backup video |
| Photon iMessage line not provisioned in time | Terminal provider + simulator verification; the demo console's "reply as Mom" |
| Nemotron returns malformed JSON / slow | zod validation, 12 s timeout, one retry, fall back to mock and still give a verdict |
| T-Mobile data format surprises | Adapter with a column-mapping file; library eval works without it |
| Merge chaos with 4 people + agents | Lanes are disjoint directories; contracts change only via `contract:` PRs; CI on every PR |
| Overclaiming in the pitch | Every claim in `docs/JUDGING.md` points to something we can show |
