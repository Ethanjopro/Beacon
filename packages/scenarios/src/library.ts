import type { Scenario } from "@beacon/shared";
import { controlScenarios } from "./library/controls.js";
import { familyScenarios } from "./library/family.js";
import { callScenarios } from "./library/calls.js";
import { financialScenarios } from "./library/financial.js";
import { lureScenarios } from "./library/lures.js";

/**
 * The full synthetic library (all content fictional). Demo run-sheet order is
 * the explicit DEMO_ORDER below (each id must carry the "demo" tag).
 */
const all: Scenario[] = [...familyScenarios, ...lureScenarios, ...financialScenarios, ...controlScenarios, ...callScenarios];

// Matches docs/DEMO.md: fast & private → ask the real Mom → no false alarm on the real Mom → cloned-voice call.
const DEMO_ORDER = ["toll-smish", "mom-new-number-giftcards", "mom-new-number-confirmed", "grandson-bail-call"];
export const scenarios: Scenario[] = all;

/** Scenarios on the stage run-sheet, in firing order. */
export const demoScenarios: Scenario[] = DEMO_ORDER.map((id) => all.find((s) => s.id === id)!);
