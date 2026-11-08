/**
 * A small built-in library of known scam (and known-legit) message shapes,
 * searched by keyword-cue overlap. Exposed as the `search_scam_library` tool.
 * Stretch: swap scoring for nemotron-3.5-embed-1b embeddings.
 */
import type { ScamType } from "@beacon/shared";

export interface LibraryPattern {
  id: string;
  scamType: ScamType;
  title: string;
  /** Short phrases; similarity = weighted share of cues present in the text. */
  cues: string[];
}

export const SCAM_LIBRARY: LibraryPattern[] = [
  { id: "family-new-number-money", scamType: "family_emergency", title: "Relative with a \"new number\" needs money fast", cues: ["new number", "new phone", "it's mom", "it's me", "need", "gift card", "don't tell", "right now", "send"] },
  { id: "grandparent-bail", scamType: "family_emergency", title: "Grandchild in jail needs bail", cues: ["grandma", "grandpa", "jail", "bail", "lawyer", "accident", "don't tell", "it's me"] },
  { id: "bank-fraud-alert", scamType: "bank_impersonation", title: "Fake bank fraud alert with a link or callback", cues: ["bank", "suspicious", "account", "locked", "verify", "call", "fraud department", "card"] },
  { id: "irs-arrest", scamType: "government_impersonation", title: "Government agency threatens arrest unless you pay", cues: ["irs", "social security", "warrant", "arrest", "pay", "suspended", "officer", "immigration"] },
  { id: "package-redelivery", scamType: "delivery_smishing", title: "Package held — pay a redelivery fee", cues: ["package", "delivery", "held", "address", "redelivery", "fee", "usps", "parcel"] },
  { id: "unpaid-toll", scamType: "toll_smishing", title: "Unpaid toll balance with a pay link", cues: ["toll", "unpaid", "toll balance", "late fee", "ezpass", "txtag", "pay now"] },
  { id: "otp-read-back", scamType: "account_takeover_otp", title: "\"Read me the code we just sent you\"", cues: ["code", "sent you", "verify", "read", "send me", "account", "by mistake"] },
  { id: "carrier-sim-swap", scamType: "carrier_impersonation", title: "Carrier \"support\" asks for PIN or SIM change", cues: ["sim", "carrier", "port", "pin", "line", "suspended", "upgrade", "account"] },
  { id: "tech-support-virus", scamType: "tech_support", title: "Virus alert — call support / allow remote access", cues: ["virus", "hacked", "support", "remote", "refund", "computer", "call"] },
  { id: "task-job", scamType: "job_offer", title: "Remote \"task\" job with daily pay", cues: ["remote", "job", "hiring", "per day", "tasks", "telegram", "whatsapp", "part-time"] },
  { id: "crypto-mentor", scamType: "investment_crypto", title: "Crypto platform with guaranteed returns", cues: ["crypto", "investment", "returns", "guaranteed", "platform", "profit", "usdt", "trading"] },
  { id: "romance-crisis", scamType: "romance", title: "Online partner stuck abroad needs money", cues: ["my love", "darling", "stuck", "customs", "flight", "fee", "send", "deployed"] },
  { id: "wrong-number-chat", scamType: "wrong_number", title: "Friendly \"wrong number\" that keeps chatting", cues: ["wrong number", "sorry", "is this", "nice to meet", "we met", "where are you from"] },
  { id: "prize-fee", scamType: "prize_lottery", title: "You won — pay a fee to claim", cues: ["won", "winner", "prize", "claim", "fee", "congratulations", "selected"] },
  { id: "marketplace-overpay", scamType: "marketplace", title: "Buyer overpays or wants a code to \"verify\" you", cues: ["still available", "overpaid", "zelle", "shipping", "check", "code", "verify you're real", "refund the difference"] },
  // Known-legit shapes: matching these is evidence AGAINST a scam.
  { id: "legit-2fa", scamType: "none", title: "Real sign-in code that tells you not to share it", cues: ["your code is", "verification code", "don't share", "never ask", "expires"] },
  { id: "legit-appointment", scamType: "none", title: "Appointment or order reminder with nothing to pay", cues: ["reminder", "appointment", "reply c to confirm", "see you", "pickup", "ready"] },
];

export interface LibraryMatch {
  pattern: LibraryPattern;
  /** 0..1 share of the pattern's cues found in the text. */
  similarity: number;
  matchedCues: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word cue match ("pin" must not match "shopping"); allows plurals. */
const cueRe = (cue: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(norm(cue))}s?(?![\\p{L}\\p{N}])`, "u");

export function searchScamLibrary(text: string, limit = 3): LibraryMatch[] {
  const t = norm(text);
  return SCAM_LIBRARY.map((pattern) => {
    const matchedCues = pattern.cues.filter((cue) => cueRe(cue).test(t));
    return { pattern, matchedCues, similarity: matchedCues.length / pattern.cues.length };
  })
    .filter((m) => m.matchedCues.length >= 2)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Library similarity → log-odds. Modest on purpose: it corroborates, it doesn't decide. */
export function libraryWeight(match: LibraryMatch): number {
  if (match.similarity < 0.3) return 0;
  const w = Math.min(1.0, match.similarity * 1.4);
  return Math.round((match.pattern.scamType === "none" ? -w : w) * 100) / 100;
}
