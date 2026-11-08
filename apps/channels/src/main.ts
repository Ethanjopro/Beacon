import { loadConfig } from "./config.js";
import { Bridge } from "./bridge.js";
import { ServerClient } from "./server-client.js";
import { createStdioTransport } from "./stdio-transport.js";
import type { Transport } from "./transport.js";

async function pickTransport(config: ReturnType<typeof loadConfig>): Promise<Transport> {
  // Spectrum's terminal provider is a full-screen TUI: it needs a real TTY.
  if (config.provider === "terminal" && !(process.stdin.isTTY && process.stdout.isTTY)) {
    return createStdioTransport(config.terminalSender);
  }
  try {
    const { createSpectrumTransport } = await import("./spectrum-transport.js");
    return await createSpectrumTransport(config);
  } catch (err) {
    console.warn(`[channels] Spectrum ${config.provider} provider failed to start: ${err instanceof Error ? err.message : err}`);
    console.warn("[channels] falling back to plain stdin/stdout terminal mode.");
    return createStdioTransport(config.terminalSender);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  for (const w of config.warnings) console.warn(`[channels] ${w}`);

  const transport = await pickTransport(config);
  const server = new ServerClient(config.serverUrl);
  const bridge = new Bridge(transport, server);
  console.log(`[channels] provider: ${transport.name} · server: ${config.serverUrl}`);
  if (transport.name.includes("stdio")) {
    console.log("[channels] type a line to send it as an inbound message; use '<handle>> text' to speak as someone else.");
  }

  const abort = new AbortController();
  const shutdown = () => {
    abort.abort();
    void transport.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Seed pending requests once; if the server is down the SSE loop's retry handles it.
  server.getPendingVerifications().then((r) => bridge.seedPending(r), () => {});

  const streaming = server.stream({
    signal: abort.signal,
    onEvent: (ev) => void bridge.onTrace(ev),
    onStatus: (m) => console.log(`[channels] ${m}`),
  });
  await Promise.all([bridge.run(), streaming]);
}

main().catch((err) => {
  console.error("[channels] fatal:", err);
  process.exit(1);
});
