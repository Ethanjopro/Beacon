import type { Scenario, VerificationReply, VerificationRequest, VerificationResult } from "@beacon/shared";

interface Pending {
  request: VerificationRequest;
  resolve: (result: VerificationResult) => void;
  timer: ReturnType<typeof setTimeout>;
  autoTimer?: ReturnType<typeof setTimeout>;
}

export interface BrokerOptions {
  /** Finds the scenario that produced an event (for simulator auto-replies). */
  scenarioForEvent: (eventId: string) => Scenario | undefined;
  /** Overrides the scenario's reply delay (tests use ~0). */
  simulatorDelayMs?: number;
  now?: () => Date;
}

/**
 * Delivers verification questions and collects replies. It does NOT interpret
 * replies — the agent does. `verify` always resolves, never rejects.
 */
export class VerificationBroker {
  private pending = new Map<string, Pending>();

  constructor(private readonly options: BrokerOptions) {}

  /** Pass this as `AgentDeps.verify`. */
  verify = (request: VerificationRequest): Promise<VerificationResult> =>
    new Promise<VerificationResult>((resolve) => {
      const entry: Pending = {
        request,
        resolve,
        timer: setTimeout(() => this.settle(request.id, { status: "timeout", detail: `No reply within ${request.timeoutMs}ms` }), request.timeoutMs),
      };
      this.pending.set(request.id, entry);

      const scripted = request.channel === "simulator" ? this.options.scenarioForEvent(request.eventId)?.trustedContactReply : undefined;
      if (scripted && scripted.contactId === request.contactId) {
        entry.autoTimer = setTimeout(() => this.reply(request.id, { text: scripted.text, from: request.contactName }), this.options.simulatorDelayMs ?? scripted.delayMs);
      }
    });

  /** Resolves a pending request with a reply. Returns false if it is unknown or already settled. */
  reply(requestId: string, body: { text: string; from?: string }): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    const reply: VerificationReply = {
      requestId,
      text: body.text,
      from: body.from,
      receivedAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    return this.settle(requestId, { status: "replied", reply });
  }

  listPending(): VerificationRequest[] {
    return [...this.pending.values()].map((p) => p.request);
  }

  /** Abandons everything in flight (demo reset). Waiting agents get `unreachable`. */
  clear(): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { status: "unreachable", detail: "Session reset" });
  }

  private settle(id: string, result: VerificationResult): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (entry.autoTimer) clearTimeout(entry.autoTimer);
    entry.resolve(result);
    return true;
  }
}
