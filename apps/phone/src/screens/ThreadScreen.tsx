import { ArrowUp, ChevronLeft, PhoneIncoming, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { VerdictPill } from "../components/Badges";
import { BeaconBanner } from "../components/BeaconBanner";
import { Highlighted } from "../components/Highlighted";
import { contactForHandle, formatHandle, formatPct, LABEL_COLOR, timeOfDay } from "../lib/format";
import { seedFor } from "../lib/inbox";
import { eventsInThread, type EventView } from "../state/reducer";
import { useBeacon } from "../state/store";
import { Avatar } from "./HomeScreen";

export function ThreadScreen({
  threadKey,
  onBack,
  onOpenVerdict,
}: {
  threadKey: string;
  onBack: () => void;
  onOpenVerdict: (eventId: string) => void;
}) {
  const { state, contacts, simpleMode } = useBeacon();
  const events = eventsInThread(state, threadKey);
  const latest = events[events.length - 1];
  const handle = latest?.event?.from.handle ?? threadKey;
  const contact = contactForHandle(contacts, handle);
  const seed = seedFor(handle);
  const name = contact?.name ?? seed?.name ?? formatHandle(handle);
  const saved = Boolean(contact ?? seed);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [events.length, latest?.verdict]);

  return (
    <div className="flex h-full flex-col" data-testid="thread-screen">
      <header className="relative flex items-center border-b border-harbor-700/70 px-2 pb-2.5 pt-1">
        <button type="button" onClick={onBack} className="flex items-center text-[17px] text-lamp" aria-label="Back to messages">
          <ChevronLeft size={28} />
        </button>
        <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
          <Avatar name={name} saved={saved} size={40} />
          <span className="mt-1 max-w-[220px] truncate text-[13px] font-semibold">{name}</span>
          {!saved && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-warn">
              <TriangleAlert size={11} aria-hidden /> Not in your contacts
            </span>
          )}
        </div>
        <div className="h-[76px]" />
      </header>

      {latest && (
        <div className="relative z-10 -mb-1 pt-3">
          <BeaconBanner key={latest.eventId} view={latest} simple={simpleMode} onOpenVerdict={() => onOpenVerdict(latest.eventId)} />
        </div>
      )}

      <div ref={scroller} className="scroll-quiet flex-1 overflow-y-auto px-3 pb-4 pt-5">
        {seed && (
          <div className="flex flex-col gap-1.5">
            {seed.messages.map((m, i) => (
              <Bubble key={i} fromMe={m.fromMe}>
                {m.text}
              </Bubble>
            ))}
          </div>
        )}
        {events.map((view) => (
          <EventMessage key={view.eventId} view={view} onOpenVerdict={() => onOpenVerdict(view.eventId)} />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-harbor-700/70 px-3 pb-6 pt-2">
        <div className="flex-1 rounded-full border border-harbor-600 px-4 py-2 text-[15px] text-ink-3">Text Message</div>
        <span className="grid size-8 place-items-center rounded-full bg-harbor-700 text-ink-3" aria-hidden>
          <ArrowUp size={18} />
        </span>
      </div>
    </div>
  );
}

function EventMessage({ view, onOpenVerdict }: { view: EventView; onOpenVerdict: () => void }) {
  const ev = view.event;
  if (!ev) return null;
  const verdict = view.verdict;
  const color = verdict ? LABEL_COLOR[verdict.label] : "var(--color-lamp)";

  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mt-4 flex flex-col items-start" data-testid="event-message">
      <p className="mb-1.5 w-full text-center text-[11px] font-medium text-ink-3">Today {timeOfDay(ev.receivedAt)}</p>
      {ev.kind === "call" ? (
        <Bubble fromMe={false}>
          <span className="flex items-center gap-2 font-semibold">
            <PhoneIncoming size={16} /> Phone call
          </span>
        </Bubble>
      ) : (
        <Bubble fromMe={false} outline={verdict && verdict.label !== "safe" ? color : undefined}>
          <Highlighted text={ev.body} signals={view.signals} color={color} />
        </Bubble>
      )}
      {verdict && (
        <button type="button" onClick={onOpenVerdict} className="ml-2 mt-1.5 flex items-center gap-2 text-xs text-ink-3" data-testid="verdict-chip">
          <VerdictPill label={verdict.label} size="sm" />
          <span className="tabular">{formatPct(verdict.pScam)} chance of scam · See why</span>
        </button>
      )}
    </motion.div>
  );
}

function Bubble({ fromMe, outline, children }: { fromMe: boolean; outline?: string; children: ReactNode }) {
  return (
    <div
      className={`max-w-[78%] whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[16px] leading-[1.35] ${
        fromMe ? "self-end rounded-br-md bg-[#3b6fd8] text-white" : "self-start rounded-bl-md bg-harbor-700 text-ink"
      }`}
      style={outline ? { boxShadow: `0 0 0 1.5px ${outline}` } : undefined}
    >
      {children}
    </div>
  );
}
