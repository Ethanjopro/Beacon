/**
 * Trusted-contact helpers: who does a message claim to be, and is the sender
 * really them? Also the `lookup_contact` tool, which returns a PROJECTION of
 * the contact — never the safe word, never raw handles.
 */
import type { IncomingEvent, TrustedContact } from "@beacon/shared";
import type { Claim } from "../pipeline/context.js";
import { contactRef, isRoleWord } from "../privacy/redact.js";

const ORG_RELATIONSHIPS = new Set<TrustedContact["relationship"]>(["bank", "employer", "carrier", "government", "service"]);

export const isOrg = (c: TrustedContact) => ORG_RELATIONSHIPS.has(c.relationship);

/** Phone handles compare on their last 10 digits; everything else case-insensitively. */
export function normalizeHandle(handle: string): string {
  const h = handle.trim().toLowerCase();
  if (h.includes("@")) return h;
  const digits = h.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || h;
}

export function isKnownHandle(handle: string, contact: TrustedContact): boolean {
  const n = normalizeHandle(handle);
  return contact.handles.some((h) => normalizeHandle(h) === n);
}

export function contactBySender(handle: string, contacts: TrustedContact[]): TrustedContact | undefined {
  return contacts.find((c) => isKnownHandle(handle, c));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (alias: string) => `(?<![\\p{L}\\p{N}])${escapeRe(alias.trim()).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`;

/** "it's Mom", "this is Sam", "soy tu mamá", "Mom here", "— Mom", "love, Mom". */
function selfIdentifies(text: string, alias: string): boolean {
  const a = word(alias);
  const patterns = [
    `\\b(it'?s|its|this is|i'?m|i am|soy|es)\\s+(your\\s+|tu\\s+)?${a}`,
    `${a}\\s+here\\b`,
    `(^|[\\n—–-]|love,?|xo,?|besos,?)\\s*${a}\\s*[!.❤️♥]*\\s*$`,
  ];
  return patterns.some((p) => new RegExp(p, "imu").test(text));
}

const ACCOUNT_CUE = /\b(account|card|verify|confirm|log ?in|password|pin|code|alert|fraud|suspend\w*|lock\w*|payment|https?:\/\/|www\.)/i;

/**
 * The org is speaking AS ITSELF ("First Lone Star Bank: …", "This is First Lone
 * Star", or named next to an account/verify cue) — not merely mentioned
 * ("I opened an account at First Lone Star, so happy!" is a mention).
 */
function orgSpeaks(text: string, name: string): boolean {
  const m = new RegExp(word(name), "iu").exec(text);
  if (!m) return false;
  const before = text.slice(Math.max(0, m.index - 20), m.index);
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
  if (m.index < 3 || /^\s*(bank)?\s*[:|\-–—]/i.test(after)) return true; // header / sender tag
  if (/\b(this is|from|it'?s|on behalf of|de parte de|somos|soy)\s+(the\s+)?$/i.test(before)) return true;
  if (/\b(at|with|to|in)\s+(the\s+)?$/i.test(before)) return false; // "an account at X" = a mention
  return ACCOUNT_CUE.test(text);
}

/** Words a grandchild uses to address a grandparent → aliases that identify the grandchild. */
const ADDRESSED_AS: { addressed: RegExp; claimant: RegExp }[] = [
  { addressed: /\b(grandma|grandpa|granny|nana|abuel[ao])\b/i, claimant: /grand(son|daughter|child|kid)|niet[oa]/i },
  { addressed: /\b(mom|mama|mommy|dad|daddy|mam[aá]|pap[aá])\b[,!]/i, claimant: /^(your\s+)?(son|daughter|kid|hij[oa])$/i },
];

/**
 * Who the message claims to be. Display names are a claim SOURCE, never
 * identity (scammers set them). People need a self-identification; orgs
 * count when named anywhere ("First Lone Star Bank: your card is locked").
 */
export function findClaim(event: IncomingEvent, text: string, contacts: TrustedContact[]): Claim | undefined {
  const display = event.from.displayName?.trim().toLowerCase() ?? "";
  for (const c of contacts) {
    const names = [c.name, ...c.aliases].map((n) => n.toLowerCase());
    if (display && names.some((n) => display === n || new RegExp(word(n), "iu").test(display))) {
      return { contact: c, via: "display_name" };
    }
  }
  for (const c of contacts) {
    const names = [c.name.replace(/\s*\(.*?\)/g, ""), ...c.aliases];
    if (isOrg(c)) {
      // Generic phrases like "your bank" don't claim to BE the bank ("call your bank").
      // Judge the longest name that appears ("First Lone Star Bank", not its tail "Lone Star Bank").
      const named = names
        .filter((n) => !isRoleWord(n))
        .sort((a, b) => b.length - a.length)
        .find((n) => new RegExp(word(n), "iu").test(text));
      if (named && orgSpeaks(text, named)) return { contact: c, via: "org_mention" };
    } else if (names.some((n) => selfIdentifies(text, n))) {
      return { contact: c, via: "self_identification" };
    }
  }
  if (/\b(it'?s me|its me|soy yo)\b/i.test(text)) {
    for (const { addressed, claimant } of ADDRESSED_AS) {
      if (!addressed.test(text)) continue;
      const c = contacts.find((x) => !isOrg(x) && x.aliases.some((a) => claimant.test(a.trim())));
      if (c) return { contact: c, via: "addressed_as" };
    }
  }
  return undefined;
}

/** What `lookup_contact` tells the LLM. No names, no handles, no safe word. */
export interface ContactProjection {
  ref: string;
  relationship: TrustedContact["relationship"];
  isOrganization: boolean;
  /** Is the suspicious sender one of this contact's saved handles? */
  senderIsKnownHandle: boolean;
  /** Organizations: domains their real links use. */
  officialDomains: string[];
  hasVerificationChannel: true;
}

export function projectContact(contact: TrustedContact, contacts: TrustedContact[], senderHandle: string): ContactProjection {
  return {
    ref: contactRef(contacts, contact),
    relationship: contact.relationship,
    isOrganization: isOrg(contact),
    senderIsKnownHandle: isKnownHandle(senderHandle, contact),
    officialDomains: contact.domains,
    hasVerificationChannel: true,
  };
}

/** The `lookup_contact` tool: by ref ("CONTACT_2") or by alias/role word ("mom", "your bank"). */
export function lookupContact(query: string, contacts: TrustedContact[], senderHandle: string): ContactProjection | undefined {
  const q = query.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const refMatch = /contact_(\d+)/.exec(q);
  const byRef = refMatch ? contacts[Number(refMatch[1]) - 1] : undefined;
  const bare = q.replace(/^(your|my|the|tu|mi)\s+/, "");
  const byAlias = contacts.find((c) =>
    [c.name, ...c.aliases].some((a) => {
      const x = a.toLowerCase();
      return x === q || x === bare || x.replace(/^(your|my|the)\s+/, "") === bare;
    }),
  );
  const found = byRef ?? byAlias;
  return found ? projectContact(found, contacts, senderHandle) : undefined;
}

// No pronoun guessing: user-facing copy names the contact ("the real Mom denied sending it").
// Guessing from relationship words misfires (e.g. a grandson whose aliases include "abuela").
