# CLAUDE.md

@AGENTS.md

## Claude Code specifics

The rules above apply to you in full. These notes only cover how to work
efficiently with Claude Code in this repo.

- **Scope yourself to one lane per session.** Start by reading the lane's
  `AGENTS.md` (e.g. `@packages/agent/AGENTS.md`). If the task spans lanes, say so
  and propose splitting it — don't silently edit across lanes.
- **Verify, don't assume.** Before saying something works, run it: `pnpm check`, and for
  UI work `pnpm dev` + fire a scenario (`pnpm scenario mom-new-number-giftcards`).
  For the phone UI, take a Playwright screenshot at 390×844 and look at it.
- **Subagents / workflows.** Use parallel subagents for independent, lane-disjoint
  work (e.g. "write 10 new scenarios" ∥ "add 3 recovery playbooks"). Prefer cheaper
  models (Sonnet/Haiku) for mechanical work — fixtures, data generation, docs, test
  scaffolding — and the strongest model for the agent's prompts and scoring, the
  phone UI's look and feel, and cross-lane reviews. Never let two agents edit the same
  file at once; use worktrees if they must overlap.
- **Contract changes** (`packages/shared`) → stop and propose the diff to the user first.
- **Commits**: conventional prefix, one concern, and run `pnpm check` first. Don't
  commit `.env`, `data/tmobile/*` or `reports/*`.
- **Don't burn the demo.** Never change `docs/DEMO.md` scenarios or the `demo`-tagged
  scenarios without updating the run-sheet in the same PR.
