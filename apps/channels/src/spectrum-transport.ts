import type { Message, Space } from "spectrum-ts";
import type { ChannelsConfig } from "./config.js";
import type { InboundMessage, Transport } from "./transport.js";

/**
 * Photon Spectrum adapter. API confirmed against the installed type definitions
 * (@spectrum-ts/core dist/app-*.d.ts under node_modules/.pnpm/spectrum-ts@12.15.0_.../):
 *  - `Spectrum({ projectId, projectSecret, providers })`, `app.messages: AsyncIterable<[Space, Message]>`
 *  - `message.content` is a union with `{ type: "text", text }`; `message.sender?.id`; `message.direction`
 *  - `space.send(text)` / `app.send(space, text)`; `app.stop()`
 *  - open a DM to a handle that has not written first: `platform(app).space.create(handle)` (SpaceNamespace.create,
 *    accepts a raw id string) — `platform` is `imessage`/`terminal` from "spectrum-ts/providers/<name>"
 *  - providers: `imessage.config()` (clients optional; cloud creds come from Spectrum({projectId, projectSecret})),
 *    `terminal.config({ commands? })` (spawns the tuichat TUI, needs a TTY).
 */
interface SpectrumApp {
  messages: AsyncIterable<[Space, Message]>;
  stop(): Promise<void>;
}

function adapt(app: SpectrumApp, name: string, openSpace: (handle: string) => Promise<Space>): Transport {
  async function* messages(): AsyncGenerator<InboundMessage> {
    for await (const [space, message] of app.messages) {
      if (message.direction !== "inbound" || message.sender?.kind === "agent") continue;
      if (message.content.type !== "text") {
        console.log(`[channels] ignoring non-text message (${message.content.type}); voice memos are a stretch goal`);
        continue;
      }
      const senderId = message.sender?.id;
      if (!senderId) continue;
      yield {
        senderId,
        text: message.content.text,
        reply: async (t) => void (await space.send(t)),
      };
    }
  }
  return {
    name,
    messages,
    sendTo: async (handle, text) => void (await (await openSpace(handle)).send(text)),
    stop: () => app.stop(),
  };
}

export async function createSpectrumTransport(config: ChannelsConfig): Promise<Transport> {
  if (config.provider === "imessage" && config.spectrum) {
    const { Spectrum } = await import("spectrum-ts");
    const { imessage } = await import("spectrum-ts/providers/imessage");
    const app = await Spectrum({ ...config.spectrum, providers: [imessage.config()] });
    return adapt(app, "imessage (Photon Spectrum)", (h) => imessage(app).space.create(h));
  }
  const { Spectrum } = await import("spectrum-ts");
  const { terminal } = await import("spectrum-ts/providers/terminal");
  const app = await Spectrum({ providers: [terminal.config()] });
  return adapt(app, "terminal (Photon Spectrum)", (h) => terminal(app).space.create(h));
}
