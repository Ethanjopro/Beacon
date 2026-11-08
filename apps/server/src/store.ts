import type { EventDetail, IncomingEvent, TraceEvent, Verdict, VerificationOutcome } from "@beacon/shared";

/** In-memory events, verdicts and verification outcomes by eventId. */
export class Store {
  private events = new Map<string, IncomingEvent>();
  private verdicts = new Map<string, Verdict>();
  private outcomes = new Map<string, VerificationOutcome>();

  putEvent(event: IncomingEvent): void {
    this.events.set(event.id, event);
  }

  getEvent(id: string): IncomingEvent | undefined {
    return this.events.get(id);
  }

  detail(id: string): EventDetail | undefined {
    const event = this.events.get(id);
    if (!event) return undefined;
    return { event, verdict: this.verdicts.get(id), verification: this.outcomes.get(id) };
  }

  /** Feed every trace event through here; it keeps the interesting bodies. */
  record(trace: TraceEvent): void {
    if (trace.type === "verdict") this.verdicts.set(trace.eventId, trace.verdict);
    else if (trace.type === "verification.resolved") this.outcomes.set(trace.eventId, trace.outcome);
  }

  clear(): void {
    this.events.clear();
    this.verdicts.clear();
    this.outcomes.clear();
  }
}
