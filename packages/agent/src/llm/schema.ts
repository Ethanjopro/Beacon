/**
 * The strict shape of Nemotron's final answer, plus a tolerant JSON extractor
 * (reasoning models wrap answers in <think> blocks, prose or ``` fences).
 */
import { z } from "zod";
import { ScamType } from "@beacon/shared";

export const LlmSignal = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  detail: z.string().max(400).default(""),
  weight: z.number().finite(),
  evidence: z.string().max(200).optional(),
});
export type LlmSignal = z.infer<typeof LlmSignal>;

export const AnalysisOutput = z.object({
  scamType: ScamType.catch("other"),
  claimedContactId: z.string().nullish(),
  claim: z.string().max(400).default(""),
  // Models sometimes answer in percent (85 → 0.85).
  pScam: z.preprocess((v) => (typeof v === "number" && v > 1 && v <= 100 ? v / 100 : v), z.number().min(0).max(1)),
  signals: z.array(LlmSignal).max(8).default([]),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutput>;

export const ReplyInterpretation = z.object({
  status: z.enum(["confirmed", "denied", "unclear"]),
});

/** Pulls the first balanced JSON object out of a model reply. Throws if there isn't one. */
export function extractJson(raw: string): unknown {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*<\/think>/i, "") // unterminated opening tag
    .replace(/```(?:json)?/gi, "");
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    const end = matchingBrace(text, start);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // try the next "{"
    }
  }
  throw new Error("no JSON object in model reply");
}

function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}
