import { agentConfigFromEnv, DEFAULT_SERVER_PORT } from "@beacon/shared";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const env = process.env;
const port = Number(env.BEACON_PORT) || DEFAULT_SERVER_PORT;
const agentConfig = agentConfigFromEnv(env);
const { app, contacts } = createApp({ agentConfig, env });

const server = serve({ fetch: app.fetch, port }, () => {
  const live = contacts.filter((c) => c.verifyVia.channel !== "simulator");
  console.log(
    [
      "",
      "  Beacon server is up",
      `  URL       http://localhost:${port}`,
      `  Provider  ${agentConfig.llmProvider}`,
      `  Model     ${agentConfig.llmProvider === "mock" ? "(mock brain, offline)" : agentConfig.model}`,
      `  Verify    ${live.length ? live.map((c) => `${c.id} -> ${c.verifyVia.channel}`).join(", ") : "simulator (scripted replies)"}`,
      "",
    ].join("\n"),
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${port} is already in use. Set BEACON_PORT to another port.` : err);
  process.exit(1);
});

// A stray rejection must not take the demo down.
process.on("unhandledRejection", (err) => console.error("[beacon] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[beacon] uncaught exception:", err));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
