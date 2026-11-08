import type { VerificationRequest, VerificationResult } from "@beacon/shared";

export interface CallbackProvider {
  /**
   * Places an outbound call to the trusted contact's saved number, delivers the
   * question, and returns the spoken answer. Always resolves, never rejects.
   */
  call(request: VerificationRequest): Promise<VerificationResult>;
}

export interface ElevenLabsCallbackOptions {
  apiKey?: string;
  agentId?: string;
  phoneNumberId?: string;
  /** Custom outbound API URL (defaults to sip-trunk or twilio convai endpoint). */
  outboundUrl?: string;
  /** Injected fetch implementation (tests). */
  fetch?: typeof fetch;
  /** Clock override (tests). */
  now?: () => Date;
  /** Interval in ms to poll for the call transcript if no webhook arrives (default: 2000). */
  pollIntervalMs?: number;
  log?: (msg: string) => void;
}

/**
 * Places real outbound phone calls via ElevenLabs Conversational AI bridged to a
 * Photon SIP trunk number (or Twilio provider).
 *
 * Flow:
 * 1. POST to ElevenLabs outbound-call endpoint with agent_id, agent_phone_number_id,
 *    to_number (the registry's saved number ONLY), dynamic variables, and first_message.
 * 2. Collects the spoken answer either when ElevenLabs sends a webhook (post-call
 *    transcript or tool call) or by polling GET /v1/convai/conversations/{id}.
 * 3. Returns { status: "replied", reply: { requestId, text, from, receivedAt } }.
 * 4. Resolves "timeout" after request.timeoutMs, or "unreachable" if the API is down / unconfigured.
 */
export class ElevenLabsPhotonCallback implements CallbackProvider {
  private readonly fetchFn: typeof fetch;
  private readonly log: (msg: string) => void;
  /** Maps ElevenLabs conversation_id -> VerificationRequest.id */
  private readonly conversations = new Map<string, string>();
  /** Maps VerificationRequest.id -> in-flight promise resolver */
  private readonly pendingCalls = new Map<
    string,
    {
      conversationId?: string;
      resolve: (res: VerificationResult) => void;
      settled: boolean;
    }
  >();

