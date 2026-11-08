import type { IncomingEvent } from "./events.js";
import type { TrustedContact } from "./contacts.js";
import type { TraceBody } from "./trace.js";
import type { Verdict } from "./verdict.js";
import type { VerificationReply, VerificationRequest } from "./verification.js";

/**
 * What the host hands back from `AgentDeps.verify`. The host only DELIVERS the
 * question and COLLECTS the raw reply; deciding what the reply means
 * ("No?? I'm at home" → denied) is the agent's job, which then emits
 * `verification.resolved` with a full VerificationOutcome.
 */
export type VerificationResult =
  | { status: "replied"; reply: VerificationReply }
  | { status: "timeout" | "unreachable"; detail?: string };

/**
 * The seam between apps/server (or the eval harness) and packages/agent.
 * The agent is a pure library: it never opens sockets or reads env vars itself;
 * everything it needs comes in through AgentDeps / AgentConfig.
 */
export interface AgentConfig {
  /** "mock" = deterministic offline brain; "nvidia" = Nemotron via NIM. */
  llmProvider: "mock" | "nvidia";
  /** Deep model: reasoning + tool calling. */
  model: string;
  /** Fast model: triage / reply interpretation. */
  fastModel: string;
  apiKey?: string;
  baseUrl: string;
  /** How long to wait for a trusted contact before marking verification `timeout`. */
  verifyTimeoutMs: number;
  /** Opt-in: allow replying to the suspicious sender (e.g. ask for the family safe word). Default false. */
  allowSenderChallenge: boolean;
  /** If local triage puts pScam below this, skip the cloud LLM entirely (privacy + cost). */
  skipCloudBelow: number;
  /** If local triage puts pScam at/above this (and no trusted contact is involved), decide on-device too. */
  skipCloudAbove: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  llmProvider: "mock",
  model: "nvidia/nemotron-3-super-120b-a12b",
  fastModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  verifyTimeoutMs: 45_000,
  allowSenderChallenge: false,
  skipCloudBelow: 0.08,
  skipCloudAbove: 0.97,
};

export interface AgentDeps {
  /** The trusted-contact registry (includes safe words — keep them local). */
  contacts: () => TrustedContact[];
  /**
   * Ask a trusted contact out-of-band. Protocol:
   *   1. agent emits `verification.requested` (so the UI and apps/channels see it),
   *   2. agent awaits `verify(request)` — the host delivers the question (Photon or
   *      simulator) and resolves with the raw reply, or `timeout` after
   *      `request.timeoutMs`. It MUST resolve, never reject.
   *   3. agent interprets the reply and emits `verification.resolved`.
   */
  verify: (request: VerificationRequest) => Promise<VerificationResult>;
  /** Stream progress to the UI. Fire-and-forget; must never throw. */
  emit: (eventId: string, body: TraceBody) => void;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export interface Agent {
  readonly config: AgentConfig;
  /** Run the full pipeline on one event and return the final verdict. Never throws for bad input; emits `error` and returns a conservative verdict instead. */
  run: (event: IncomingEvent) => Promise<Verdict>;
}

/** Reads AgentConfig overrides from an env-like object. Hosts call this; the agent never reads process.env. */
export function agentConfigFromEnv(env: Record<string, string | undefined>): AgentConfig {
  const provider = env.LLM_PROVIDER === "nvidia" && env.NVIDIA_API_KEY ? "nvidia" : "mock";
  return {
    ...DEFAULT_AGENT_CONFIG,
    llmProvider: provider,
    model: env.NEMOTRON_MODEL || DEFAULT_AGENT_CONFIG.model,
    fastModel: env.NEMOTRON_FAST_MODEL || DEFAULT_AGENT_CONFIG.fastModel,
    apiKey: env.NVIDIA_API_KEY || undefined,
    baseUrl: env.NVIDIA_BASE_URL || DEFAULT_AGENT_CONFIG.baseUrl,
    verifyTimeoutMs: Number(env.VERIFY_TIMEOUT_MS) || DEFAULT_AGENT_CONFIG.verifyTimeoutMs,
    allowSenderChallenge: env.ALLOW_SENDER_CHALLENGE === "true",
  };
}
