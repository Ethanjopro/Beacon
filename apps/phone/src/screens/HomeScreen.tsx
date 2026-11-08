import { ChevronRight, PhoneIncoming, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { VerdictPill } from "../components/Badges";
import { BeaconMark } from "../components/BeaconMark";
import { buildConversations, type Conversation } from "../lib/inbox";
import { timeOfDay } from "../lib/format";
import { useBeacon } from "../state/store";

export function HomeScreen({ onOpen }: { onOpen: (c: Conversation) => void }) {
  const { state, contacts, status, simpleMode, setSimpleMode, backend } = useBeacon();
  const conversations = buildConversations(state, contacts);
  const checked = state.order.length;
  const stopped = state.order.filter((id) => state.byId[id]?.verdict?.label === "scam").length;

  return (
    <div className="scroll-quiet flex h-full flex-col overflow-y-auto" data-testid="home-screen">
      <header className="flex items-end justify-between px-5 pb-3 pt-4">
        <h1 className="text-[34px] font-bold leading-none tracking-tight">Messages</h1>
        <button
          type="button"
          onClick={() => setSimpleMode(!simpleMode)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${simpleMode ? "bg-lamp text-harbor-900" : "bg-harbor-700 text-ink-2"}`}
          aria-pressed={simpleMode}
        >
          Simple mode
        </button>
      </header>

      <ProtectionCard status={status} mock={backend.mode === "mock"} checked={checked} stopped={stopped} />

      <ul className="mt-2 flex flex-col">
        {conversations.map((c, i) => (
          <motion.li key={c.key} layout initial={i === 0 && c.latest ? { opacity: 0, y: -12 } : false} animate={{ opacity: 1, y: 0 }}>
            <ConversationRow c={c} onOpen={() => onOpen(c)} />
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function ProtectionCard({ status, mock, checked, stopped }: { status: string; mock: boolean; checked: number; stopped: number }) {
  const down = status === "down";
  return (
    <div
      className={`mx-4 flex items-center gap-3.5 rounded-3xl px-4 py-3.5 ${down ? "bg-warn/10" : "bg-gradient-to-br from-harbor-700 to-harbor-800"}`}
      data-testid="protection-card"
    >
      <div className="relative grid size-12 shrink-0 place-items-center">
        {!down && <span className="lamp-breathe absolute inset-0 rounded-full bg-lamp/20 blur-md" />}
        {down ? <WifiOff className="text-warn" size={26} /> : <BeaconMark size={34} glow className="relative text-ink" />}
      </div>
      <div className="min-w-0 flex-1">
        {down ? (
          <>
            <p className="text-[17px] font-semibold leading-tight text-warn">Can't reach Beacon</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              Retrying. Start it with <span className="font-mono text-ink">pnpm dev</span>, or open{" "}
              <a className="font-semibold text-lamp underline" href="?mock=1">demo mode</a>.
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-semibold leading-tight">Beacon is protecting this phone</p>
            <p className="tabular mt-0.5 text-[13px] text-ink-2">
              {status === "connecting"
                ? "Connecting…"
                : checked === 0
                  ? "Suspicious texts and calls get checked here."
                  : `${checked} checked today${stopped ? `, ${stopped} stopped` : ""}`}
              {mock && <span className="text-ink-3"> (demo mode)</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ c, onOpen }: { c: Conversation; onOpen: () => void }) {
  const verdict = c.latest?.verdict;
  const checking = c.latest && !verdict;
  const isCall = c.latest?.event?.kind === "call";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-harbor-800"
      data-testid="conversation-row"
    >
      <Avatar name={c.name} saved={c.saved} />
      <div className="min-w-0 flex-1 border-b border-harbor-700/70 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{c.name}</span>
          <span className="shrink-0 text-[13px] text-ink-3">{c.time ? timeOfDay(c.time) : c.seed?.messages.at(-1)?.time}</span>
          <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
        </div>
        <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-ink-2">
          {isCall && <PhoneIncoming size={14} className="mr-1 inline align-[-2px]" aria-hidden />}
          {c.preview}
        </p>
        {(verdict || checking) && (
          <div className="mt-1.5">
            {verdict ? (
              <VerdictPill label={verdict.label} size="sm" />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-lamp">
                <BeaconMark size={14} className="text-ink" /> Checking…
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

export function Avatar({ name, saved, size = 48 }: { name: string; saved: boolean; size?: number }) {
  const initial = saved ? (name.trim()[0] ?? "?").toUpperCase() : "#";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${saved ? "bg-gradient-to-b from-harbor-500 to-harbor-600 text-ink" : "bg-harbor-700 text-ink-3"}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
