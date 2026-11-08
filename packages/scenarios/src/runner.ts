import { createInterface } from "node:readline/promises";
import { API, type Scenario } from "@beacon/shared";

export const DEFAULT_SERVER = "http://localhost:8787";

export class ServerDownError extends Error {}

/** POST a scenario to the running server. Throws friendly errors. */
export async function fireScenario(id: string, server: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${server}${API.fireScenario(id)}`, { method: "POST" });
  } catch {
    throw new ServerDownError(`Can't reach the Beacon server at ${server}. Start it with \`pnpm dev\` (or pass --server URL / set BEACON_SERVER_URL).`);
  }
  const text = await res.text();
  if (res.status === 404) throw new Error(`Server doesn't know scenario "${id}" (404). Run \`pnpm scenarios\` to list ids.`);
  if (!res.ok) throw new Error(`Server returned ${res.status}: ${text}`);
  try {
    return (JSON.parse(text) as { eventId?: string }).eventId ?? text;
  } catch {
    return text;
  }
}

/** Cue mode: one demo scenario per Enter press, showing what's next. */
export async function runDemo(sheet: Scenario[], server: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nBeacon demo run-sheet (${sheet.length} cues) -> ${server}\nPress Enter to fire each cue, Ctrl+C to quit.\n`);
  try {
    for (const [i, s] of sheet.entries()) {
      console.log(`NEXT ${i + 1}/${sheet.length}: ${s.title}  [${s.expected.label}${s.expected.scamType === "none" ? "" : ` / ${s.expected.scamType}`}]`);
      console.log(`      ${s.summary}`);
      await rl.question("      > press Enter to fire ");
      const eventId = await fireScenario(s.id, server);
      console.log(`      fired ${s.id} (event ${eventId})\n`);
    }
    console.log("Run-sheet complete.");
  } finally {
    rl.close();
  }
}
