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
- [ ] Split the skeleton in `src/index.ts` into the stages above (keep exports)
- [ ] PII redaction + privacy ledger (`Verdict.privacy`, `privacy` trace)
- [ ] Triage rules covering every `ScamType`; lookalike-domain checks
- [ ] Nemotron client (chat completions + tools, zod-validated JSON, timeout, retry, fallback)
- [ ] Deterministic mock brain with the same output shape (default; CI)
- [ ] Challenge/verify per protocol; reply interpretation (rules + fast model)
- [ ] Score fusion with bounded LLM weight + honest band
- [ ] Recovery playbooks for every `ScamType` × exposure
- [ ] Unit tests per stage; `packages/scenarios/test` stays green

**Should**
- [ ] Thread context (earlier messages in the same `threadId`)
- [ ] `nemotron-3.5-content-safety` pass for injection / manipulation
- [ ] Calibrate weights on the T-Mobile set with CENG 2 (Platt scaling on the fused logit)

**Stretch**
- [ ] Incremental call analysis as transcript segments arrive (rising `score` traces)
- [ ] Voice-clone cues via `nemotron-3-nano-omni` audio input (verify the API first)
- [ ] Embedding similarity to the library via `nemotron-3.5-embed-1b`

## Status
- Walking skeleton: rules-only triage, alias-based verification, rules-only reply
  interpretation, 2 generic recovery steps. No LLM yet.

## Requests from other lanes
_(append here)_
