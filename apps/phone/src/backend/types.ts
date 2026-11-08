import type { PublicContact, ScenarioSummary, TraceEvent, VerificationRequest } from "@beacon/shared";
import type { ConnectionStatus } from "../lib/stream";

/**
 * Everything the UI needs from "the server". Two implementations:
 * `LiveBackend` (HTTP + SSE to apps/server) and `MockBackend` (`?mock=1`,
 * canned traces in the browser). Screens never know which one they have.
 */
export interface BackendHandlers {
  onTrace: (event: TraceEvent, meta: { replay: boolean }) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** The demo was reset (here or from another window). */
  onReset: () => void;
}

export interface Backend {
  readonly mode: "live" | "mock";
  connect(handlers: BackendHandlers): () => void;
  contacts(): Promise<PublicContact[]>;
  scenarios(): Promise<ScenarioSummary[]>;
  fire(scenarioId: string): Promise<{ eventId: string }>;
  pendingVerifications(): Promise<VerificationRequest[]>;
  /** Reply as the trusted contact. */
  reply(requestId: string, text: string, from?: string): Promise<void>;
  reset(): Promise<void>;
  /** Subscribe to pending-verification changes; live mode polls. */
  watchPending(onChange: (pending: VerificationRequest[]) => void): () => void;
  /** Mock only: let scripted contacts answer by themselves. */
  autoReply?: { get(): boolean; set(on: boolean): void };
}
