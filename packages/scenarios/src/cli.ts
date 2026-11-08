/**
 * Scenario runner CLI (WALKING SKELETON).
 *   pnpm scenarios            → list scenarios
 *   pnpm scenario <id>        → fire one at the running server
 *   pnpm eval                 → score the agent on the library (+ T-Mobile set if present)
 * CENG 2 owns this file — see packages/scenarios/AGENTS.md for the backlog.
 */
import { API } from "@beacon/shared";
import { listScenarios } from "./index.js";

const server = process.env.BEACON_SERVER_URL ?? "http://localhost:8787";
const [command, arg] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case "list": {
      for (const s of listScenarios()) console.log(`${s.id.padEnd(32)} ${s.expected.label.padEnd(10)} ${s.title}`);
      return;
    }
    case "fire": {
      if (!arg) throw new Error("usage: pnpm scenario <scenario-id>");
      const res = await fetch(`${server}${API.fireScenario(arg)}`, { method: "POST" });
      console.log(res.status, await res.text());
      return;
    }
    case "eval": {
      console.log("eval harness not implemented yet — see packages/scenarios/AGENTS.md");
      return;
    }
    default:
      console.log("commands: list | fire <id> | eval");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
