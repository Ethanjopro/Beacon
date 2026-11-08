import type { TraceEvent, Verdict, VerificationRequest } from "@beacon/shared";
import { formatVerdictReply, formatVerificationQuestion } from "./format.js";
import { route } from "./route.js";
import type { ServerClient } from "./server-client.js";
import type { InboundMessage, Transport } from "./transport.js";

const OUTBOUND_CHANNELS = new Set(["imessage", "sms", "whatsapp"]);

type Log = (msg: string) => void;

/**
 * Glue between a Transport (phones) and the Beacon server. All state is in-memory:
 * pending verification requests (from SSE) and forwarded events awaiting a verdict.
 */
export class Bridge {
  private pending = new Map<string, VerificationRequest>();
  /** eventId -> where to send the verdict, for events we created from forwards. */
  private awaitingVerdict = new Map<string, (text: string) => Promise<void>>();
  /** Verdicts that arrived before POST /events returned the eventId. */
  private earlyVerdicts = new Map<string, Verdict>();
  private sent = new Set<string>();

  constructor(
    private readonly transport: Transport,
    private readonly server: Pick<ServerClient, "postEvent" | "postReply">,
    private readonly log: Log = console.log,
  ) {}

  /** Seed from GET /verifications/pending (call once at startup, ignore failures). */
  seedPending(requests: VerificationRequest[]): void {
    for (const r of requests) this.pending.set(r.id, r);
  }

  pendingRequests(): VerificationRequest[] {
    return [...this.pending.values()];
  }

  /** Consume the transport until it ends. */
  async run(): Promise<void> {
    for await (const msg of this.transport.messages()) {
      await this.handleInbound(msg).catch((err) => this.log(`[channels] failed to handle message: ${err instanceof Error ? err.message : err}`));
    }
  }

  async handleInbound(msg: InboundMessage): Promise<void> {
    const decision = route(msg, this.pending.values());
    if (decision.kind === "verification-reply") {
      this.log(`[channels] reply from ${decision.from} for verification ${decision.requestId}`);
      await this.server.postReply(decision.requestId, { text: decision.text, from: decision.from });
      this.pending.delete(decision.requestId);
      return;
    }
    const { eventId } = await this.server.postEvent(decision.event);
    this.log(`[channels] ${decision.event.source} message -> event ${eventId}`);
    if (decision.event.source !== "forwarded") return;
    const early = this.earlyVerdicts.get(eventId);
    if (early) {
      this.earlyVerdicts.delete(eventId);
      await msg.reply(formatVerdictReply(early));
    } else {
      this.awaitingVerdict.set(eventId, (t) => msg.reply(t));
    }
  }

  /** Feed every SSE trace event here. */
  async onTrace(ev: TraceEvent): Promise<void> {
    try {
      if (ev.type === "verification.requested") await this.sendQuestion(ev.request);
      else if (ev.type === "verification.resolved") this.pending.delete(ev.outcome.requestId);
      else if (ev.type === "verdict") await this.sendVerdict(ev.eventId, ev.verdict);
    } catch (err) {
      this.log(`[channels] ${ev.type} handling failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async sendQuestion(req: VerificationRequest): Promise<void> {
    if (!OUTBOUND_CHANNELS.has(req.channel)) return; // simulator/call: someone else's job
    this.pending.set(req.id, req);
    if (this.sent.has(req.id)) return; // SSE replay after reconnect
    this.sent.add(req.id);
    // Always the registry's known-good handle (req.to), never anything from the suspicious message.
    await this.transport.sendTo(req.to, formatVerificationQuestion(req));
    this.log(`[channels] asked ${req.contactName} (${req.to}): "${req.claim}"`);
  }

  private async sendVerdict(eventId: string, verdict: Verdict): Promise<void> {
    const reply = this.awaitingVerdict.get(eventId);
    if (!reply) {
      // Maybe our POST hasn't returned yet; keep a small buffer.
      if (this.earlyVerdicts.size > 50) this.earlyVerdicts.clear();
      this.earlyVerdicts.set(eventId, verdict);
      return;
    }
    this.awaitingVerdict.delete(eventId);
    await reply(formatVerdictReply(verdict));
  }
}
