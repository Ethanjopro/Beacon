/**
 * Handle normalization so "(555) 010-0142", "+1 555-010-0142" and "5550100142"
 * all compare equal. Emails/platform handles are just trimmed + lowercased.
 */
export function normalizeHandle(raw: string): string {
  const s = raw.trim();
  if (s.includes("@")) return s.toLowerCase();
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return s.toLowerCase(); // not a phone number, e.g. a username
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // US national format
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function sameHandle(a: string, b: string): boolean {
  return normalizeHandle(a) === normalizeHandle(b);
}
