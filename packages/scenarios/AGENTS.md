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
  fictional ones (for toll/delivery, a fictional agency like "MetroTag" on `metrotag.example`).
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
- [x] ~20 scenarios: ≥1 per `ScamType` (except `none`/`other`), ≥5 legit controls
      (incl. hard negatives: a REAL bank alert from the bank's known number; a real 2FA
      text that doesn't ask you to share it; Mom from a new number who *confirms* it's her),
      ≥2 call scenarios with timed transcripts (cloned-voice grandson; fake bank fraud dept),
      ≥1 prompt-injection, ≥1 forwarded, ≥1 Spanish-language
- [x] Registry: ~6 trusted contacts (family ×3, bank, employer, pharmacy/doctor)
- [x] CLI: `list`, `fire <id>`, `demo` (cue mode: fires the `demo` run-sheet one per Enter key)
- [x] Eval harness (library first, then T-Mobile adapter)
- [ ] Tests: schema validity, unique ids, every ScamType covered (done); skeleton test stays green (4 new hard scenarios fail on the current agent, see Status)

**Should**
- [x] Taxonomy mapping T-Mobile → ours
- [ ] Offline augmentation script (Nemotron) to grow the synthetic set — reviewed by a human
- [ ] Cloned-voice demo audio: generate with TTS from **our own consenting voices only**

## Status
- **Library:** 27 scenarios in `src/library/` (`family`, `financial`, `lures`, `controls`), re-exported by `src/library.ts`. Every `ScamType` (except none/other) covered; 8 controls incl. hard negatives (real bank alert, real 2FA, sister bill-split, Mom-new-number that *confirms*); 2 timed call transcripts (grandson bail, fake bank fraud dept); injection, forwarded (event source becomes `forwarded`), Spanish (`es`), fictional-carrier SIM swap. `demo` run-sheet order lives in `DEMO_ORDER` in `src/library.ts` and matches `docs/DEMO.md`: toll-smish, mom-new-number-giftcards, mom-new-number-confirmed, grandson-bail-call (`mom-dinner-legit` is the pre-flight check).
- **Registry:** 6 contacts in `src/contacts.ts` (mom, sam, ana, bank, employer, pharmacy).
- **CLI** (`src/cli.ts`, `src/runner.ts`): `pnpm scenarios` (list), `pnpm scenario <id> [--server URL]`, `pnpm -F @beacon/scenarios demo` (Enter-per-cue), `pnpm eval [--dataset library|tmobile] [--provider mock|nvidia] [--limit N]`. Server URL: `--server` > `BEACON_SERVER_URL` > http://localhost:8787. Server down gives a friendly message (exit 2).
- **Eval** (`src/eval/`): pure metric math in `metrics.ts` (tested), `run.ts` runs `createAgent` in-process (fresh agent per item), `report.ts` writes `reports/eval-<dataset>.md|json`. Reports accuracy, lenient + strict P/R/F1, 3-way confusion, per-type recall, ECE + reliability, p50/p95, % on-device, baseline comparison.
- **T-Mobile adapter** (`src/tmobile/`): own CSV parser, JSONL, `mapping.json` (README in `data/tmobile/`), keyword taxonomy table in `taxonomy.ts` (edit once the real taxonomy is known). Missing data prints a message and exits 0. Fixture-tested.
- **Tests:** `pnpm -F @beacon/scenarios test`. `test/skeleton.test.ts` (scenario x agent) is unchanged.
- **Known gaps:** against the current agent, 4 skeleton tests fail by design (ground truth NOT weakened): `ana-hospital-wallet` (verification not `denied`), `bank-fraud-dept-call` (verification `unclear`), `revenue-dept-arrest` and `forwarded-irs-style-notice` (labelled suspicious, expected scam). `--provider nvidia` untested here (no key). Still open: Nemotron augmentation script, cloned-voice TTS audio.

## Requests from other lanes
_(append here)_
