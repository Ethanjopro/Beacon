/**
 * The trusted-contact registry: ground truth for who the subscriber trusts,
 * how to reach them out-of-band, and their family code word. Backed by
 * SQLite (Node's built-in `node:sqlite`, no extra dependency). The data is
 * synthetic; a teammate's real number for the live callback comes from env
 * overrides at boot, never from the committed seed.
 *
 * Code words never leave this module over HTTP: `toRecord` drops them and
 * `checkCode` compares on the server.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { NewTrustedContact, TrustedContact, type CodeWordResult, type TrustedRecord } from "@beacon/shared";
import { codeWordMatches } from "@beacon/agent";

/** Phone numbers compare on their last 10 digits; emails case-insensitively. */
export function normalizeNumber(handle: string): string {
  const h = handle.trim().toLowerCase();
  if (h.includes("@")) return h;
  const digits = h.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || h;
}

interface Row {
  id: string;
  name: string;
  relationship: string;
  aliases: string;
  handles: string;
  domains: string;
  verify_channel: string;
  verify_handle: string;
  code_word: string | null;
}

export class TrustedRegistry {
  private readonly db: DatabaseSync;

  /** `path` = a file, or ":memory:" (tests). Seeds `seed` when the table is empty. */
  constructor(path: string, seed: TrustedContact[] = []) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS trusted_contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      handles TEXT NOT NULL DEFAULT '[]',
      domains TEXT NOT NULL DEFAULT '[]',
      verify_channel TEXT NOT NULL,
      verify_handle TEXT NOT NULL,
      code_word TEXT,
      updated_at TEXT NOT NULL
    )`);
    const { n } = this.db.prepare("SELECT COUNT(*) AS n FROM trusted_contacts").get() as { n: number };
    if (n === 0) for (const c of seed) this.save(c);
  }

  /** Every contact, in insertion order (stable CONTACT_n refs for the model). */
  all(): TrustedContact[] {
    const rows = this.db.prepare("SELECT * FROM trusted_contacts ORDER BY rowid").all() as unknown as Row[];
    return rows.map(fromRow);
  }

  byNumber(number: string): TrustedContact | undefined {
    const n = normalizeNumber(number);
    if (!n) return undefined;
    return this.all().find((c) => [...c.handles, c.verifyVia.handle].some((h) => normalizeNumber(h) === n));
  }

  /** Who a caller claims to be: "Sam", "grandson", "your bank". Exact alias/name match first, then containment. */
  byClaim(claim: string): TrustedContact[] {
    const q = claim.trim().toLowerCase().replace(/^(your|my|the)\s+/, "");
    if (!q) return [];
    const names = (c: TrustedContact) => [c.name, c.name.replace(/\s*\(.*?\)\s*/g, " ").trim(), ...c.aliases].map((a) => a.toLowerCase().replace(/^(your|my|the)\s+/, ""));
    const all = this.all();
    const exact = all.filter((c) => names(c).includes(q));
    return exact.length ? exact : all.filter((c) => names(c).some((a) => a.length >= 3 && (a.includes(q) || q.includes(a))));
  }

  /** Adds a contact, or updates the one that already owns `number`. */
  upsert(input: NewTrustedContact): TrustedContact {
    const data = NewTrustedContact.parse(input);
    const existing = this.byNumber(data.number);
    const handles = existing ? [...new Set([...existing.handles, data.number])] : [data.number];
    const contact = TrustedContact.parse({
      id: existing?.id ?? newId(data.name),
      name: data.name,
      relationship: data.relationship,
      aliases: [...new Set([data.name.toLowerCase(), ...(data.aliases ?? existing?.aliases ?? [])])],
      handles,
      domains: existing?.domains ?? [],
      verifyVia: { channel: "call", handle: data.callbackNumber ?? existing?.verifyVia.handle ?? data.number },
      ...(data.codeWord ? { safeWord: data.codeWord } : existing?.safeWord ? { safeWord: existing.safeWord } : {}),
    });
    this.save(contact);
    return contact;
  }

  checkCode(number: string, attempt: string): CodeWordResult | undefined {
    const contact = this.byNumber(number);
    if (!contact) return undefined;
    const word = contact.safeWord?.trim();
    return { hasCodeWord: Boolean(word), match: Boolean(word) && codeWordMatches(attempt, word!) };
  }

  close(): void {
    this.db.close();
  }

  private save(c: TrustedContact): void {
    this.db
      .prepare(
        `INSERT INTO trusted_contacts (id, name, relationship, aliases, handles, domains, verify_channel, verify_handle, code_word, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship, aliases = excluded.aliases,
           handles = excluded.handles, domains = excluded.domains, verify_channel = excluded.verify_channel,
           verify_handle = excluded.verify_handle, code_word = excluded.code_word, updated_at = excluded.updated_at`,
      )
      .run(
        c.id,
        c.name,
        c.relationship,
        JSON.stringify(c.aliases),
        JSON.stringify(c.handles),
        JSON.stringify(c.domains),
        c.verifyVia.channel,
        c.verifyVia.handle,
        c.safeWord ?? null,
        new Date().toISOString(),
      );
  }
}

/** HTTP view of a contact: never the code word. */
export function toRecord(c: TrustedContact): TrustedRecord {
  return {
    id: c.id,
    name: c.name,
    relationship: c.relationship,
    numbers: c.handles.filter((h) => !h.includes("@")),
    callbackNumber: c.verifyVia.handle,
    hasCodeWord: Boolean(c.safeWord?.trim()),
  };
}

function fromRow(r: Row): TrustedContact {
  return TrustedContact.parse({
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    aliases: JSON.parse(r.aliases),
    handles: JSON.parse(r.handles),
    domains: JSON.parse(r.domains),
    verifyVia: { channel: r.verify_channel, handle: r.verify_handle },
    ...(r.code_word ? { safeWord: r.code_word } : {}),
  });
}

function newId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "contact";
  return `${base}-${randomBytes(2).toString("hex")}`;
}
