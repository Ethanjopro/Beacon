/**
 * @beacon/scenarios — synthetic attack library, trusted-contact registry,
 * scenario runner and eval harness. Public API below is consumed by
 * apps/server; keep the signatures stable.
 */
import type { NewEvent, Scenario, ScenarioSummary } from "@beacon/shared";
import { scenarios } from "./library.js";

export { scenarios } from "./library.js";
export { trustedContacts } from "./contacts.js";

export function listScenarios(): ScenarioSummary[] {
  return scenarios.map(({ id, title, summary, tags, expected, event }) => ({ id, title, summary, tags, expected, kind: event.kind }));
}

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

/** Turn a scenario into the event the server ingests. */
export function scenarioToEvent(scenario: Scenario): NewEvent {
  return {
    ...scenario.event,
    source: "scenario",
    scenarioId: scenario.id,
    threadId: `thread_${scenario.event.from.handle}`,
  };
}
