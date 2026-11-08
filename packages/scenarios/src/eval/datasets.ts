import type { NewEvent, ScamType, VerdictLabel } from "@beacon/shared";
import { scenarioToEvent } from "../index.js";
import { scenarios } from "../library.js";
import { loadTmobile, tmobileItemToEvent } from "../tmobile/adapter.js";

/** One thing to score: an event plus its ground truth. */
export interface EvalItem {
  id: string;
  event: NewEvent;
  truthLabel: VerdictLabel;
  truthScam: boolean;
  truthType: ScamType;
  /** Scripted trusted-contact reply (library only). Undefined → verification times out. */
  contactReply?: string;
  /** Baseline classifier's scam/not prediction, if the dataset has one. */
  baseline?: boolean;
}

export type DatasetName = "library" | "tmobile";

export type DatasetResult = { ok: true; items: EvalItem[] } | { ok: false; message: string };

export function libraryItems(): EvalItem[] {
  return scenarios.map((s) => ({
    id: s.id,
    event: scenarioToEvent(s),
    truthLabel: s.expected.label,
    truthScam: s.expected.label !== "safe",
    truthType: s.expected.scamType,
    contactReply: s.trustedContactReply?.text,
  }));
}

export function loadDataset(name: DatasetName, tmobileDir: string): DatasetResult {
  if (name === "library") return { ok: true, items: libraryItems() };
  const res = loadTmobile(tmobileDir);
  if (!res.ok) return res;
  return {
    ok: true,
    items: res.items.map((t) => ({
      id: t.id,
      event: tmobileItemToEvent(t),
      truthLabel: t.isScam ? "scam" : "safe",
      truthScam: t.isScam,
      truthType: t.type ?? (t.isScam ? "other" : "none"),
      baseline: t.baseline,
    })),
  };
}
