import type {
  IncomingEvent,
  PrivacyReport,
  Signal,
  Stage,
  TraceEvent,
  VerificationOutcome,
  VerificationRequest,
  Verdict,
} from "@beacon/shared";

/**
 * Pure state for everything Beacon has seen, keyed by eventId. The UI only
 * ever derives from this; the stream and the mock both feed it TraceEvents.
 */

export type StageStatus = "started" | "completed" | "skipped";

export interface EventView {
  eventId: string;
  event?: IncomingEvent;
  /** Every trace item for this event, in seq order, deduplicated. */
  trace: TraceEvent[];
  stages: Partial<Record<Stage, StageStatus>>;
  /** Most recently started stage that hasn't finished. */
  activeStage?: Stage;
  signals: Signal[];
  /** Running pScam (latest `score`, or the verdict's). */
  pScam?: number;
  verification?: { request?: VerificationRequest; outcome?: VerificationOutcome };
  privacy?: PrivacyReport;
  verdict?: Verdict;
  errors: string[];
  /** ISO time of the first trace item we saw — used to time call transcripts. */
  firstAt: string;
}

export interface PhoneState {
  byId: Record<string, EventView>;
  /** Event ids, newest first. */
  order: string[];
}

export type PhoneAction = { type: "trace"; event: TraceEvent } | { type: "reset" };

export const initialPhoneState: PhoneState = { byId: {}, order: [] };

export function phoneReducer(state: PhoneState, action: PhoneAction): PhoneState {
  switch (action.type) {
    case "reset":
      return initialPhoneState;
    case "trace":
      return applyTrace(state, action.event);
  }
}

function emptyView(ev: TraceEvent): EventView {
  return { eventId: ev.eventId, trace: [], stages: {}, signals: [], errors: [], firstAt: ev.at };
}

function applyTrace(state: PhoneState, ev: TraceEvent): PhoneState {
  const prev = state.byId[ev.eventId];
  if (prev?.trace.some((t) => t.seq === ev.seq)) return state; // duplicate (replay after reconnect)

  const view = foldTrace(prev ?? emptyView(ev), ev);
  const order = prev ? state.order : [ev.eventId, ...state.order];
  return { byId: { ...state.byId, [ev.eventId]: view }, order };
}

function insertBySeq(trace: TraceEvent[], ev: TraceEvent): TraceEvent[] {
  const last = trace[trace.length - 1];
  if (!last || last.seq < ev.seq) return [...trace, ev];
  return [...trace, ev].sort((a, b) => a.seq - b.seq);
}

function foldTrace(view: EventView, ev: TraceEvent): EventView {
  const next: EventView = { ...view, trace: insertBySeq(view.trace, ev) };
  switch (ev.type) {
    case "event.received":
      next.event = ev.event;
      break;
    case "stage": {
      next.stages = { ...view.stages, [ev.stage]: ev.status };
      if (ev.status === "started") next.activeStage = ev.stage;
      else if (view.activeStage === ev.stage) next.activeStage = undefined;
      break;
    }
    case "signal":
      next.signals = [...view.signals.filter((s) => s.id !== ev.signal.id), ev.signal];
      break;
    case "score":
      next.pScam = ev.pScam;
      break;
    case "privacy":
      next.privacy = ev.report;
      break;
    case "verification.requested":
      next.verification = { ...view.verification, request: ev.request };
      break;
    case "verification.resolved":
      next.verification = { ...view.verification, outcome: ev.outcome };
      break;
    case "verdict":
      next.verdict = ev.verdict;
      next.pScam = ev.verdict.pScam;
      next.privacy = ev.verdict.privacy;
      next.activeStage = undefined;
      break;
    case "error":
      next.errors = [...view.errors, ev.message];
      break;
    case "thought":
    case "tool":
      break;
  }
  return next;
}

/* ---------- selectors ---------- */

export function latestEvent(state: PhoneState): EventView | undefined {
  const id = state.order[0];
  return id ? state.byId[id] : undefined;
}

export function isVerificationPending(view: EventView): boolean {
  return Boolean(view.verification?.request && !view.verification.outcome);
}

/** Conversation key: explicit threadId, else the sender's handle. */
export function threadKeyOf(event: IncomingEvent): string {
  return event.threadId ?? event.from.handle;
}

/** Events in one conversation, oldest first. */
export function eventsInThread(state: PhoneState, threadKey: string): EventView[] {
  return state.order
    .map((id) => state.byId[id])
    .filter((v): v is EventView => Boolean(v?.event && threadKeyOf(v.event) === threadKey))
    .reverse();
}
