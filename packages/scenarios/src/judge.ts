/**
 * `pnpm judge` — be the scammer from a terminal. You type what the caller
 * says; it goes through the same pipeline as every other call
 * (POST /api/calls → normalize → Nemotron screener) and Magenta-Guard's
 * answers stream back live. Nothing here is scripted: the agent reacts to
 * whatever you type.
 *
 *   pnpm judge                      prompts for the caller ID name and first line
 *   pnpm judge "Grandma it's me…"   starts with that line
 *   --server URL                    default BEACON_SERVER_URL or http://localhost:8787
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, env } from "node:process";
import { API, TraceEvent } from "@beacon/shared";
import { DEFAULT_SERVER } from "./runner.js";

const args = argv.slice(2);
const serverFlag = args.indexOf("--server");
const server = (serverFlag >= 0 ? args.splice(serverFlag, 2)[1] : undefined) ?? env.BEACON_SERVER_URL ?? DEFAULT_SERVER;
const rl = createInterface({ input: stdin, output: stdout });
let inputClosed = false;
rl.on("close", () => (inputClosed = true)); // piped input ran out: keep listening until the verdict

async function post(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${server}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    console.error(`Can't reach the server at ${server}. Start it with \`pnpm dev\`.`);
    process.exit(2);
  }
}

/** Follows the SSE stream for one call; resolves when the verdict lands. */
async function follow(callId: string, onAgentLine: () => void): Promise<void> {
  const res = await fetch(`${server}${API.stream}?since=0`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").find((l) => l.startsWith("data: "));
      if (!data) continue;
      const parsed = TraceEvent.safeParse(JSON.parse(data.slice(6)));
      if (!parsed.success || parsed.data.eventId !== callId) continue;
      const t = parsed.data;
      if (t.type === "call.turn" && t.speaker === "agent") {
        console.log(`\n  Magenta-Guard: ${t.text}`);
        onAgentLine();
      } else if (t.type === "tool" && t.status === "result") console.log(`    · ${t.name}: ${t.summary}`);
      else if (t.type === "verification.requested") console.log(`    · calling the real contact on their saved number…`);
      else if (t.type === "error") console.log(`    ! ${t.message}`);
      else if (t.type === "call.verdict") {
        const r = t.result;
        console.log(`\n  VERDICT ${r.verdict.verdict} · ${r.verdict.confidence}% · ${r.action}${r.decidedBy === "error" ? " (model unreachable)" : ""}`);
        for (const e of r.verdict.evidence) console.log(`    - ${e}`);
        console.log(`  Next: ${r.verdict.next_action}\n`);
        await reader.cancel();
        return;
      }
    }
  }
}

const name = (await rl.question("Caller ID name (anything, e.g. Sam): ")).trim();
const first = args.join(" ").trim() || (await rl.question("You (the caller) say: ")).trim();
if (!first) process.exit(0);
const handle = `+1555010${String(1000 + Math.floor(Math.random() * 9000))}`;
const res = await post(API.calls, { from: { handle, ...(name ? { displayName: name } : {}) }, firstWords: first });
if (!res.ok) {
  console.error(`Server refused the call (${res.status}).`);
  process.exit(1);
}
const { callId } = (await res.json()) as { callId: string };
console.log(`Calling the protected phone from ${handle}… (call ${callId})`);

let ended = false;
let asking = false;
const done = follow(callId, () => {
  if (asking || ended || inputClosed) return;
  asking = true;
  // Prompt after the agent speaks; the next agent line arrives only after we answer.
  void rl.question("  You: ").then(async (line) => {
    asking = false;
    if (ended || !line.trim()) return;
    const r = await post(API.callSay(callId), { text: line.trim() });
    if (r.status === 404) console.log("  (the call already ended)");
  });
}).then(() => {
  ended = true;
});
await done;
if (!inputClosed) rl.close();
process.exit(0);
