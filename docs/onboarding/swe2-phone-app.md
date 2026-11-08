# SWE 2: Phone app

**You own:** `apps/phone`, everything the judges see. You also co-own the demo
(`docs/DEMO.md`). **Lane brief and backlog:** `apps/phone/AGENTS.md`

## Accounts and keys
None needed. Open **http://localhost:5173/?mock=1** to work on the UI with canned
data and no server.

## First hour
1. `pnpm dev`, open http://localhost:5173, and fire scenarios from the demo console
   (`#/console`, or press `d`).
2. Try it on your real phone: same Wi-Fi, open `http://<your-laptop-ip>:5173`.
3. Read `docs/DEMO.md` end to end. Every screen in it must look flawless.

## Your checkpoints
- **H12:** demo dry run #1 runs on the real server stream, not mock.
- **H20:** UI freeze. Record the backup demo video with CENG 2.

## Rules of thumb
- No T-Mobile magenta or logo; Beacon has its own look.
- Check every change at 390×844 and in the desktop phone frame. Your agent can take
  Playwright screenshots.
- Show the work: every number on screen should explain itself on tap.

## Tell your agent (for tools without /onboard)
> I'm SWE 2 on Beacon. Read AGENTS.md, docs/onboarding/swe2-phone-app.md and
> apps/phone/AGENTS.md, run `node scripts/setup.mjs --check`, then brief me in 5 lines and
> propose the next unchecked backlog item.
