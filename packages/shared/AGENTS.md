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

- **Phone → shared:** a stream-level reset notification (e.g. a `{ type: "reset" }` trace body,
  or a second SSE event name) so every client clears state after `POST /api/reset`. Today the
  phone uses a same-origin BroadcastChannel, which doesn't reach other devices. *Open.*
- **Channels → shared:** optional `forwardedBy?: Party` on `IncomingEvent`/`NewEvent`, so a
  forwarded message keeps the original sender in `from`. Today `from` is the forwarder, and the
  agent skips sender-registry signals for `source: "forwarded"`. *Open.*
- **Phone → shared:** document `?since` semantics. *Done:* exclusive, seq starts at 1 (see `api.ts`).
