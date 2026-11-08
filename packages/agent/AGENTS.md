# packages/agent — Agent brain

**Owner:** SWE 1 · **Judged on:** detection accuracy, honest confidence, NVIDIA usage, privacy.

A pure TypeScript library. Public API (keep stable — server and eval import it):

```ts
createAgent(deps: AgentDeps, overrides?: Partial<AgentConfig>): Agent
agent.run(event: IncomingEvent): Promise<Verdict>
interpretReply(request, result, at): VerificationOutcome
```

It never reads `process.env`, opens sockets (except the LLM HTTP client), or
touches the filesystem. Hosts pass config in (`agentConfigFromEnv` in shared).

## Pipeline

```
ingest ─▶ triage ─▶ analyze ─▶ challenge ─▶ verify ─▶ verdict ─▶ recover
 redact    local      Nemotron    extract the   ask the real   fuse log-odds   playbook by
 PII       rules      + tools     claim, pick   contact via    → pScam, band,  scamType ×
 (ledger)  (no net)   (cloud)     the contact   deps.verify    label           exposure
```

- **ingest**: normalize; redact PII (phones, emails, card numbers w/ Luhn, SSNs,
  OTP codes, addresses best-effort) into placeholders; replace contact names with
  relationships before anything goes to the cloud. Emit a `privacy` trace.
- **triage**: deterministic rules → `Signal`s with log-odds weights. Runs locally.
  If pScam < `config.skipCloudBelow`, skip `analyze` (the message never leaves the device).
- **analyze**: Nemotron (`config.model`) with tool calling. Tools: `lookup_contact`
  (registry by alias, no safe words), `check_link` (lookalike/punycode/TLD/domain-vs-registry),
  `search_scam_library` (similar known scams). Output validated with zod:
  `{ scamType, claimedContactId?, claim, pScam, signals[] }`. LLM signal weights bounded to ±2.5
  so one model opinion can't dominate.
- **challenge**: if the message claims to be a trusted contact (or org) and the sender
  isn't one of their known handles → build a `VerificationRequest` to the contact's
  `verifyVia` handle. The question must **not** contain links or numbers from the message.
  Never message the sender unless `config.allowSenderChallenge`.
- **verify**: emit `verification.requested` → `await deps.verify(req)` → `interpretReply`
  (rules first, fast model for ambiguous text) → emit `verification.resolved`.
  `denied` is the strongest scam evidence we have; `confirmed` strongly lowers pScam.
- **verdict**: pScam = logistic(prior + Σ weights). `band` widens when evidence
  sources disagree or verification is missing. Label via `labelFor` in shared.
- **recover**: playbooks per `ScamType` × `exposure` (clicked / replied / shared code /
  sent money / shared info). Only trusted resources: forward to **7726**, the bank's
  number **on the back of the card**, reportfraud.ftc.gov, identitytheft.gov, ic3.gov,
  credit freezes (Equifax/Experian/TransUnion). Never a number/link from the message.

Every stage emits `stage` started/completed (or skipped with a note), plus short
human `thought` lines the phone shows ("Mom doesn't text from this number — asking the real Mom").

## Failure policy (demo safety)
Any LLM error/timeout (12 s) → one retry → fall back to the mock brain, emit
`error` + a `thought` ("Cloud model unavailable — using on-device analysis"), and still
return a verdict. `run()` must never throw.

## Suggested layout
```
src/index.ts              createAgent: orchestrates stages
src/pipeline/{ingest,triage,analyze,challenge,verify,score,recover}.ts
src/llm/{client,mock,prompts}.ts   OpenAI-compatible fetch client w/ tool loop; mock brain
src/tools/{contacts,links,library}.ts
src/privacy/redact.ts
test/*.test.ts
```

## Backlog
**Must**
- [x] Split the skeleton in `src/index.ts` into the stages above (keep exports)
- [x] PII redaction + privacy ledger (`Verdict.privacy`, `privacy` trace)
- [x] Triage rules covering every `ScamType`; lookalike-domain checks
- [x] Nemotron client (chat completions + tools, zod-validated JSON, timeout, retry, fallback)
- [x] Deterministic mock brain with the same output shape (default; CI)
- [x] Challenge/verify per protocol; reply interpretation (rules + fast model)
- [x] Score fusion with bounded LLM weight + honest band
- [x] Recovery playbooks for every `ScamType` × exposure
- [x] Unit tests per stage; `packages/scenarios/test` stays green

**Should**
- [x] Thread context (earlier messages in the same `threadId`)
- [ ] `nemotron-3.5-content-safety` pass for injection / manipulation
- [ ] Calibrate weights on the T-Mobile set with CENG 2 (Platt scaling on the fused logit)

**Stretch**
- [ ] Incremental call analysis as transcript segments arrive (rising `score` traces)
- [ ] Voice-clone cues via `nemotron-3-nano-omni` audio input (verify the API first)
- [ ] Embedding similarity to the library via `nemotron-3.5-embed-1b`

## Status
Staged pipeline is in. `pnpm -F @beacon/agent test` (108 tests) + `pnpm -F @beacon/scenarios test` green.

