import { MOCK_CONTACTS } from "../mock/contacts";
import { MockEngine } from "../mock/engine";
import type { Backend, BackendHandlers } from "./types";

/** `?mock=1`: the whole server, in the browser, with canned traces. */
export class MockBackend implements Backend {
  readonly mode = "mock" as const;
  private resetHandlers = new Set<() => void>();

  constructor(readonly engine: MockEngine = new MockEngine()) {}

  connect(handlers: BackendHandlers): () => void {
    handlers.onStatus("live");
    const unsubscribe = this.engine.subscribe((ev) => handlers.onTrace(ev, { replay: false }));
    this.resetHandlers.add(handlers.onReset);
    return () => {
      unsubscribe();
      this.resetHandlers.delete(handlers.onReset);
    };
  }

  contacts = async () => MOCK_CONTACTS;
  scenarios = async () => this.engine.scenarios();
  fire = async (id: string) => this.engine.fire(id);
  pendingVerifications = async () => this.engine.pendingVerifications();

  async reply(requestId: string, text: string): Promise<void> {
    this.engine.reply(requestId, text);
  }

  async reset(): Promise<void> {
    this.engine.reset();
    for (const fn of this.resetHandlers) fn();
  }

  watchPending(onChange: Parameters<Backend["watchPending"]>[0]): () => void {
    onChange(this.engine.pendingVerifications());
    return this.engine.onChange(() => onChange(this.engine.pendingVerifications()));
  }

  autoReply = {
    get: () => this.engine.autoReply,
    set: (on: boolean) => {
      this.engine.autoReply = on;
    },
  };
}
