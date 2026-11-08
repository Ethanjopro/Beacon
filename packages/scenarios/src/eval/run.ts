import { createAgent } from "@beacon/agent";
import { agentConfigFromEnv, IncomingEvent, type AgentConfig, type VerificationResult } from "@beacon/shared";
import { trustedContacts } from "../contacts.js";
import type { EvalItem } from "./datasets.js";
import type { Prediction } from "./metrics.js";

export interface RunOptions {
  provider: "mock" | "nvidia";
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}

function configFor(provider: "mock" | "nvidia"): Partial<AgentConfig> {
  const base = agentConfigFromEnv({ ...process.env, LLM_PROVIDER: provider });
  if (provider === "nvidia" && base.llmProvider !== "nvidia") throw new Error("--provider nvidia needs NVIDIA_API_KEY in the environment.");
  // Short timeout: scripted replies are instant and datasets without contacts time out at once.
  return { ...base, verifyTimeoutMs: 1000 };
}

/** Run the agent in-process over every item and collect predictions. */
export async function runEval(items: EvalItem[], opts: RunOptions): Promise<Prediction[]> {
  const config = configFor(opts.provider);
  const selected = opts.limit ? items.slice(0, opts.limit) : items;
  const preds: Prediction[] = [];

  for (const item of selected) {
    // Fresh agent per item so per-thread memory never leaks between items.
    const agent = createAgent(
      {
        contacts: () => trustedContacts,
        emit: () => {},
        verify: async (req): Promise<VerificationResult> =>
          item.contactReply === undefined
            ? { status: "timeout", detail: "eval: no scripted reply" }
            : { status: "replied", reply: { requestId: req.id, text: item.contactReply, receivedAt: new Date().toISOString() } },
      },
      config,
    );
    const event = IncomingEvent.parse({ ...item.event, id: item.event.id ?? `evt_${item.id}`, receivedAt: new Date().toISOString() });
    const started = performance.now();
    const verdict = await agent.run(event);
    preds.push({
      id: item.id,
      truthScam: item.truthScam,
      truthLabel: item.truthLabel,
      truthType: item.truthType,
      predLabel: verdict.label,
      predType: verdict.scamType,
      pScam: verdict.pScam,
      // Wall-clock around the whole run; falls back to the agent's own number if larger.
      latencyMs: Math.max(performance.now() - started, verdict.latencyMs),
      sentToCloud: verdict.privacy.sentToCloud,
    });
    opts.onProgress?.(preds.length, selected.length);
  }
  return preds;
}
