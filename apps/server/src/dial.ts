import { randomBytes } from "node:crypto";
import { normalizeHandle } from "./normalize.js";

export interface ActiveDial {
  callId: string;
  /** Real destination number. Stored ONLY in memory for dialing; NEVER logged or traced. */
  realNumber: string;
  syntheticHandle: string;
  startedAt: number;
}

export interface DialManagerOptions {
  allowlist?: string;
  token?: string;
  agentId?: string;
  phoneNumberId?: string;
  apiKey?: string;
  outboundUrl?: string;
  customLlmSecret?: string;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
}

export class DialManager {
  private active?: ActiveDial;
  private readonly fetchFn: typeof fetch;
  private readonly log: (msg: string) => void;

  constructor(private readonly options: DialManagerOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.log = options.log ?? ((msg: string) => console.log(`[dial] ${msg}`));
  }

  isAllowed(number: string): boolean {
    const raw = this.options.allowlist?.trim();
    if (!raw) return false;
    const target = normalizeHandle(number);
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeHandle);
    return list.includes(target);
  }

  isTokenValid(token: string | undefined): boolean {
    const required = this.options.token?.trim();
    if (!required) return true;
    return token === required;
  }

  isCustomLlmAuthValid(authHeader: string | undefined): boolean {
    const secret = this.options.customLlmSecret?.trim();
    if (!secret) return true;
    if (!authHeader) return false;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return Boolean(match && match[1]?.trim() === secret);
  }

  hasActive(): boolean {
    return Boolean(this.active);
  }

  getActive(): ActiveDial | undefined {
    return this.active;
  }

  getActiveCallId(): string | undefined {
    return this.active?.callId;
  }

  setActive(dial: ActiveDial): void {
    this.active = dial;
  }

  clearActive(callId?: string): void {
    if (!callId || this.active?.callId === callId) {
      this.active = undefined;
    }
  }

  async placeOutboundCall(callId: string, realNumber: string, greeting: string): Promise<void> {
    const apiKey = this.options.apiKey?.trim();
    const agentId = this.options.agentId?.trim();
    const phoneNumberId = this.options.phoneNumberId?.trim();

    if (!apiKey || !agentId || !phoneNumberId) {
      throw new Error(
        "Missing ElevenLabs configuration for voice dial (ELEVENLABS_API_KEY, ELEVENLABS_DIAL_AGENT_ID, or ELEVENLABS_PHONE_NUMBER_ID)",
      );
    }

    const outboundUrl =
      this.options.outboundUrl?.trim() ||
      "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call";

    const res = await this.fetchFn(outboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: realNumber,
        // The agent's First message is "{{greeting}}". No first_message override: ElevenLabs rejects
        // overrides unless they're enabled in the agent's Security tab, and then no call is placed.
        conversation_initiation_client_data: {
          dynamic_variables: {
            call_id: callId,
            greeting,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs outbound dial call failed: ${res.status} ${errText}`.trim());
    }
    this.log(`outbound dial call placed for ${callId}`);
  }
}

export function sseContentChunk(content: string, id = `chatcmpl-${randomBytes(8).toString("hex")}`): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "nemotron-screener",
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function sseEndCallChunk(reason = "verdict_reached", id = `chatcmpl-${randomBytes(8).toString("hex")}`): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "nemotron-screener",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: `call_${randomBytes(6).toString("hex")}`,
              type: "function",
              function: {
                name: "end_call",
                arguments: JSON.stringify({ reason }),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function sseFinishChunk(reason: "stop" | "tool_calls" = "stop", id = `chatcmpl-${randomBytes(8).toString("hex")}`): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "nemotron-screener",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: reason,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export const SSE_DONE = "data: [DONE]\n\n";
