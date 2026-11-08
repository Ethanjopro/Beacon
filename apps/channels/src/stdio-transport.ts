import { createInterface } from "node:readline";
import type { InboundMessage, Transport } from "./transport.js";

/**
 * Zero-dependency terminal transport (fallback when the Spectrum terminal UI
 * can't run, e.g. no TTY / piped stdin). Each stdin line is an inbound message.
 * Prefix a line with "<handle>> " to speak as someone else, e.g.
 *   +15550100142> No, that's not me!
 */
export function createStdioTransport(defaultSender: string, out: NodeJS.WritableStream = process.stdout): Transport {
  const rl = createInterface({ input: process.stdin });
  const say = (to: string, text: string) => void out.write(`\n[beacon -> ${to}] ${text}\n`);

  async function* messages(): AsyncGenerator<InboundMessage> {
    for await (const line of rl) {
      const m = line.match(/^\s*(\S+?)>\s*(.*)$/);
      const senderId = m ? m[1]! : defaultSender;
      const text = (m ? m[2]! : line).trim();
      if (!text) continue;
      yield { senderId, text, reply: async (t) => say(senderId, t) };
    }
  }

  return {
    name: "terminal (stdio)",
    messages,
    sendTo: async (handle, text) => say(handle, text),
    stop: async () => rl.close(),
  };
}
