# Sponsor research (gathered 2026-11-08)

Re-verify anything marked ⚠ before relying on it in the demo.

## T-Mobile track (HackUTD sponsor tracks page)
Source: https://hackutd-2026.notion.site/Sponsor-Tracks-3bd63cec7740808c9e89e4e25cee23e7

> Protect customers from scams and fraud in ways we haven't thought of yet.
>
> **You build:** any approach: prevention, real-time protection, education, new
> security features. Scam detection is a core piece, not the whole product. Go beyond
> classification: safeguards and customer-facing experiences. Clear next steps,
> honest confidence, privacy by design.
>
> **We provide:** synthetic message set · scam taxonomy · baseline classifier
>
> **Judges look for:** creativity · impact · usability · security and privacy · detection accuracy

(At the time of reading, the page listed only the T-Mobile track.)

## NVIDIA NIM / Nemotron
- Hosted API: `https://integrate.api.nvidia.com/v1`, OpenAI-compatible
  (`POST /chat/completions`, `tools`, `response_format`). Key from build.nvidia.com,
  free tier available. Env: `NVIDIA_API_KEY`.
- Models seen on `GET /v1/models` (2026-11-08), relevant subset:
  - `nvidia/nemotron-3-super-120b-a12b`: reasoning + tool calling (our deep model)
  - `nvidia/nemotron-3-ultra-550b-a55b`: largest
  - `nvidia/nemotron-3.5-lightning-30b-a3b`: fast (our triage/reply model) ⚠ confirm tool support
  - `nvidia/nemotron-3.5-bolt-e4b`: small ⚠ capabilities unverified; don't claim on-device
  - `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`: text + image + **audio** + video input
    (per secondary sources; ⚠ verify audio input on the hosted API)
  - `nvidia/nemotron-3.5-content-safety`, `nvidia/llama-3.1-nemotron-safety-guard-8b-v3`: safety
  - `nvidia/nemotron-3.5-embed-1b`, `nvidia/nemotron-3.5-embed-8b`: embeddings
  - `nvidia/ai-synthetic-video-detector`: deepfake video detection (out of scope, but a good Q&A answer)
- ⚠ Some Nemotron reasoning models toggle reasoning via the system prompt or a
  request parameter. Check the model card and keep `analyze` output strict JSON.

## Photon (Spectrum)
- npm `spectrum-ts` (v12.15.0 on 2026-11-06): TypeScript, works under Node 22 (import verified).
  Providers: `imessage` (cloud), `whatsapp-business`, `telegram`, `slack`, `terminal`
  (no creds), plus `@spectrum-ts/imessage-local` (macOS, explicit install).
- Creds: project ID + secret from app.photon.codes (`SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`).
- Loop: `for await (const [space, message] of app.messages) { … message.reply(…) }`;
  `space.send(…)`; `space.responding(fn)` shows typing. Webhooks: `app.webhook(req, handler)`.
- **Voice**: SIP only. Server `sip.spectrum.photon.codes` (TLS 5061), project ID/secret
  as SIP creds, RTP audio (unencrypted), needs an iMessage line. No STT/TTS in the SDK,
  calls don't appear in `app.messages`, SDK call control "coming soon".
- Docs: https://photon.codes/docs/ · voice: https://photon.codes/docs/spectrum-ts/providers/voice
- Photon runs hackathon prize programs and credits; check their Discord for HackUTD terms.

## Useful facts for the pitch
- FTC: consumers reported losing **$12.5B** to fraud in 2024 (published March 2025).
  ⚠ Check whether the 2025 figure has been released and use the newest one.
- US carriers accept spam reports by forwarding texts to **7726** (SPAM).
- Official reporting: reportfraud.ftc.gov · identitytheft.gov · ic3.gov (FBI).
