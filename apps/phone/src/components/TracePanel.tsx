import { STAGES, labelFor, type Stage } from "@beacon/shared";
import { Keyboard, MessageSquareText, PhoneIncoming } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { formatHandle, LABEL_COLOR, LABEL_TEXT, STAGE_TEXT, STAGE_SHORT, contactForHandle } from "../lib/format";
import type { EventView } from "../state/reducer";
import { useBeacon } from "../state/store";
import { MathCard } from "./MathCard";
import { AnimatedPct, RiskMeter } from "./RiskMeter";
import { TraceTimeline } from "./TraceTimeline";

/**
 * Judges' side panel on desktop: the full agent trace for whatever the phone
 * is showing (or the latest event), a stage rail, and the arithmetic.
 */
export function TracePanel({ view, onOpenConsole }: { view?: EventView; onOpenConsole: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [view?.trace.length]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-harbor-700/80 bg-harbor-900/80" data-testid="trace-panel">
      <div className="flex items-center justify-between border-b border-harbor-700/80 px-6 py-4">
        <h2 className="text-[17px] font-bold">Agent trace</h2>
        <span className="text-[13px] text-ink-3">What Beacon is doing, step by step</span>
      </div>
      {view ? <PanelBody view={view} scroller={scroller} /> : <EmptyPanel onOpenConsole={onOpenConsole} />}
    </aside>
  );
}

function PanelBody({ view, scroller }: { view: EventView; scroller: RefObject<HTMLDivElement | null> }) {
  const { contacts } = useBeacon();
  const ev = view.event;
  const p = view.pScam;
  const label = p === undefined ? undefined : labelFor(p);
  const from = ev ? (contactForHandle(contacts, ev.from.handle)?.name ?? formatHandle(ev.from.handle)) : "";

  return (
    <>
      <div className="border-b border-harbor-700/80 px-6 py-4">
        {ev && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-harbor-700 text-ink-2">
              {ev.kind === "call" ? <PhoneIncoming size={15} /> : <MessageSquareText size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-2">
                {ev.kind === "call" ? "Call" : "Text"} from {from}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-ink">{ev.kind === "call" ? ev.transcript?.[0]?.text : ev.body}</p>
            </div>
          </div>
        )}
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-[13px] text-ink-2">Chance of scam</span>
          {p !== undefined && label && (
            <span className="text-[22px] font-bold" style={{ color: LABEL_COLOR[label] }}>
              <AnimatedPct value={p} /> <span className="text-[15px]">{LABEL_TEXT[label]}</span>
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <RiskMeter p={p} band={view.verdict?.band} />
        </div>
        <StageRail view={view} />
      </div>

      <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <TraceTimeline view={view} />
        {view.verdict && (
          <div className="mt-5">
            <h3 className="mb-2 text-[13px] font-bold text-ink-2">Show your work</h3>
            <MathCard signals={view.verdict.signals} pScam={view.verdict.pScam} />
          </div>
        )}
      </div>
    </>
  );
}

function StageRail({ view }: { view: EventView }) {
  return (
    <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Pipeline stages">
      {STAGES.map((stage: Stage) => {
        const status = view.stages[stage];
        const active = view.activeStage === stage && status === "started";
        const color =
          status === "completed" ? "var(--color-lamp)" : active ? "var(--color-lamp)" : status === "skipped" ? "var(--color-harbor-600)" : "var(--color-harbor-700)";
        return (
          <li key={stage} className="flex flex-col gap-1.5" title={`${STAGE_TEXT[stage]}: ${status ?? "not run"}`}>
            <span
              className={`h-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
              style={{ backgroundColor: color, opacity: status === "skipped" ? 0.6 : 1, backgroundImage: status === "skipped" ? "repeating-linear-gradient(90deg, transparent 0 3px, var(--color-harbor-900) 3px 5px)" : undefined }}
            />
            <span className={`truncate text-[11px] font-semibold leading-tight ${status ? "text-ink-2" : "text-ink-3/60"}`}>{STAGE_SHORT[stage]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyPanel({ onOpenConsole }: { onOpenConsole: () => void }) {
  const { status, backend } = useBeacon();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 text-center" data-testid="trace-empty">
      <p className="text-[19px] font-semibold">Waiting for something suspicious</p>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-2">
        When a text or call arrives, every step Beacon takes shows up here: the evidence, its weight, who it asked, and what left the phone.
      </p>
      {status === "down" && backend.mode === "live" ? (
        <p className="mt-4 max-w-sm text-[14px] text-warn">
          The Beacon server isn't running. Start it with <span className="font-mono">pnpm dev</span>, or{" "}
          <a href="?mock=1" className="font-semibold underline">
            use demo mode
          </a>
          .
        </p>
      ) : (
        <button type="button" onClick={onOpenConsole} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-lamp px-5 py-3 text-[15px] font-bold text-harbor-900">
          <Keyboard size={17} /> Open the demo console
        </button>
      )}
      <p className="mt-3 text-[13px] text-ink-3">
        or press <kbd className="rounded-md border border-harbor-600 px-1.5 py-0.5 font-mono text-ink-2">D</kbd>
      </p>
    </div>
  );
}

