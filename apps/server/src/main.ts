import { agentConfigFromEnv, DEFAULT_SERVER_PORT } from "@beacon/shared";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { ElevenLabsPhotonCallback } from "./callback.js";

const env = process.env;
const port = Number(env.BEACON_PORT) || DEFAULT_SERVER_PORT;
const agentConfig = agentConfigFromEnv(env);
// Trusted registry: SQLite file at the repo root's data/ (gitignored). Delete it to reseed from the synthetic contacts.
const registryPath = env.REGISTRY_DB_PATH || fileURLToPath(new URL("../../../data/registry.sqlite", import.meta.url));

const elevenLabs = new ElevenLabsPhotonCallback({
  apiKey: env.ELEVENLABS_API_KEY,
  agentId: env.ELEVENLABS_AGENT_ID,
  phoneNumberId: env.ELEVENLABS_PHONE_NUMBER_ID,
  outboundUrl:
    env.ELEVENLABS_OUTBOUND_URL ||
    (env.ELEVENLABS_TELEPHONY_PROVIDER === "twilio"
      ? "https://api.elevenlabs.io/v1/convai/twilio/outbound-call"
      : "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call"),
});
// Only when configured: otherwise "call" contacts keep today's behavior (the demo console answers).
const callbackProvider = elevenLabs.isConfigured() ? elevenLabs : undefined;

const { app, contacts } = createApp({
  agentConfig,
  env,
  registryPath,
  callbackProvider,
  photonWebhookSecret: env.PHOTON_WEBHOOK_SECRET,
  elevenlabsWebhookSecret: env.ELEVENLABS_WEBHOOK_SECRET,
  screenerOptions: {
    subscriberName: env.SUBSCRIBER_NAME || undefined,
    thinking: env.SCREENER_THINKING === "true",
    // A real phone has to ring and be picked up before anyone speaks: don't decide on "silence" too early.
    listenTimeoutMs: Number(env.SCREENER_LISTEN_TIMEOUT_MS) || 90_000,
  },
});

const server = serve({ fetch: app.fetch, port }, () => {
  const live = contacts.filter((c) => c.verifyVia.channel !== "simulator");
  const callbackDesc = callbackProvider
    ? `ElevenLabs (${env.ELEVENLABS_AGENT_ID}) via Photon SIP trunk`
    : live.length
      ? live.map((c) => `${c.id} -> ${c.verifyVia.channel}`).join(", ")
      : "simulator (scripted replies)";

  console.log(
    [
      "",
      "  Magenta-Guard server is up",
      `  URL        http://localhost:${port}`,
      `  Screener   ${agentConfig.apiKey ? `Nemotron · ${agentConfig.model}` : "UNAVAILABLE: set NVIDIA_API_KEY in .env (calls will not be connected)"}`,
      `  Texts      ${agentConfig.llmProvider === "mock" ? "legacy text pipeline, mock brain" : `legacy text pipeline, ${agentConfig.model}`}`,
      `  Registry   ${registryPath} (${contacts.length} trusted contacts)`,
      `  Callback   ${callbackDesc}`,
      `  Voice Dial ${env.ELEVENLABS_DIAL_AGENT_ID ? `POST /api/calls/dial (agent: ${env.ELEVENLABS_DIAL_AGENT_ID})` : "disabled (set ELEVENLABS_DIAL_AGENT_ID)"}`,
      `  Inbound    ${env.PHOTON_WEBHOOK_SECRET ? "POST /webhooks/photon (HMAC verified)" : "POST /webhooks/photon disabled (set PHOTON_WEBHOOK_SECRET)"}`,
      `  Answers    ${env.ELEVENLABS_WEBHOOK_SECRET ? "POST /webhooks/elevenlabs (signature verified)" : "POST /webhooks/elevenlabs disabled (set ELEVENLABS_WEBHOOK_SECRET); polling the transcript instead"}`,
      "",
    ].join("\n"),
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${port} is already in use. Set BEACON_PORT to another port.` : err);
  process.exit(1);
});

// A stray rejection must not take the demo down.
process.on("unhandledRejection", (err) => console.error("[magenta-guard] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[magenta-guard] uncaught exception:", err));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
