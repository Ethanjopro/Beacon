import { labelFor } from "@beacon/shared";
import { Grid3x3, MicOff, Phone, PhoneOff, ShieldAlert, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BeaconMark } from "../components/BeaconMark";
import { AnimatedPct, RiskMeter } from "../components/RiskMeter";
import { contactForHandle, formatHandle, LABEL_COLOR, LABEL_TEXT } from "../lib/format";
import { isVerificationPending, type EventView } from "../state/reducer";
import { useBeacon } from "../state/store";

/**
 * Incoming call with a live transcript. Segments appear at their `atMs`
 * (measured from when the call arrived), the meter rises with the evidence,
 * and an in-call warning drops in once Beacon is sure enough to interrupt.
 */
export function CallScreen({ view, onHangUp }: { view: EventView; onHangUp: () => void }) {
  const { contacts } = useBeacon();
  const ev = view.event;
  const elapsed = useElapsedSince(view.firstAt);
  const [answered, setAnswered] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const transcript = ev?.transcript ?? [];
  const firstAt = transcript[0]?.atMs ?? 0;
  const isAnswered = answered || elapsed >= firstAt;
  const shown = transcript.filter((t) => t.atMs <= elapsed);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [shown.length]);

  if (!ev) return null;
  const claimed = ev.from.displayName;
  const saved = contactForHandle(contacts, ev.from.handle);
  const claimedContact = claimed ? contacts.find((c) => c.name.toLowerCase().startsWith(claimed.toLowerCase())) : undefined;
  const spoofed = Boolean(claimedContact && !saved);
  const name = saved?.name ?? claimed ?? formatHandle(ev.from.handle);
  const p = view.pScam;
  const denied = view.verification?.outcome?.status === "denied";
  const warn = (p !== undefined && p >= 0.8) || denied;
  const tint = p === undefined ? "var(--color-harbor-700)" : LABEL_COLOR[labelFor(p)];
  const callSeconds = Math.max(0, Math.floor((elapsed - firstAt) / 1000));

  return (
    <div className="relative flex h-full flex-col overflow-hidden" data-testid="call-screen">
      {/* risk-tinted glow behind the caller */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full blur-3xl"
        animate={{ backgroundColor: tint, opacity: p === undefined ? 0.25 : 0.32 }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative flex flex-col items-center px-6 pt-6 text-center">
        <p className="text-[15px] text-ink-2">{isAnswered ? formatDuration(callSeconds) : "Incoming call…"}</p>
        <h1 className="mt-1 text-[36px] font-semibold leading-tight tracking-tight">{name}</h1>
        <p className="mt-0.5 text-[15px] text-ink-2">{formatHandle(ev.from.handle)}</p>
        {spoofed && claimedContact && (
          <p className="mt-2 rounded-full bg-warn/15 px-3 py-1 text-[13px] font-semibold text-warn">Not {claimedContact.name}'s saved number</p>
        )}
      </div>

      <div className="relative mx-5 mt-4 rounded-2xl bg-harbor-900/70 px-4 py-3 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-1.5 font-semibold text-ink-2">
            <BeaconMark size={16} className="text-ink" /> Magenta-Guard is listening
          </span>
          {p !== undefined && (
            <span className="font-bold" style={{ color: tint }}>
              {LABEL_TEXT[labelFor(p)]} · <AnimatedPct value={p} />
            </span>
          )}
        </div>
        <RiskMeter p={p} size="sm" />
      </div>

      <AnimatePresence>
        {warn && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="relative mx-5 mt-3 rounded-2xl border border-scam/50 bg-scam/15 p-3.5"
            role="alert"
            data-testid="call-warning"
          >
            <p className="flex items-center gap-2 text-[17px] font-bold text-scam">
              <ShieldAlert size={20} /> This may be a cloned voice
            </p>
            <p className="mt-1 text-[15px] leading-snug text-ink">
              Hang up and call {claimedContact?.name ?? "them"} on the number you saved.
            </p>
            {view.verification?.request && (
              <p className="mt-2 text-[13px] leading-snug text-ink-2">
                {isVerificationPending(view)
                  ? `Texting the real ${view.verification.request.contactName} now…`
                  : view.verification.outcome?.summary}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scroller}
        className="scroll-quiet relative mt-3 flex-1 overflow-y-auto px-5 pb-3 pt-4"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0, black 28px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 28px)" }}
      >
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {shown.map((seg) => (
              <motion.div
                key={seg.atMs}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                  seg.speaker === "caller" ? "self-start bg-harbor-700/90 text-ink" : "self-end bg-harbor-500/60 text-ink"
                }`}
              >
                <span className="mb-0.5 block text-[11px] font-semibold text-ink-3">{seg.speaker === "caller" ? name : "You"}</span>
                {seg.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {isAnswered && shown.length < transcript.length && <p className="text-center text-xs text-ink-3">Live captions</p>}
        </div>
      </div>

      <div className="relative px-8 pb-10 pt-3">
        {isAnswered ? (
          <div className="flex flex-col items-center gap-5">
            <div className="flex w-full justify-around text-ink-2">
              <RoundIcon icon={<MicOff size={22} />} label="Mute" />
              <RoundIcon icon={<Grid3x3 size={22} />} label="Keypad" />
              <RoundIcon icon={<Volume2 size={22} />} label="Speaker" />
            </div>
            <button
              type="button"
              onClick={onHangUp}
              className="grid size-[72px] place-items-center rounded-full bg-scam text-white shadow-[0_8px_30px_-6px_rgba(255,90,82,0.8)]"
              aria-label="Hang up"
              data-testid="hang-up"
            >
              <PhoneOff size={30} />
            </button>
          </div>
        ) : (
          <div className="flex justify-between px-4">
            <CallButton color="var(--color-scam)" label="Decline" onClick={onHangUp} icon={<PhoneOff size={30} />} />
            <CallButton color="var(--color-safe)" label="Accept" onClick={() => setAnswered(true)} icon={<Phone size={30} />} ring />
          </div>
        )}
      </div>
    </div>
  );
}

function RoundIcon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span className="grid size-14 place-items-center rounded-full bg-harbor-700/80">{icon}</span>
      <span className="text-xs">{label}</span>
    </span>
  );
}

function CallButton({ color, label, onClick, icon, ring }: { color: string; label: string; onClick: () => void; icon: ReactNode; ring?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 text-[13px] text-ink-2">
      <span className="relative grid size-[72px] place-items-center rounded-full text-white" style={{ background: color }}>
        {ring && <span className="ring-pulse absolute inset-0 rounded-full" style={{ background: color }} />}
        <span className="relative">{icon}</span>
      </span>
      {label}
    </button>
  );
}

/** ms since `iso`, ticking ~10×/s (capped so we never start "in the future"). */
function useElapsedSince(iso: string): number {
  const start = useRef(Math.min(Date.now(), Date.parse(iso) || Date.now()));
  const [elapsed, setElapsed] = useState(() => Date.now() - start.current);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - start.current), 100);
    return () => clearInterval(t);
  }, []);
  return elapsed;
}

function formatDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

