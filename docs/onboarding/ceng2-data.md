# CENG 2: Data, simulation and eval

**You own:** `packages/scenarios`: the scripted attacks the demo fires, the
trusted-contact registry, and the eval that proves we beat T-Mobile's baseline.
**Lane brief and backlog:** `packages/scenarios/AGENTS.md`

## Accounts and data
- **T-Mobile track data** (synthetic messages, taxonomy, baseline classifier): put the
  files in `data/tmobile/` and write `mapping.json` (format in `data/tmobile/README.md`).
  The folder is gitignored, so the data stays on your machine unless its license says otherwise.

## First hour
1. `pnpm scenarios` to list the library; `pnpm dev`, then `pnpm scenario <id>` to watch one run.
2. Add the T-Mobile data and run `pnpm eval --dataset tmobile`. Share the first numbers with SWE 1.
3. Read `docs/DEMO.md`: the `demo`-tagged scenarios must be convincing and must never flake.

## Your checkpoints
- **H6:** first eval numbers vs. the baseline.
- **H18:** we beat the baseline. Export the eval report for the slides
  (`reports/eval-tmobile.md`), including the calibration table.
- **H20:** record the backup demo video with SWE 2.

## Rules
- Synthetic only: 555-01xx numbers, `*.example` domains, fictional orgs, no real carrier names.
- Never weaken a scenario's expected answer to make a test pass. Flag it to SWE 1 instead.
- Cloned-voice audio: use only voices from teammates who consent.

## Tell your agent (for tools without /onboard)
> I'm CENG 2 on Beacon. Read AGENTS.md, docs/onboarding/ceng2-data.md and
> packages/scenarios/AGENTS.md, run `node scripts/setup.mjs --check`, then brief me in 5 lines and
> propose the next unchecked backlog item.
