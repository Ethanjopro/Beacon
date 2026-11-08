import { VerifyChannel, type PublicContact, type TrustedContact } from "@beacon/shared";

/** Never expose the safe word over HTTP. */
export function toPublicContact({ safeWord, ...rest }: TrustedContact): PublicContact {
  return { ...rest, hasSafeWord: Boolean(safeWord?.trim()) };
}

/**
 * Applies `BEACON_VERIFY_<CONTACT_ID>=<channel>:<handle>` overrides, so a teammate's
 * real phone can play "Mom" without committing a number. Returns new objects.
 */
export function applyVerifyOverrides(contacts: TrustedContact[], env: Record<string, string | undefined>): TrustedContact[] {
  return contacts.map((contact) => {
    const key = `BEACON_VERIFY_${contact.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const raw = env[key]?.trim();
    if (!raw) return { ...contact };
    const sep = raw.indexOf(":");
    const channel = VerifyChannel.safeParse(raw.slice(0, sep));
    const handle = raw.slice(sep + 1).trim();
    if (sep < 0 || !channel.success || !handle) {
      console.warn(`[beacon] ignoring ${key}: expected <channel>:<handle> (channels: ${VerifyChannel.options.join(", ")})`);
      return { ...contact };
    }
    return { ...contact, verifyVia: { channel: channel.data, handle } };
  });
}
