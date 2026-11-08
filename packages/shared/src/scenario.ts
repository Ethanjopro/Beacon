import { z } from "zod";
import { EventKind, Party, TranscriptSegment, IncomingEvent } from "./events.js";
import { ScamType } from "./taxonomy.js";
import { VerdictLabel } from "./verdict.js";
import { VerificationStatus } from "./verification.js";

/**
 * A scripted attack (or a legitimate control) the demo can fire on cue,
 * and the eval harness can score. Synthetic only — no real people's data.
 */
export const Scenario = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  /** One sentence for the demo console. */
  summary: z.string(),
  /** "demo" = on the stage run-sheet; "control" = legit message; "injection" = tries to jailbreak the agent. */
  tags: z.array(z.string()).default([]),
  /** Ground truth for eval and sanity checks. */
  expected: z.object({
    label: VerdictLabel,
    scamType: ScamType,
    /** If the scenario involves a trusted contact, what verification should find. */
    verification: VerificationStatus.optional(),
  }),
  event: z.object({
    kind: EventKind,
    from: Party,
    body: z.string().default(""),
    transcript: z.array(TranscriptSegment).optional(),
    audioUrl: z.string().optional(),
    exposure: IncomingEvent.shape.exposure,
  }),
  /**
   * Calls only: what the simulated caller says, one line per time the screener
   * stops to listen. Defaults to the transcript's caller segments.
   */
  callerScript: z.array(z.string().min(1)).optional(),
  /**
   * How the REAL trusted contact answers when Beacon asks, in simulator mode.
   * Omit to simulate no answer (timeout). In live mode a teammate's phone answers.
   */
  trustedContactReply: z
    .object({
      contactId: z.string(),
      text: z.string(),
      delayMs: z.number().int().nonnegative().default(2500),
    })
    .optional(),
});
export type Scenario = z.infer<typeof Scenario>;
export type ScenarioInput = z.input<typeof Scenario>;

export const ScenarioSummary = Scenario.pick({ id: true, title: true, summary: true, tags: true, expected: true }).extend({
  kind: EventKind,
});
export type ScenarioSummary = z.infer<typeof ScenarioSummary>;
