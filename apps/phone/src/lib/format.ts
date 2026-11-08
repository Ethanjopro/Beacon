import {
  SCAM_TYPE_LABELS,
  labelFor,
  type EvidenceSource,
  type PublicContact,
  type ScamType,
  type Stage,
  type VerdictLabel,
  type VerifyChannel,
} from "@beacon/shared";

/** User-facing words and number formats. One place, so copy stays consistent. */

export function formatHandle(handle: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(handle);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : handle;
}

/** 0.973 → "97%", 0.996 → "99.6%", 0.004 → "0.4%" — never claims 100% or 0%. */
export function formatPct(p: number): string {
  const pct = p * 100;
  if (pct >= 99 || pct < 1) return `${Math.min(99.9, Math.max(0.1, pct)).toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(pct)}%`;
}

/** "62% to 81%", or "about 99.9%" when the band has collapsed to one value. */
export function formatRange(lo: number, hi: number): string {
  const a = formatPct(lo);
  const b = formatPct(hi);
  return a === b ? `about ${a}` : `${a} to ${b}`;
}

export function formatWeight(w: number): string {
  const sign = w > 0 ? "+" : w < 0 ? "−" : "±";
  return `${sign}${Math.abs(w).toFixed(1)}`;
}

export const LABEL_TEXT: Record<VerdictLabel, string> = {
  scam: "Scam",
  suspicious: "Suspicious",
  safe: "Looks safe",
};

/** Tailwind-friendly color var per verdict. */
export const LABEL_COLOR: Record<VerdictLabel, string> = {
  scam: "var(--color-scam)",
  suspicious: "var(--color-warn)",
  safe: "var(--color-safe)",
};

export const colorForP = (p: number) => LABEL_COLOR[labelFor(p)];

export function scamTypeText(t: ScamType): string {
  return SCAM_TYPE_LABELS[t];
}

/** Short labels for the judges' stage rail. */
export const STAGE_SHORT: Record<Stage, string> = {
  ingest: "Received",
  triage: "On-device",
  analyze: "Nemotron",
  challenge: "Claim",
  verify: "Ask",
  verdict: "Verdict",
  recover: "Plan",
};

export const STAGE_TEXT: Record<Stage, string> = {
  ingest: "Received",
  triage: "On-device check",
  analyze: "Nemotron analysis",
  challenge: "Find the claim",
  verify: "Ask the real person",
  verdict: "Verdict",
  recover: "Safety plan",
};

export const SOURCE_TEXT: Record<EvidenceSource, string> = {
  heuristic: "On-device",
  classifier: "Classifier",
  llm: "Nemotron",
  tool: "Lookup",
  verification: "Real person",
};

export const CHANNEL_TEXT: Record<VerifyChannel, string> = {
  imessage: "iMessage",
  sms: "text",
  whatsapp: "WhatsApp",
  call: "a call",
  simulator: "iMessage (simulated)",
};

/** Saved contact for a handle, if any. */
export function contactForHandle(contacts: PublicContact[], handle: string): PublicContact | undefined {
  return contacts.find((c) => c.handles.includes(handle));
}

/** What the phone shows as the conversation title. */
export function displayNameFor(contacts: PublicContact[], handle: string, claimed?: string): string {
  return contactForHandle(contacts, handle)?.name ?? (claimed ? claimed : formatHandle(handle));
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function plainVerdict(label: VerdictLabel, contactName?: string): { title: string; body: string } {
  switch (label) {
    case "scam":
      return {
        title: "This is a scam.",
        body: contactName
          ? `We asked the real ${contactName}. It wasn't them. Don't reply, don't pay, and don't share any codes.`
          : "Don't reply, don't tap any links, and don't pay anything.",
      };
    case "suspicious":
      return {
        title: "Be careful with this one.",
        body: contactName
          ? `We couldn't confirm it with ${contactName}. Call them on their saved number before you do anything.`
          : "Something isn't right. Check with someone you trust before you act.",
      };
    case "safe":
      return { title: "This looks fine.", body: "Nothing in this message asks for money, codes or personal details." };
  }
}
