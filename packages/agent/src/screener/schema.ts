/**
 * The screener's per-turn output from Nemotron, validated strictly but
 * tolerant of common model quirks (percent vs fraction, lowercase labels).
 */
import { z } from "zod";

/** 0.85 → 85; "85" → 85; clamps and rounds. */
const percent = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v.replace("%", "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return v;
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(Math.min(100, Math.max(0, scaled)));
}, z.number().int().min(0).max(100));

export const ModelVerdict = z.object({
  verdict: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.enum(["VERIFIED", "SUSPICIOUS", "SCAM"])),
  confidence: percent,
  evidence: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string().trim().min(1).max(300)).min(1)).transform((e) => e.slice(0, 6)),
  next_action: z.string().trim().min(1).max(400),
});
export type ModelVerdict = z.infer<typeof ModelVerdict>;

export const ModelSignal = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  detail: z.string().max(400).default(""),
  weight: z.number().finite().default(1),
});

export const ScreenerTurnOutput = z.object({
  say: z.string().trim().max(600).nullish(),
  action: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["continue", "end"])),
  risk: percent.optional(),
  claimed_contact: z.string().nullish(),
  note: z.string().trim().max(240).nullish(),
  signals: z.array(ModelSignal).max(8).default([]),
  verdict: ModelVerdict.nullish(),
});
export type ScreenerTurnOutput = z.infer<typeof ScreenerTurnOutput>;
