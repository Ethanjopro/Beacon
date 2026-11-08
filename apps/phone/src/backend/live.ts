import { createApi, type BeaconApi } from "../lib/api";
import { openTraceStream } from "../lib/stream";
import { onDemoReset, broadcastDemoReset } from "./resetChannel";
import type { Backend, BackendHandlers } from "./types";

/** Talks to apps/server through the shared `API` routes (Vite proxies /api). */
export class LiveBackend implements Backend {
  readonly mode = "live" as const;
  private resetLocal?: () => void;

  constructor(private readonly api: BeaconApi = createApi()) {}

  connect(handlers: BackendHandlers): () => void {
    const stream = openTraceStream({ onTrace: handlers.onTrace, onStatus: handlers.onStatus });
    const handleReset = () => {
      stream.resetCursor();
      handlers.onReset();
    };
    this.resetLocal = handleReset;
    // The server has no "reset" trace event, so console windows tell each other.
    const stopListening = onDemoReset(handleReset);
    return () => {
      stopListening();
      stream.close();
      this.resetLocal = undefined;
    };
  }

  contacts = () => this.api.contacts();
  scenarios = () => this.api.scenarios();
  fire = (id: string) => this.api.fireScenario(id);
  pendingVerifications = () => this.api.pendingVerifications();

  async reply(requestId: string, text: string, from?: string): Promise<void> {
    await this.api.replyToVerification(requestId, { text, ...(from ? { from } : {}) });
  }

  async reset(): Promise<void> {
    await this.api.reset();
    this.resetLocal?.();
    broadcastDemoReset();
  }

  watchPending(onChange: Parameters<Backend["watchPending"]>[0]): () => void {
    let stopped = false;
    const poll = async () => {
      try {
        const pending = await this.api.pendingVerifications();
        if (!stopped) onChange(pending);
      } catch {
        /* server down — the status pill already says so */
      }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
