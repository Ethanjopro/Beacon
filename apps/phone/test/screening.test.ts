import { describe, expect, it } from "vitest";
import type { TraceBody, TraceEvent } from "@beacon/shared";
import { initialPhoneState, isScreenedCall, phoneReducer } from "../src/state/reducer";

let seq = 0;
const at = "2026-11-08T12:00:00.000Z";
const t = (body: TraceBody): TraceEvent => ({ seq: ++seq, eventId: "call_1", at, ...body }) as TraceEvent;

describe("reducer: screened calls", () => {
  it("folds call turns, status and the screening verdict", () => {
    const items: TraceBody[] = [
      { type: "event.received", event: { id: "call_1", kind: "call", source: "simulator", from: { handle: "+15550104417" }, body: "", receivedAt: at } },
      { type: "call.status", status: "screening", note: "Answered by Magenta-Guard." },
      { type: "call.turn", speaker: "agent", text: "Hi, I'm Magenta-Guard, an AI assistant. Who's calling?" },
      { type: "call.turn", speaker: "caller", text: "Grandma, it's me, Sam." },
      { type: "score", pScam: 0.62 },
      {
        type: "call.verdict",
        result: {
          callId: "call_1",
          verdict: { verdict: "SCAM", confidence: 93, evidence: ["Wrong code word."], next_action: "Blocked." },
          action: "block",
          checks: { codeWord: "failed", callback: "denied" },
          decidedBy: "nemotron",
          turns: 1,
          latencyMs: 4200,
          decidedAt: at,
        },
      },
      { type: "call.status", status: "blocked" },
    ];
    const state = items.reduce((s, body) => phoneReducer(s, { type: "trace", event: t(body) }), initialPhoneState);
    const view = state.byId.call_1!;
    expect(isScreenedCall(view)).toBe(true);
    expect(view.turns.map((x) => x.speaker)).toEqual(["agent", "caller"]);
    expect(view.callStatus).toEqual({ status: "blocked" });
    expect(view.pScam).toBe(0.62);
    expect(view.screening?.verdict.verdict).toBe("SCAM");
  });
});
