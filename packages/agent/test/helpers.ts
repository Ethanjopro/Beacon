import { IncomingEvent, TrustedContact, type AgentConfig, type TraceBody, type VerificationRequest, type VerificationResult } from "@beacon/shared";
import { createAgent, type AgentInternals } from "../src/index.js";

/** Synthetic registry (555-01xx numbers, *.example domains). */
export const contacts: TrustedContact[] = [
  TrustedContact.parse({
    id: "mom",
    name: "Mom",
    relationship: "family",
    aliases: ["mom", "mother", "mama", "linda"],
    handles: ["+15550100001"],
    verifyVia: { channel: "simulator", handle: "+15550100001" },
    safeWord: "blue heron",
  }),
  TrustedContact.parse({
    id: "sam",
    name: "Sam (grandson)",
    relationship: "family",
    aliases: ["sam", "sammy", "grandson", "your grandson"],
    handles: ["+15550100002"],
    verifyVia: { channel: "simulator", handle: "+15550100002" },
  }),
  TrustedContact.parse({
    id: "bank",
    name: "First Lone Star Bank",
    relationship: "bank",
    aliases: ["first lone star", "lone star bank", "your bank"],
    handles: ["+15550100050", "alerts@firstlonestar.example"],
    domains: ["firstlonestar.example"],
    verifyVia: { channel: "simulator", handle: "+15550100050" },
  }),
];

export const SAFE_WORD = "blue heron";

let n = 0;
export function makeEvent(body: string, from = "+15550109999", extra: Partial<IncomingEvent> = {}): IncomingEvent {
  return IncomingEvent.parse({ id: `evt_${++n}`, kind: "sms", source: "simulator", from: { handle: from }, body, receivedAt: "2026-11-08T12:00:00.000Z", ...extra });
}

export interface Harness {
  trace: TraceBody[];
  requests: VerificationRequest[];
  run: (event: IncomingEvent) => ReturnType<ReturnType<typeof createAgent>["run"]>;
}

/** Agent wired to an in-memory trace and a scripted trusted contact. */
export function harness(opts: { reply?: string; config?: Partial<AgentConfig>; internals?: AgentInternals; verify?: (r: VerificationRequest) => Promise<VerificationResult> } = {}): Harness {
  const trace: TraceBody[] = [];
  const requests: VerificationRequest[] = [];
  const agent = createAgent(
    {
      contacts: () => contacts,
      emit: (_id, body) => trace.push(body),
      verify:
        opts.verify ??
        (async (req) => {
          requests.push(req);
          return opts.reply === undefined
            ? { status: "timeout" }
            : { status: "replied", reply: { requestId: req.id, text: opts.reply, receivedAt: "2026-11-08T12:00:05.000Z" } };
        }),
    },
    { verifyTimeoutMs: 1000, ...opts.config },
    opts.internals,
  );
  return { trace, requests, run: (e) => agent.run(e) };
}

export const stageTrace = (trace: TraceBody[], stage: string) =>
  trace.filter((t): t is Extract<TraceBody, { type: "stage" }> => t.type === "stage" && t.stage === stage).map((t) => t.status);
