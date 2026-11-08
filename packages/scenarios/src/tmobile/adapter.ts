import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { NewEvent, ScamType } from "@beacon/shared";
import { parseCsvRecords } from "./csv.js";
import { mapTmobileCategory } from "./taxonomy.js";

/** data/tmobile/mapping.json — see data/tmobile/README.md. */
export const TmobileMapping = z.object({
  format: z.enum(["csv", "jsonl"]).default("csv"),
  file: z.string(),
  /** Column / key holding the message text. */
  text: z.string(),
  /** Column / key holding the scam-or-not label. */
  label: z.string(),
  /** Value of `label` that means "scam" (compared case-insensitively as a string). Default: common truthy values. */
  positiveLabel: z.string().optional(),
  /** Column / key holding T-Mobile's category (mapped onto our ScamType). */
  type: z.string().optional(),
  /** Column / key holding the baseline classifier's prediction (same encoding as `label`). */
  baselinePrediction: z.string().optional(),
  /** Optional sender column; falls back to a synthetic handle. */
  sender: z.string().optional(),
});
export type TmobileMapping = z.infer<typeof TmobileMapping>;

export interface TmobileItem {
  id: string;
  text: string;
  isScam: boolean;
  type?: ScamType;
  rawCategory?: string;
  /** Baseline classifier's scam/not prediction, when provided. */
  baseline?: boolean;
  sender?: string;
}

export type LoadResult = { ok: true; items: TmobileItem[]; mapping: TmobileMapping } | { ok: false; message: string };

const TRUTHY = new Set(["1", "true", "yes", "y", "scam", "spam", "fraud", "phishing", "malicious"]);

export function isPositive(value: unknown, positiveLabel?: string): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return positiveLabel !== undefined ? v === positiveLabel.trim().toLowerCase() : TRUTHY.has(v);
}

/** Pure: raw records + mapping → items. Rows without text are skipped. */
export function recordsToItems(records: Array<Record<string, unknown>>, mapping: TmobileMapping): TmobileItem[] {
  const items: TmobileItem[] = [];
  records.forEach((rec, i) => {
    const text = String(rec[mapping.text] ?? "").trim();
    if (!text) return;
    const rawCategory = mapping.type ? String(rec[mapping.type] ?? "") : undefined;
    const isScam = isPositive(rec[mapping.label], mapping.positiveLabel);
    const item: TmobileItem = { id: `tmobile-${i + 1}`, text, isScam };
    if (rawCategory !== undefined) {
      item.rawCategory = rawCategory;
      // A legit row never carries a scam type, whatever the category says.
      item.type = isScam ? mapTmobileCategory(rawCategory) : "none";
    }
    if (mapping.baselinePrediction && rec[mapping.baselinePrediction] !== undefined && rec[mapping.baselinePrediction] !== "") {
      item.baseline = isPositive(rec[mapping.baselinePrediction], mapping.positiveLabel);
    }
    if (mapping.sender && rec[mapping.sender]) item.sender = String(rec[mapping.sender]);
    items.push(item);
  });
  return items;
}

export function parseRecords(content: string, format: "csv" | "jsonl"): Array<Record<string, unknown>> {
  if (format === "csv") return parseCsvRecords(content);
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Load the T-Mobile set. Never throws: a missing dir or file is a clear message. */
export function loadTmobile(dir: string): LoadResult {
  const mappingPath = resolve(dir, "mapping.json");
  if (!existsSync(dir)) return { ok: false, message: `No T-Mobile data directory at ${dir}. See data/tmobile/README.md.` };
  if (!existsSync(mappingPath)) return { ok: false, message: `Missing ${mappingPath}. Add mapping.json (see data/tmobile/README.md).` };
  try {
    const mapping = TmobileMapping.parse(JSON.parse(readFileSync(mappingPath, "utf8")));
    const dataPath = resolve(dirname(mappingPath), mapping.file);
    if (!existsSync(dataPath)) return { ok: false, message: `mapping.json points at ${dataPath}, which does not exist.` };
    const items = recordsToItems(parseRecords(readFileSync(dataPath, "utf8"), mapping.format), mapping);
    if (items.length === 0) return { ok: false, message: `No usable rows in ${dataPath} (check the "text" column name in mapping.json).` };
    return { ok: true, items, mapping };
  } catch (err) {
    return { ok: false, message: `Could not read T-Mobile data: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** An item as an event the agent can run on (no contacts, so no verification). */
export function tmobileItemToEvent(item: TmobileItem): NewEvent {
  return {
    id: item.id,
    kind: "sms",
    source: "scenario",
    from: { handle: item.sender ?? "+15550190000" },
    body: item.text,
    threadId: `thread_${item.id}`,
  };
}
