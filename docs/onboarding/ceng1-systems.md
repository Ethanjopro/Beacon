# CENG 1: Server and channels

**You own:** `apps/server` (the host: it runs the agent, streams to the phone and
relays verification) and `apps/channels` (Photon iMessage: the live "real Mom's phone
buzzes" moment). **Lane briefs:** `apps/server/AGENTS.md`, `apps/channels/AGENTS.md`

## Accounts and keys
- **Photon:** app.photon.codes → create a project → copy the project ID and secret into
  `.env` as `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET`, and set `CHANNELS_PROVIDER=imessage`.
  Photon's Discord can help get an iMessage line provisioned quickly. Ask early, it's the long pole.
- **Live "Mom":** set `BEACON_VERIFY_MOM=imessage:+1XXXXXXXXXX` (a teammate's real
  number) in **your `.env` only**. Never commit real numbers.

## First hour
1. `pnpm dev`, then `pnpm dev:channels` (terminal mode: type a message to simulate an incoming text).
2. Get the Photon project and line requested.
3. Do one real round-trip: fire `mom-new-number-giftcards` → the teammate's phone gets
   Beacon's question → their "No" flips the verdict.

## Your checkpoints
- **H6:** real iMessage verification round-trip works.
- **Always:** the server never crashes during the demo. Test restarts and reconnects.

## Stretch
Voice: read `apps/channels/VOICE.md` first. Photon voice is SIP-only, with no speech-to-text.

## Tell your agent (for tools without /onboard)
> I'm CENG 1 on Beacon. Read AGENTS.md, docs/onboarding/ceng1-systems.md, apps/server/AGENTS.md
> and apps/channels/AGENTS.md, run `node scripts/setup.mjs --check`, then brief me in 5 lines and
> propose the next unchecked backlog item.