  constructor(private readonly options: ElevenLabsCallbackOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.log = options.log ?? ((msg: string) => console.log(`[elevenlabs-callback] ${msg}`));
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey?.trim() && this.options.agentId?.trim() && this.options.phoneNumberId?.trim());
  }

  getRequestIdForConversation(conversationId: string): string | undefined {
    return this.conversations.get(conversationId);
  }

  registerConversation(conversationId: string, requestId: string): void {
    this.conversations.set(conversationId, requestId);
  }

  /** Resolves an in-flight call verification when answer text arrives (e.g. from POST /webhooks/elevenlabs). */
  resolvePending(requestId: string, text: string, from?: string): boolean {
    const entry = this.pendingCalls.get(requestId);
    if (!entry || entry.settled) return false;
    entry.settled = true;
    this.pendingCalls.delete(requestId);
    entry.resolve({
      status: "replied",
      reply: {
        requestId,
        text: text.trim(),
        from,
        receivedAt: (this.options.now ? this.options.now() : new Date()).toISOString(),
      },
    });
    return true;
  }

  async call(request: VerificationRequest): Promise<VerificationResult> {
    if (!this.isConfigured()) {
      return {
        status: "unreachable",
        detail:
          "ElevenLabs callback not configured (missing ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, or ELEVENLABS_PHONE_NUMBER_ID)",
      };
    }

    return new Promise<VerificationResult>((resolve) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (result: VerificationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        if (pollTimer) clearTimeout(pollTimer);
        this.pendingCalls.delete(request.id);
        resolve(result);
      };

      const timeoutTimer = setTimeout(() => {
        finish({
          status: "timeout",
          detail: `No reply within ${request.timeoutMs}ms`,
        });
      }, request.timeoutMs);

      this.pendingCalls.set(request.id, {
        resolve: finish,
        settled: false,
      });

      const poll = async () => {
        const conversationId = this.pendingCalls.get(request.id)?.conversationId;
        if (settled || !conversationId) return;
        try {
          const res = await this.fetchFn(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
            {
              headers: { "xi-api-key": this.options.apiKey! },
            }
          );
          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (data.status === "failed") {
              // Busy, no answer, rejected: don't sit out the whole timeout.
              finish({ status: "unreachable", detail: "The verification call failed" });
              return;
            }
            if (data.status === "done" && Array.isArray(data.transcript)) {
              const userLines = data.transcript
                .filter(
                  (t: unknown) =>
                    typeof t === "object" && t !== null && (t as Record<string, unknown>).role === "user"
                )
                .map((t: unknown) => String((t as Record<string, unknown>).message ?? ""))
                .filter(Boolean);
              const text = userLines.join(" ").trim();
              if (text) {
                finish({
                  status: "replied",
                  reply: {
                    requestId: request.id,
                    text,
                    from: request.contactName,
                    receivedAt: (this.options.now ? this.options.now() : new Date()).toISOString(),
                  },
                });
                return;
              } else {
                finish({
                  status: "unreachable",
                  detail: "Call completed with no spoken answer",
                });
                return;
              }
            }
          }
        } catch {
          // ignore transient poll error
        }

        if (!settled) {
          pollTimer = setTimeout(poll, this.options.pollIntervalMs ?? 2000);
        }
      };

      const outboundUrl =
        this.options.outboundUrl?.trim() ||
        "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call";

      this.fetchFn(outboundUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.options.apiKey!,
        },
        body: JSON.stringify({
          agent_id: this.options.agentId,
          agent_phone_number_id: this.options.phoneNumberId,
          to_number: request.to,
          // The agent's First message in the ElevenLabs dashboard must be "{{question}}".
          // We don't send a first_message override: ElevenLabs rejects overrides unless they're
          // enabled in the agent's Security settings, and a variable needs no extra setup.
          conversation_initiation_client_data: {
            dynamic_variables: {
              question: request.question,
              contact_name: request.contactName,
              request_id: request.id,
              claim: request.claim,
            },
          },
        }),
      })
        .then(async (res) => {
          if (settled) return;
          if (!res.ok) {
            // Error bodies can echo the number we dialed: mask digit runs before logging.
            const errText = maskNumbers((await res.text().catch(() => "")).slice(0, 300));
            this.log(`outbound call initiation failed: ${res.status} ${errText}`);
            finish({
              status: "unreachable",
              detail: `ElevenLabs outbound call failed: ${res.status} ${errText}`.trim(),
            });
            return;
          }

          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const conversationId =
            (typeof data.conversation_id === "string" ? data.conversation_id : undefined) ??
            (typeof data.conversationId === "string" ? data.conversationId : undefined);
          if (!conversationId || data.success === false) {
            finish({ status: "unreachable", detail: "ElevenLabs didn't start the call" });
            return;
          }
          this.conversations.set(conversationId, request.id);
          const entry = this.pendingCalls.get(request.id);
          if (entry) entry.conversationId = conversationId;
          // Never log the number: it's a teammate's real phone on stage.
          this.log(`verification call started for ${request.contactName} (conv: ${conversationId}, req: ${request.id})`);
          pollTimer = setTimeout(poll, Math.min(1500, request.timeoutMs));
        })
        .catch((err) => {
          if (settled) return;
          this.log(`error initiating outbound call: ${err instanceof Error ? err.message : String(err)}`);
          finish({
            status: "unreachable",
            detail: `Failed to initiate ElevenLabs call: ${err instanceof Error ? err.message : String(err)}`,
          });
        });
    });
  }
}

/** Replaces digit runs that could be phone numbers, so logs never carry a real number. */
export function maskNumbers(text: string): string {
  return text.replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]");
}
