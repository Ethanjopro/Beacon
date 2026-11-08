import type { NewEvent, VerificationRequest } from "@beacon/shared";
import { normalizeHandle, sameHandle } from "./handles.js";

export interface Inbound {
  senderId: string;
  displayName?: string;
  text: string;
}

export type RouteDecision =
  | { kind: "verification-reply"; requestId: string; text: string; from: string }
  | { kind: "new-event"; event: NewEvent };

/** Questions people attach when forwarding something to check. */
const CHECK_PHRASE =
  /\b(?:is\s+(?:this|that|it)\s+(?:a\s+)?(?:scam|legit(?:imate)?|real|fake|phishing|safe)|(?:can|could)\s+you\s+(?:please\s+)?check\s+(?:this|that)|check\s+this(?:\s+out)?|(?:does\s+)?this\s+(?:look|seem)\s+(?:legit|real|fake|sketchy|suspicious|like\s+a\s+scam))\s*[?!.:]*/gi;
const FWD_HEADER = /^\s*(?:-{2,}\s*forwarded message\s*-*|begin forwarded message:?)\s*$/gim;
const FWD_PREFIX = /^\s*(?:fwd?|forwarded)\s*:\s*/i;
const FROM_LINE = /^\s*from:\s*(.+)$/im;

export interface Unwrapped {
  forwarded: boolean;
  body: string;
  /** Original sender, when the forward header names one. */
  originalSender?: string;
}

/** Detect "Fwd:", "is this a scam?" and quoted-text wrappers; return the bare message. */
export function unwrapForward(text: string): Unwrapped {
  let body = text.trim();
  let forwarded = false;
  let originalSender: string | undefined;

  if (FWD_PREFIX.test(body) || /^\s*-{2,}\s*forwarded message/i.test(body)) {
    forwarded = true;
    const from = body.match(FROM_LINE)?.[1]?.trim();
    if (from) originalSender = from.replace(/^.*<(.+)>$/, "$1").trim();
    body = body.replace(FWD_HEADER, "").replace(FROM_LINE, "").replace(/^\s*(?:date|subject|to):.*$/gim, "");
    body = body.replace(FWD_PREFIX, "");
  }

  if (CHECK_PHRASE.test(body)) {
    forwarded = true;
    body = body.replace(CHECK_PHRASE, " ");
  }
  CHECK_PHRASE.lastIndex = 0;

  // Quoted block ("> text" lines) wins over surrounding chatter.
  const lines = body.split(/\r?\n/);
  const quoted = lines.filter((l) => /^\s*>/.test(l));
  if (quoted.length > 0) {
    forwarded = true;
    body = quoted.map((l) => l.replace(/^\s*>+\s?/, "")).join("\n");
  }

  body = body.replace(/\s+/g, " ").trim();
  // A message wrapped entirely in quote marks.
  const wrapped = body.match(/^["“'‘](.+)["”'’]$/s);
  if (wrapped && forwarded) body = wrapped[1]!.trim();

  return { forwarded, body: body || text.trim(), originalSender };
}

/** Pending request this sender could be answering (most recent wins). */
export function matchPending(senderId: string, pending: Iterable<VerificationRequest>): VerificationRequest | undefined {
  let best: VerificationRequest | undefined;
  for (const req of pending) {
    if (!sameHandle(req.to, senderId)) continue;
    if (!best || req.sentAt >= best.sentAt) best = req;
  }
  return best;
}

export function route(msg: Inbound, pending: Iterable<VerificationRequest>): RouteDecision {
  const from = normalizeHandle(msg.senderId);
  const match = matchPending(msg.senderId, pending);
  if (match) return { kind: "verification-reply", requestId: match.id, text: msg.text.trim(), from };

  const { forwarded, body, originalSender } = unwrapForward(msg.text);
  return {
    kind: "new-event",
    event: {
      kind: "imessage",
      source: forwarded ? "forwarded" : "photon",
      // For forwards, prefer the original sender if the wrapper named one; else the forwarder.
      from: forwarded && originalSender ? { handle: originalSender } : { handle: from, displayName: msg.displayName },
      body,
      threadId: `photon:${from}`,
    },
  };
}
