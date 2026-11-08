import { describe, expect, it } from "vitest";
import { createAgent } from "@beacon/agent";
import { IncomingEvent, type TraceBody, type VerificationResult } from "@beacon/shared";
import { scenarios, scenarioToEvent, trustedContacts } from "../src/index.js";

/**
 * End-to-end sanity check: every scenario in the library, run through the agent
 * with a simulated trusted contact, lands on its expected label. This is the
 * contract between CENG 2 (scenarios) and SWE 1 (agent) — keep it green.
 */
describe("scenario library × agent", () => {
  // "screener" calls are decided live by the Nemotron call screener, not this text pipeline (see eval-calls).
  for (const scenario of scenarios.filter((s) => !s.tags.includes("screener"))) {
    it(`${scenario.id} → ${scenario.expected.label}`, async () => {
      const trace: TraceBody[] = [];
      const agent = createAgent(
        {
          contacts: () => trustedContacts,
          emit: (_id, body) => trace.push(body),
          // Simulated trusted contact: answers with the scenario's scripted reply.
          verify: async (req): Promise<VerificationResult> => {
            const reply = scenario.trustedContactReply;
            if (!reply) return { status: "timeout" };
            return { status: "replied", reply: { requestId: req.id, text: reply.text, receivedAt: new Date().toISOString() } };
          },
        },
        { llmProvider: "mock", verifyTimeoutMs: 1000 },
      );
      const event = IncomingEvent.parse({ ...scenarioToEvent(scenario), id: `evt_${scenario.id}`, receivedAt: new Date().toISOString() });
      const verdict = await agent.run(event);
      expect(verdict.label).toBe(scenario.expected.label);
      if (scenario.expected.verification) expect(verdict.verification?.status).toBe(scenario.expected.verification);
      expect(trace.at(-1)?.type).toBe("verdict");
    });
  }
});
