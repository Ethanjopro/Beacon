import { agentConfigFromEnv, DEFAULT_SERVER_PORT } from "@beacon/shared";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const env = process.env;
const port = Number(env.BEACON_PORT) || DEFAULT_SERVER_PORT;
const agentConfig = agentConfigFromEnv(env);
// Trusted registry: SQLite file at the repo root's data/ (gitignored). Delete it to reseed from the synthetic contacts.
const registryPath = env.REGISTRY_DB_PATH || fileURLToPath(new URL("../../../data/registry.sqlite", import.meta.url));
const { app, contacts } = createApp({
  agentConfig,
  env,
  registryPath,
  screenerOptions: { subscriberName: env.SUBSCRIBER_NAME || undefined },
});

const server = serve({ fetch: app.fetch, port }, () => {
  const live = contacts.filter((c) => c.verifyVia.channel !== "simulator");
  console.log(
    [
      "",
      "  Magenta-Guard server is up",
      `  URL       http://localhost:${port}`,
      `  Screener  ${agentConfig.apiKey ? `Nemotron · ${agentConfig.model}` : "UNAVAILABLE: set NVIDIA_API_KEY in .env (calls will not be connected)"}`,
      `  Texts     ${agentConfig.llmProvider === "mock" ? "legacy text pipeline, mock brain" : `legacy text pipeline, ${agentConfig.model}`}`,
      `  Registry  ${registryPath} (${contacts.length} trusted contacts)`,
      `  Callback  ${live.length ? live.map((c) => `${c.id} -> ${c.verifyVia.channel}`).join(", ") : "simulator (scripted replies)"}`,
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