**Do first (hour 0, before tuning anything):**
- [ ] **Run the real Nemotron path once with a key.** It has only been tested against a fake fetch:
      `<think>` output, tool calling on `nemotron-3-super`, and whether 2048 max_tokens is enough are unverified.
- [ ] Measure live latency. With Nemotron, verification starts only after analysis returns (about 10–30 s),
      which slows demo Act 2. Consider asking the contact *in parallel* with analysis when triage already
      found a claimed contact.
- [ ] Weights are hand-set; 27/27 on the library is a sanity check, not calibration. Calibrate on the
      T-Mobile set with CENG 2 (`pnpm eval --dataset tmobile`).
- [ ] `sim-swap-carrier-support` is typed `account_takeover_otp` (the `otp_request` rule at 2.2 outweighs
      `carrier_account_threat` at 1.4), but the scenario expects `carrier_impersonation`, so the user gets
      the OTP playbook. Decide which is right.
- User-facing copy never guesses pronouns ("the real Mom denied sending it"). Keep it that way.

**Layout (actual)**
```
src/index.ts                 createAgent (orchestrator, thread memory, never-throw wrapper), re-exports interpretReply
src/pipeline/context.ts      RunContext + addSignal (emits signal → score) + stage/thought helpers
src/pipeline/{ingest,triage,analyze,challenge,verify,verdict,recover}.ts   one file per stage
src/pipeline/score.ts        Evidence (dedupe by id), PRIOR −1.5, boundLlmWeights (±2.5 each AND total), bandFor
src/triage/rules.ts          all on-device rules (EN + basic ES) — the place to tune detection
src/tools/{contacts,links,library,index}.ts   claim detection, offline link checks, scam library, tool executor + schemas
src/llm/{client,prompts,schema,mock}.ts       fetch client + tool loop, prompts, zod output + tolerant JSON, mock brain
src/privacy/{redact,ledger}.ts                PII redaction, safe-word scrub, privacy ledger
```

**How to run / test**
- Mock (default): nothing to configure. `createAgent(deps, { llmProvider: "mock" })`.
- Nemotron: host passes `agentConfigFromEnv(process.env)` with `LLM_PROVIDER=nvidia` + `NVIDIA_API_KEY`.
- Tests can inject `createAgent(deps, overrides, { fetch, llmTimeoutMs })` (3rd param = `AgentInternals`).
- Quick tuning loop: add a case to `test/triage.test.ts` (LURES or "hard negatives"), run `pnpm -F @beacon/agent test`.

**Behaviour worth knowing**
- Cloud gate: pScam < `skipCloudBelow` → analyze skipped ("never left your phone"); ≥ `skipCloudAbove` with no
  trusted-contact claim → skipped ("decided on this device"). A claim always gets analyzed + verified.
- Ordinary texts from unknown numbers get `no_red_flags` (−1.5) so they stay on-device; links alone don't block it.
  Short-code senders (5–6 digits) get `short_code_sender` (−0.5) instead of `unknown_sender` (+0.3).
- Claims: display name, self-identification ("it's Mom", "soy yo"), org name anywhere (not generic "your bank"),
  "Grandma, it's me" → the contact whose alias is grandson/granddaughter. LLM `claimedContactId` (CONTACT_n) also counts.
- Challenge threshold `CHALLENGE_MIN_PSCAM = 0.2`; question built only from fixed phrases + `stripUnsafe`.
- Verification weights: denied +4, confirmed −5, unclear/timeout +0.3, unreachable 0 (band widens).
- LLM sees: redacted text, sender facts (known? email? short code?), contact refs + relationships, triage signal ids.
  Never names, handles or safe words. `lookup_contact` returns a projection only.
- Privacy: `sentToCloud` flips true the moment a request is dispatched (even if it then fails). Mock → always false.
- Safe word in a message → `knows_safe_word` (−2.0), compared locally; scrubbed from traces, replies and the LLM.
- Thread memory is in-process (last 5 messages per `threadId`, 200 threads); earlier rule hits count at half weight.
  Turn it off with `createAgent(deps, cfg, { threadMemory: false })` (eval: scenarios share sender handles).
  It is NOT cleared by `POST /api/reset` — the server should recreate the agent on reset.
- `scrubSafeWords(text, contacts)` is exported for hosts that trace message text themselves (`event.received`).

**Known gaps / next**
- Weights are hand-set against the anchors in `triage/rules.ts`; calibrate on the scenario library + T-Mobile set
  once `pnpm eval` exists (Platt scaling on the fused logit is the plan).
- Obvious scams (e.g. the "Mom + gift cards" demo) are already ~99% after triage, before Mom answers — honest,
  but the demo script's "meter climbs to *suspicious*" beat should be reworded ("Beacon is nearly sure — and then it finds out").
- `allowSenderChallenge` is respected (we never contact the sender) but the opt-in sender safe-word challenge isn't built.
- Content-safety pass, incremental call analysis and embeddings are not started.
- Nemotron path is only tested against a fake fetch; run one live smoke test with a real key before the demo
  (watch for `<think>` output and tool-call support on the chosen model).

## Requests from other lanes
_(append here)_
