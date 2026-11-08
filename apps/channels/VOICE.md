# Voice path (stretch) - design note

Status: **design only, nothing implemented.** Read this before spending hackathon hours on it.

## What is verified (from sponsor docs, see `docs/research/sponsors.md`)
- Photon voice is **SIP-only**: `sip.spectrum.photon.codes`, TLS on port 5061, with the
  Spectrum project ID / secret used as SIP credentials.
- Media is **RTP, unencrypted**.
- The Spectrum SDK has **no speech-to-text** and SDK-level call control is "coming soon".
  `spectrum-ts@12.15.0` has a `voice` *content* type (voice memos/attachments), not live calls.

## What is NOT verified
- That we can register and receive/place a call within the hackathon window.
- Audio input on the hosted `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` endpoint. The model card
  says audio/image/video input; the hosted NIM API may only accept text+image. **Test with one curl first.**
- Whether iMessage voice memos arrive as `content.type === "voice"` with readable bytes on the cloud line.

## Option A - iMessage voice memos (recommended stretch, ~1-2h)
`user sends voice memo -> Spectrum message (voice content) -> bytes -> transcript -> POST /api/events (kind "voicemail")`
1. In `spectrum-transport.ts` handle `content.type === "voice"` (see `@spectrum-ts/core` `asVoice`/`Voice`;
   it exposes `mimeType` and a read/stream accessor like attachments).
2. Transcribe: (a) Nemotron Nano Omni audio input if the hosted API accepts it; else (b) any STT behind an
   env-gated adapter (`STT_PROVIDER`), with a canned transcript in mock mode so CI and the demo stay offline.
3. Post `NewEvent { kind: "voicemail", source: "photon", body: transcript, transcript?: [...] }`.
Why first: reuses the existing line, no SIP, demoable on a real phone, works with the mock.

## Option B - live SIP call (high risk, 6h+)
`caller -> Photon SIP -> our SIP UA (RTP in) -> VAD/chunking -> STT -> POST /api/events (kind "call", transcript segments)`
- Needs a SIP user agent library (Node options are thin; a small Python/`pjsua2` sidecar is likely easier) that
  does TLS registration on 5061 and RTP (G.711) decode, plus streaming STT. Unencrypted RTP means: do not
  route anything sensitive and say so in the privacy story.
- Latency budget for "live" scam-call warnings: chunk every ~3s, run triage locally, escalate to Nemotron only on a hit.

## Option C - scripted calls (already planned, zero risk)
The phone UI plays scripted call transcripts from `packages/scenarios`. Use this for the demo regardless;
treat A/B as a bonus we can truthfully label "prototype".

## Decision rule
Do A only after all Must + Should items in `AGENTS.md` are done and the audio curl in "NOT verified" succeeds
(or an STT adapter is trivial). Do B only if a sponsor mentor confirms the SIP flow works end to end.
