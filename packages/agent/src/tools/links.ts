/**
 * Link inspection — runs locally (no network, we never visit the link).
 * Used by triage directly and exposed to the LLM as the `check_link` tool.
 */
import type { Signal, TrustedContact } from "@beacon/shared";

/** TLDs that are cheap/abused far more than they're used by real billers and banks. */
const SUSPICIOUS_TLDS = new Set([
  "top", "xyz", "icu", "click", "live", "cc", "buzz", "sbs", "cfd", "rest", "lol", "monster", "quest", "cyou",
  "bond", "win", "vip", "loan", "work", "zip", "mov", "info", "online", "site", "store", "shop", "support", "ru", "cn",
]);

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "is.gd", "rb.gy", "cutt.ly", "ow.ly", "shorturl.at", "tiny.cc", "s.id"]);

/**
 * Brands scammers commonly imitate, with their real registrable domains.
 * Detection data only (not branding). Contacts' own domains are added at runtime.
 */
const IMPERSONATED_BRANDS: Record<string, string[]> = {
  usps: ["usps.com"],
  ups: ["ups.com"],
  fedex: ["fedex.com"],
  dhl: ["dhl.com"],
  amazon: ["amazon.com"],
  apple: ["apple.com", "icloud.com"],
  paypal: ["paypal.com"],
  netflix: ["netflix.com"],
  irs: ["irs.gov"],
  ssa: ["ssa.gov"],
  txtag: ["txtag.org"],
  metrotag: ["metrotag.example"], // fictional toll agency used in our demo scenarios
  ezpass: ["e-zpassny.com", "ezpassnj.com"],
  sunpass: ["sunpass.com"],
  zelle: ["zellepay.com"],
  venmo: ["venmo.com"],
  coinbase: ["coinbase.com"],
  microsoft: ["microsoft.com"],
  chase: ["chase.com"],
  wellsfargo: ["wellsfargo.com"],
};

const TWO_LEVEL_SUFFIXES = new Set(["co.uk", "com.au", "co.jp", "com.mx", "com.br", "co.in"]);

export interface ParsedLink {
  raw: string;
  host: string;
  /** e.g. "txtag-billing.top" for "pay.txtag-billing.top" */
  registrable: string;
  tld: string;
}

const LINK_RE =
  /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|gov|top|xyz|icu|click|live|cc|info|co|us|io|me|ly|gl|buzz|sbs|cfd|vip|win|online|site|store|shop|support|app|link|example)\b(?:\/[^\s<>"')]*)?/gi;

export function extractLinks(text: string): ParsedLink[] {
  const seen = new Set<string>();
  const out: ParsedLink[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    const raw = m[0].replace(/[.,!?;:]+$/, "");
    if (/@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0))) continue; // part of an email
    const parsed = parseLink(raw);
    if (parsed && !seen.has(parsed.host)) {
      seen.add(parsed.host);
      out.push(parsed);
    }
  }
  return out;
}

export function parseLink(raw: string): ParsedLink | undefined {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  // Recover punycode the URL parser may have produced from unicode input, and keep explicit xn-- labels.
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return undefined;
  const lastTwo = labels.slice(-2).join(".");
  const registrable = TWO_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
  return { raw, host, registrable, tld: labels.at(-1) ?? "" };
}

/** Which trusted org (if any) owns this domain. */
export function domainOwner(link: ParsedLink, contacts: TrustedContact[]): TrustedContact | undefined {
  return contacts.find((c) => c.domains.some((d) => link.host === d.toLowerCase() || link.host.endsWith(`.${d.toLowerCase()}`)));
}

export interface LinkFinding {
  id: string;
  title: string;
  detail: string;
  weight: number;
}

/**
 * Inspect one link. `claimedOrg` is the trusted org the message claims to be
 * from (if any): a link outside its registered domains is a strong signal.
 */
export function checkLink(link: ParsedLink, contacts: TrustedContact[], claimedOrg?: TrustedContact): LinkFinding[] {
  const findings: LinkFinding[] = [];
  const owner = domainOwner(link, contacts);
  if (owner) {
    findings.push({
      id: "link_official_domain",
      title: `Link goes to ${owner.name}'s real website`,
      detail: `${link.registrable} is on the list of domains ${owner.name} actually uses.`,
      weight: -1.0,
    });
    return findings;
  }

  if (link.host.split(".").some((l) => l.startsWith("xn--")) || /[^\x00-\x7f]/.test(link.raw)) {
    findings.push({
      id: "link_punycode",
      title: "Disguised web address",
      detail: "The link uses look-alike characters to imitate a real website's name.",
      weight: 1.5,
    });
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(link.host)) {
    findings.push({ id: "link_ip_address", title: "Link is a raw IP address", detail: "Real companies link to their named website, not a bare number.", weight: 1.2 });
  }
  if (SUSPICIOUS_TLDS.has(link.tld)) {
    findings.push({
      id: "link_suspicious_tld",
      title: `Unusual web address ending (.${link.tld})`,
      detail: `Cheap .${link.tld} addresses are heavily used by scam sites and rarely by real billers or banks.`,
      weight: 1.0,
    });
  }
  if (SHORTENERS.has(link.registrable) || SHORTENERS.has(link.host)) {
    findings.push({ id: "link_shortener", title: "Shortened link hides where it goes", detail: "Link shorteners hide the real destination.", weight: 0.6 });
  }

  const brand = lookalikeBrand(link, contacts);
  if (brand) {
    findings.push({
      id: "link_lookalike",
      title: `Look-alike website imitating "${brand}"`,
      detail: `The address contains "${brand}" but isn't ${brand}'s real website (${link.registrable}).`,
      weight: 1.5,
    });
  } else if (claimedOrg && claimedOrg.domains.length > 0) {
    findings.push({
      id: "link_not_claimed_org",
      title: `Link isn't ${claimedOrg.name}'s website`,
      detail: `The message claims to be ${claimedOrg.name}, but the link doesn't go to a domain they use.`,
      weight: 1.2,
    });
  }
  return findings;
}

/** "usps-redelivery.top" → "usps"; "paypal.com" → undefined. */
function lookalikeBrand(link: ParsedLink, contacts: TrustedContact[]): string | undefined {
  const brands: Record<string, string[]> = { ...IMPERSONATED_BRANDS };
  for (const c of contacts) {
    for (const d of c.domains) {
      const token = d.split(".")[0]?.toLowerCase();
      if (token && token.length >= 4) brands[token] = [...(brands[token] ?? []), d.toLowerCase()];
    }
  }
  const hostTokens = link.host.split(/[.-]/);
  for (const [brand, official] of Object.entries(brands)) {
    if (official.includes(link.registrable)) continue;
    const appears = brand.length <= 3 ? hostTokens.includes(brand) : link.host.includes(brand);
    if (appears) return brand;
  }
  return undefined;
}

/** Converts findings to heuristic Signals with the link as evidence. */
export function linkSignals(link: ParsedLink, findings: LinkFinding[], source: Signal["source"] = "heuristic"): Signal[] {
  return findings.map((f) => ({ ...f, source, evidence: link.raw }));
}
