import { Check, ChevronRight, PhoneIncoming, Trash2, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { VerdictPill } from "../components/Badges";
import { BeaconMark } from "../components/BeaconMark";
import { buildConversations, type Conversation } from "../lib/inbox";
import { timeOfDay } from "../lib/format";
import { useBeacon } from "../state/store";

export function HomeScreen({ onOpen }: { onOpen: (c: Conversation) => void }) {
  const { state, contacts, status, simpleMode, setSimpleMode, backend, deleteConversation } = useBeacon();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const conversations = buildConversations(state, contacts);
  const checked = state.order.length;
  const stopped = state.order.filter((id) => state.byId[id]?.verdict?.label === "scam").length;

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    selectedKeys.forEach((key) => deleteConversation(key));
    setSelectedKeys(new Set());
  };

  const handleDeleteSingle = (key: string) => {
    deleteConversation(key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="scroll-quiet flex h-full flex-col overflow-y-auto" data-testid="home-screen">
      {/* Header with standard or select/delete mode */}
      <AnimatePresence mode="wait">
        {selectedKeys.size > 0 ? (
          <motion.header
            key="selected-header"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="sticky top-0 z-20 flex items-center justify-between border-b border-harbor-700/80 bg-harbor-800/95 px-5 py-3.5 backdrop-blur"
          >
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="text-[14px] font-semibold text-ink-2 hover:text-ink active:scale-95 transition-all"
            >
              Cancel
            </button>
            <span className="text-[15px] font-semibold text-ink">
              {selectedKeys.size} selected
            </span>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 rounded-full bg-scam px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-md active:scale-95 transition-all"
            >
              <Trash2 size={14} /> Delete
            </button>
          </motion.header>
        ) : (
          <motion.header
            key="normal-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-end justify-between px-5 pb-3 pt-4"
          >
            <h1 className="text-[34px] font-bold leading-none tracking-tight">Messages</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSimpleMode(!simpleMode)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${simpleMode ? "bg-lamp text-harbor-900" : "bg-harbor-700 text-ink-2"}`}
                aria-pressed={simpleMode}
              >
                Simple mode
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <ProtectionCard status={status} mock={backend.mode === "mock"} checked={checked} stopped={stopped} />

      <ul className="mt-2 flex flex-col">
        <AnimatePresence initial={false}>
          {conversations.map((c, i) => {
            const isSelected = selectedKeys.has(c.key);
            return (
              <motion.li
                key={c.key}
                layout
                initial={i === 0 && c.latest ? { opacity: 0, y: -12 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
              >
                <ConversationRow
                  c={c}
                  selected={isSelected}
                  onSelect={() => toggleSelect(c.key)}
                  onOpen={() => onOpen(c)}
                  onDelete={() => handleDeleteSingle(c.key)}
                />
              </motion.li>
            );
          })}
        </AnimatePresence>
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
            <p className="text-[17px] font-semibold leading-tight text-warn">Can't reach Magenta-Guard</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              Retrying. Start it with <span className="font-mono text-ink">pnpm dev</span>, or open{" "}
              <a className="font-semibold text-lamp underline" href="?mock=1">demo mode</a>.
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-semibold leading-tight">Magenta-Guard is protecting this phone</p>
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

function ConversationRow({
  c,
  selected,
  onSelect,
  onOpen,
  onDelete,
}: {
  c: Conversation;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const screening = c.latest?.screening?.verdict.verdict;
  const verdict = c.latest?.verdict ?? (screening ? { label: screening === "SCAM" ? ("scam" as const) : screening === "VERIFIED" ? ("safe" as const) : ("suspicious" as const) } : undefined);
  const checking = c.latest && !verdict;
  const isCall = c.latest?.event?.kind === "call";

  return (
    <div
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        selected ? "bg-scam/10" : "hover:bg-harbor-800/40 active:bg-harbor-800"
      }`}
      data-testid="conversation-row"
    >
      {/* Interactive Avatar Logo with hover select & checkmark */}
      <div
        className="relative shrink-0 cursor-pointer group/avatar"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        title={selected ? "Click to deselect" : "Click to select and delete"}
      >
        <Avatar name={c.name} saved={c.saved} />
        <div
          className={`absolute inset-0 grid place-items-center rounded-full transition-all duration-150 ${
            selected
              ? "bg-scam text-white ring-2 ring-white/80 shadow-md opacity-100 scale-100"
              : "bg-black/60 opacity-0 group-hover/avatar:opacity-100 hover:scale-105"
          }`}
        >
          {selected ? (
            <Check size={20} strokeWidth={3} className="text-white" />
          ) : (
            <Trash2 size={18} className="text-scam animate-pulse" />
          )}
        </div>
      </div>

      {/* Main Conversation Details (Click to open thread) */}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 border-b border-harbor-700/70 pb-3 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{c.name}</span>
          <span className="shrink-0 text-[13px] text-ink-3">
            {c.time ? timeOfDay(c.time) : c.seed?.messages.at(-1)?.time}
          </span>
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
      </button>

      {/* Direct Delete button when conversation is selected */}
      {selected && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center gap-1 shrink-0 rounded-full bg-scam px-3 py-1.5 text-[12px] font-semibold text-white shadow-md active:scale-95 transition-all"
          aria-label="Delete conversation"
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </motion.button>
      )}
    </div>
  );
}

export function Avatar({ name, saved, size = 48 }: { name: string; saved: boolean; size?: number }) {
  const initial = saved ? (name.trim()[0] ?? "?").toUpperCase() : "#";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${
        saved ? "bg-gradient-to-b from-harbor-500 to-harbor-600 text-ink" : "bg-harbor-700 text-ink-3"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
