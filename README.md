# Beacon

**Scam detection tells you it's *probably* fake. Beacon *finds out*.**

Beacon is a scam-defense agent for your phone. When a suspicious text or call
arrives, it checks it locally, reasons about it with NVIDIA Nemotron, and then
**asks the real person**. If "Mom" texts from a new number asking for gift
cards, Beacon messages the real Mom on the number it already knows, over
iMessage (Photon). You get a verdict with honest confidence, every reason behind
it, a privacy ledger of what left your phone, and a recovery checklist.

Built at HackUTD 2026 for the T-Mobile track.

## 👋 Teammates: start here

```bash
git clone https://github.com/Ethanjopro/Beacon && cd Beacon
node scripts/setup.mjs
```

Then **open your AI coding agent in this folder and say "onboard me"**
(Claude Code: `/onboard`). It figures out your role, checks your setup, briefs you on
your part of the project and starts your first task. Later, say **"what's next?"**
(`/next`) to pick up work and **"ship it"** (`/ship`) to open a PR.

Nothing installed? On GitHub: **Code → Codespaces → Create codespace**. Everything
sets itself up in the browser. Role guides: [docs/onboarding/](docs/onboarding/README.md).

## Quickstart

```bash
pnpm dev                                   # server :8787 + phone UI :5173
pnpm scenario mom-new-number-giftcards     # in another terminal
```

Open http://localhost:5173. No API keys are needed: it runs in mock mode by
default. `.env` (created by setup) holds keys for real Nemotron and iMessage.

## Repo

| Path | What |
|---|---|
| `packages/shared` | Contracts (zod) shared by every component |
| `packages/agent` | The agent pipeline: triage → Nemotron → out-of-band verification → verdict → recovery |
| `packages/scenarios` | Synthetic scam library, trusted contacts, scenario runner, eval harness |
| `apps/server` | HTTP + SSE host and verification broker |
| `apps/channels` | Photon Spectrum bridge (iMessage) |
| `apps/phone` | Mobile-first app and demo console |

- Contributing (humans and AI agents): **[AGENTS.md](AGENTS.md)**
- Plan: [docs/PLAN.md](docs/PLAN.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Judging map: [docs/JUDGING.md](docs/JUDGING.md) · Demo run-sheet: [docs/DEMO.md](docs/DEMO.md)
