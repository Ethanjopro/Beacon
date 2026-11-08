# Onboarding: start here

You don't need anyone to walk you through this. Three steps:

1. **Get the code running** (about 5 minutes):
   ```bash
   git clone https://github.com/Ethanjopro/Beacon && cd Beacon
   node scripts/setup.mjs
   ```
   No Node? Install Node 22 from nodejs.org. Or skip local setup entirely:
   on GitHub, click **Code → Codespaces → Create codespace** and everything installs itself.
2. **See it work:** `pnpm dev`, open http://localhost:5173, then in a second terminal run
   `pnpm scenario mom-new-number-giftcards`.
3. **Open your AI coding agent in the repo folder and say "onboard me".** It will ask
   your role, check your setup, explain your lane, and start on your first task.
   Claude Code users can type `/onboard`.

## Pick your role

| Role | You own | Guide |
|---|---|---|
| **SWE 1** | Agent brain: detection, Nemotron, confidence, verification logic | [swe1-agent-brain.md](swe1-agent-brain.md) |
| **SWE 2** | Phone app: everything judges see | [swe2-phone-app.md](swe2-phone-app.md) |
| **CENG 1** | Server + Photon channels (iMessage, voice stretch) | [ceng1-systems.md](ceng1-systems.md) |
| **CENG 2** | Scenarios, trusted contacts, eval vs. T-Mobile baseline | [ceng2-data.md](ceng2-data.md) |

## Everyday loop

| You say to your agent | It does |
|---|---|
| "onboard me" / `/onboard` | Setup check, briefing on your lane, proposes your first task |
| "what's next?" / `/next` | Finds the next unchecked item in your lane's backlog and starts it on a new branch |
| "ship it" / `/ship` | Runs `pnpm check`, commits, pushes your branch, opens a PR |

Rules your agent already knows (from `AGENTS.md`): stay in your lane's folder, never commit
keys, everything must work without keys (mock mode), and run `pnpm check` before pushing.
