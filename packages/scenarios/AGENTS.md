# packages/scenarios — Data & simulation

**Owner:** CENG 2 · **Judged on:** detection accuracy (the eval), and convincing demo attacks.

Synthetic scam library + trusted-contact registry + scenario runner + eval harness.
Public API (server imports it — keep stable):

```ts
scenarios: Scenario[]
trustedContacts: TrustedContact[]
listScenarios(): ScenarioSummary[]
getScenario(id): Scenario | undefined
scenarioToEvent(s): NewEvent
```

## Data rules
- **Synthetic only.** Fictional names; phone numbers in 555-01xx; orgs on `*.example`
  domains (e.g. "First Lone Star Bank"). Never real brands as senders — use plausible
  fictional ones (for toll/delivery, a fictional "TxTag"-style name is fine as long as
  it's not presented as the real company).
- Every scenario has ground truth (`expected.label`, `expected.scamType`, optional
  `expected.verification`).
- Tags: `demo` (on the stage run-sheet), `control` (legit), `hard` (tricky), `injection`,
  `call`, `es` (Spanish), `forwarded`.

## T-Mobile data
T-Mobile provides a synthetic message set, a taxonomy and a baseline classifier.
Drop them in `data/tmobile/` (gitignored — see its README). Write an adapter in
`src/tmobile/` that handles CSV or JSONL with a column-mapping file
`data/tmobile/mapping.json`, and maps their taxonomy onto our `ScamType`.

## Eval harness (`pnpm eval`)
`pnpm eval [--dataset library|tmobile] [--provider mock|nvidia] [--limit N]`
- Runs the agent on each item (verification: scripted replies for the library,
  `timeout` for datasets without contacts).
- Metrics: accuracy; precision/recall/F1 for scam vs. not; 3-way confusion matrix;
  per-`ScamType` recall; **calibration** (ECE, 10 bins, reliability table);
  latency p50/p95; % of messages that never left the device.
- **Baseline comparison:** if T-Mobile's baseline predictions/classifier are available,
  score them on the same items and print both side by side.
- Writes `reports/eval-<dataset>.md` and `.json` (gitignored; paste highlights into the deck).

## Backlog
**Must**
- [ ] ~20 scenarios: ≥1 per `ScamType` (except `none`/`other`), ≥5 legit controls
      (incl. hard negatives: a REAL bank alert from the bank's known number; a real 2FA
      text that doesn't ask you to share it; Mom from a new number who *confirms* it's her),
      ≥2 call scenarios with timed transcripts (cloned-voice grandson; fake bank fraud dept),
      ≥1 prompt-injection, ≥1 forwarded, ≥1 Spanish-language
- [ ] Registry: ~6 trusted contacts (family ×3, bank, employer, pharmacy/doctor)
- [ ] CLI: `list`, `fire <id>`, `demo` (cue mode: fires the `demo` run-sheet one per Enter key)
- [ ] Eval harness (library first, then T-Mobile adapter)
- [ ] Tests: schema validity, unique ids, every ScamType covered; skeleton test stays green

**Should**
- [ ] Taxonomy mapping T-Mobile → ours
- [ ] Offline augmentation script (Nemotron) to grow the synthetic set — reviewed by a human
- [ ] Cloned-voice demo audio: generate with TTS from **our own consenting voices only**

## Status
- 3 seed scenarios, 3 contacts, CLI `list`/`fire`; eval is a stub.

## Requests from other lanes
_(append here)_
