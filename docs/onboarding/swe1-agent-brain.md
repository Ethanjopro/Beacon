# SWE 1: Agent brain

**You own:** `packages/agent`. This is the most-judged code in the project:
detection accuracy, honest confidence, privacy, and how we use NVIDIA Nemotron.
**Lane brief and backlog:** `packages/agent/AGENTS.md`

## Accounts and keys
- **NVIDIA API key:** build.nvidia.com → sign in → any Nemotron model → "Get API Key".
  In `.env`: `LLM_PROVIDER=nvidia` and `NVIDIA_API_KEY=...`. Leave it as `mock` to work offline.

## First hour
1. `pnpm -F @beacon/agent test`, then read `packages/agent/src/index.ts` to see the stage order.
2. Run the eval in both modes and compare:
   `pnpm eval`, then the same with `LLM_PROVIDER=nvidia` in `.env`.
3. Fire `pnpm scenario mom-new-number-giftcards` with `pnpm dev` running, and watch your
   traces render on the phone. Each `thought` and `signal` you emit shows up there.

## Your checkpoints (docs/PLAN.md)
- **H6:** real Nemotron analysis works end-to-end; falls back to mock on failure.
- **H18:** `pnpm eval --dataset tmobile` beats T-Mobile's baseline (with CENG 2).

## Who you depend on
- **CENG 2:** scenarios and the eval harness. Tune against their numbers, and don't
  overfit to single scenarios.
- **CENG 1:** delivery of verification questions. You only call `deps.verify()`.
- **SWE 2:** renders your traces. Keep `thought` lines short and human.

## Tell your agent (for tools without /onboard)
> I'm SWE 1 on Beacon. Read AGENTS.md, docs/onboarding/swe1-agent-brain.md and
> packages/agent/AGENTS.md, run `node scripts/setup.mjs --check`, then brief me in 5 lines and
> propose the next unchecked backlog item.
