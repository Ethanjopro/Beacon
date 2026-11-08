/**
 * Every way a call can reach Magenta-Guard is normalized here into ONE shape
 * before the screener sees it: an IncomingEvent of kind "call", plus the
 * caller's first words and (sim only) a script. Sim injection, scenario fire
 * and the Photon webhook all go through the same function, so the pipeline
 * after this point can't tell them apart.
 */
import { NewCall, type NewEvent, type Scenario } from "@beacon/shared";

export interface NormalizedCall {
  event: NewEvent & { kind: "call" };
  /** What the caller says right after the greeting, if we already know it. */
  firstWords?: string;
  /** Sim only: further caller lines, one per time the screener listens. */
  script?: string[];
}

const clean = (s: string | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

/** POST /api/calls (sim injection, judge input). Throws a ZodError on bad input. */
export function normalizeSimCall(input: unknown): NormalizedCall {
  const call = NewCall.parse(input);
  const displayName = clean(call.from.displayName);
  return {
    event: {
      kind: "call",
      source: call.source,
      from: { handle: call.from.handle.trim(), ...(displayName ? { displayName } : {}) },
      body: "",
      threadId: `call_${call.from.handle.trim()}`,
      ...(call.scenarioId ? { scenarioId: call.scenarioId } : {}),
    },
    firstWords: clean(call.firstWords),
  };
}

/** A call scenario from the library: same normalized shape, with the caller's lines as a script. */
export function normalizeScenarioCall(scenario: Scenario): NormalizedCall {
  const lines = scenario.callerScript ?? (scenario.event.transcript ?? []).filter((s) => s.speaker === "caller").map((s) => s.text);
  const [firstWords, ...script] = lines;
  const base = normalizeSimCall({ from: scenario.event.from, source: "scenario", scenarioId: scenario.id, firstWords });
  return { ...base, script };
}

/** A generic NewEvent of kind "call" (e.g. from apps/channels): its transcript's caller lines become the script. */
export function normalizeEventCall(event: NewEvent): NormalizedCall {
  const lines = (event.transcript ?? []).filter((s) => s.speaker === "caller").map((s) => s.text);
  const [firstWords, ...script] = lines.length ? lines : event.body ? [event.body] : [];
  return {
    event: { ...event, kind: "call", body: "", transcript: undefined },
    firstWords: clean(firstWords),
    script,
  };
}
