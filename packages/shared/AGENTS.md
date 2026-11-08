# packages/shared — Contracts

**Owner:** Lead · **Review required** from every lane the change touches.

The only cross-lane API. Zod schemas (runtime validation at every boundary) +
inferred TypeScript types + a few pure helpers (`confidence.ts`).

| File | Contract |
|---|---|
| `events.ts` | `IncomingEvent` — a text/call/voicemail that arrived (untrusted) |
| `contacts.ts` | `TrustedContact` — who the user trusts + the known-good way to reach them |
| `verification.ts` | Out-of-band verification request / reply / outcome |
| `verdict.ts` | `Signal` (log-odds evidence), `Verdict`, `RecoveryStep`, `PrivacyReport` |
| `trace.ts` | `TraceEvent` — the live stream the phone renders |
| `scenario.ts` | `Scenario` — scripted attacks / controls with ground truth |
| `api.ts` | HTTP routes + payloads of apps/server |
| `agent.ts` | `AgentDeps` / `AgentConfig` / `Agent` — the agent ↔ host seam |
| `taxonomy.ts` | `ScamType` + UI labels |
| `confidence.ts` | Thresholds, logistic/logit, label/confidence helpers |

## Rules
- No runtime dependencies beyond `zod`. No I/O, no env access, no Node-only APIs
  (the phone imports this in the browser).
- Additive changes preferred (new optional field, new enum member).
- Every change: run `pnpm check` at the root — all lanes compile against this.
- See root `AGENTS.md` → "Changing the contracts".

## Requests from other lanes
_(append here: who, what, why)_
