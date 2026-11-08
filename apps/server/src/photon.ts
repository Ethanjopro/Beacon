/**
 * Photon 2.0 (beta) messaging: verify inbound webhooks, read the message out of
 * the event, and send replies back into the same conversation.
 *
 * - Webhooks follow "Standard Webhooks": headers webhook-id / webhook-timestamp /
 *   webhook-signature ("v1,<base64>" entries, space-separated); HMAC-SHA256 over
 *   "<id>.<timestamp>.<raw body>" keyed by the base64 part of the "whsec_" secret.
 * - A received message carries content.text, sentBy.handle (the texter),
 *   space.id (the conversation) and receivedBy.id (our line, used as senderId).
 * - Replies: POST https://api.photon.codes/v1/projects/{projectId}/messages with a
 *   project API key (pho_sk_...) and an idempotency-key header.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStandardWebhook(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowSec: number,
  toleranceSec = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .some((s) => {
      const got = Buffer.from(s.slice(3), "base64");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

export interface PhotonTextMessage {
  kind: "text";
  text: string;
  /** The texter's handle (phone number or iMessage email). */
  handle: string;
  displayName?: string;
  spaceId: string;
  /** Our line's user id: the senderId for replies. */
  lineUserId?: string;
  messageId?: string;
  platform?: string;
}

export type PhotonParse = PhotonTextMessage | { kind: "ignore"; reason: string } | { kind: "unknown" };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Finds the message object inside a Photon 2.0 event, whatever the envelope looks like. */
function findMessage(body: unknown): Obj | undefined {
  const queue: unknown[] = [body];
  for (let i = 0; i < queue.length && i < 20; i++) {
    const v = queue[i];
    if (!isObj(v)) continue;
    if (isObj(v.content) && (isObj(v.sentBy) || isObj(v.space))) return v;
    for (const k of ["data", "message", "payload", "event", "object"]) if (isObj(v[k])) queue.push(v[k]);
  }
  return undefined;
}

/** Reads an inbound text out of a Photon 2.0 webhook event. Outbound/own messages and non-text content are ignored. */
export function parsePhotonEvent(body: unknown): PhotonParse {
  const msg = findMessage(body);
  if (!msg) return { kind: "unknown" };
  const type = isObj(body) ? str(body.type) ?? str(body.event) ?? "" : "";
  const status = str(msg.status);
  const sentBy = isObj(msg.sentBy) ? msg.sentBy : {};
  if (status && status !== "received") return { kind: "ignore", reason: `status ${status} (not an inbound message)` };
  if (/sent|outbound|accepted|delivered|dispatched|failed/i.test(type) && !/received/i.test(type)) return { kind: "ignore", reason: `event ${type}` };
  if (str(sentBy.kind)?.toLowerCase() === "agent") return { kind: "ignore", reason: "sent by our own line" };
  const content = isObj(msg.content) ? msg.content : {};
  if (str(content.type) && content.type !== "text") return { kind: "ignore", reason: `content ${String(content.type)}` };
  const text = str(content.text);
  const handle = str(sentBy.handle) ?? str(sentBy.address) ?? str(sentBy.id);
  const space = isObj(msg.space) ? msg.space : {};
  const spaceId = str(space.id) ?? str(msg.spaceId);
  if (!text || !handle || !spaceId) return { kind: "ignore", reason: "missing text, sender or conversation" };
  const details = isObj(sentBy.details) ? sentBy.details : {};
  const receivedBy = isObj(msg.receivedBy) ? msg.receivedBy : {};
  return {
    kind: "text",
    text,
    handle,
    ...(str(details.displayName) ?? str(details.name) ? { displayName: str(details.displayName) ?? str(details.name) } : {}),
    spaceId,
    ...(str(receivedBy.id) ? { lineUserId: str(receivedBy.id) } : {}),
    ...(str(msg.id) ? { messageId: str(msg.id) } : {}),
    ...(str(msg.platform) ? { platform: str(msg.platform) } : {}),
  };
}

export interface PhotonSenderOptions {
  projectId?: string;
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

/** Sends text replies into a Photon conversation. Never throws; returns whether Photon accepted it. */
export class PhotonSender {
  private readonly fetchFn: typeof fetch;
  constructor(private readonly options: PhotonSenderOptions = {}) {
    this.fetchFn = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  }

  isConfigured(): boolean {
    return Boolean(this.options.projectId?.trim() && this.options.apiKey?.trim());
  }

  async sendText(to: { spaceId: string; senderId?: string; parentMessageId?: string }, text: string, idempotencyKey: string): Promise<boolean> {
    if (!this.isConfigured() || !to.senderId) {
      this.options.log?.(`photon reply skipped: ${this.isConfigured() ? "no line user id in the inbound event" : "PHOTON_PROJECT_ID / PHOTON_API_KEY not set"}`);
      return false;
    }
    try {
      const base = (this.options.baseUrl ?? "https://api.photon.codes").replace(/\/+$/, "");
      const res = await this.fetchFn(`${base}/v1/projects/${encodeURIComponent(this.options.projectId!.trim())}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey!.trim()}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          spaceId: to.spaceId,
          senderId: to.senderId,
          ...(to.parentMessageId ? { parentMessageId: to.parentMessageId } : {}),
          content: { type: "text", format: "plain", text },
        }),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]").slice(0, 200);
        this.options.log?.(`photon reply failed: HTTP ${res.status} ${detail}`);
        return false;
      }
      return true;
    } catch (err) {
      this.options.log?.(`photon reply failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
