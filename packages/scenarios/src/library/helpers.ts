import { Scenario, type ScenarioInput, type TranscriptSegment } from "@beacon/shared";

/** Validate at import time so a typo in a scenario fails fast, not mid-demo. */
export const defineScenario = (input: ScenarioInput): Scenario => Scenario.parse(input);

/** Build a timed call transcript; `atMs` is seconds from call start. */
export function callTranscript(lines: Array<[speaker: "caller" | "user", atSec: number, text: string]>): TranscriptSegment[] {
  return lines.map(([speaker, atSec, text]) => ({ speaker, atMs: Math.round(atSec * 1000), text }));
}

/** Flatten a transcript into the `body` string the agent sees for calls. */
export const flattenTranscript = (t: TranscriptSegment[]): string =>
  t.map((s) => `${s.speaker === "caller" ? "Caller" : "You"}: ${s.text}`).join("\n");
