/**
 * Scenario runner CLI.
 *   pnpm scenarios                       list scenarios
 *   pnpm scenario <id> [--server URL]    fire one at the running server
 *   pnpm -F @beacon/scenarios demo       cue mode for the stage run-sheet
 *   pnpm eval [--dataset library|tmobile] [--provider mock|nvidia] [--limit N]
 * CENG 2 owns this file — see packages/scenarios/AGENTS.md.
 */
import { demoScenarios } from "./library.js";
import { listScenarios } from "./index.js";
import { evalCommand } from "./eval/index.js";
import { DEFAULT_SERVER, fireScenario, runDemo, ServerDownError } from "./runner.js";

const [command, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const server = (flag("--server") ?? process.env.BEACON_SERVER_URL ?? DEFAULT_SERVER).replace(/\/$/, "");

async function main(): Promise<void> {
  switch (command) {
    case "list": {
      for (const s of listScenarios()) {
        const tags = s.tags.length ? `  [${s.tags.join(",")}]` : "";
        console.log(`${s.id.padEnd(30)} ${s.kind.padEnd(9)} ${s.expected.label.padEnd(10)} ${s.title}${tags}`);
      }
      return;
    }
    case "fire": {
      const id = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--server");
      if (!id) throw new Error("usage: pnpm scenario <scenario-id> [--server URL]");
      const eventId = await fireScenario(id, server);
      console.log(`fired ${id} -> event ${eventId}`);
      return;
    }
    case "demo":
      return runDemo(demoScenarios, server);
    case "eval":
      return evalCommand(rest);
    default:
      console.log("commands: list | fire <id> [--server URL] | demo | eval [--dataset library|tmobile] [--provider mock|nvidia] [--limit N]");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(err instanceof ServerDownError ? 2 : 1);
});
