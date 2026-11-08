import { labelFor, type CallStatus, type CallVerdictLabel, type ScreeningChecks, type ScreeningResult } from "@beacon/shared";
import { Ban, Bot, Check, KeyRound, PhoneCall, PhoneForwarded, PhoneOff, ShieldAlert, ShieldCheck, ShieldQuestion, Voicemail, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatedPct, RiskMeter } from "../components/RiskMeter";
import { VerificationCard } from "../components/VerificationCard";
import { contactForHandle, formatHandle, LABEL_COLOR, LABEL_TEXT } from "../lib/format";
import type { EventView } from "../state/reducer";
import { useBeacon } from "../state/store";
import { RecapCard } from "../components/RecapCard";
import { useReadableTurns, VoiceDictatedText } from "../lib/useReadableTurns";

/**
 * A call Magenta-Guard answered first. The subscriber watches the screen
 * live (their phone never rang): what the AI said, what the caller said,
 * risk rising as evidence lands, the challenge and callback, then the verdict.
 */
export function ScreeningScreen({ view, onDone }: { view: EventView; onDone: () => void }) {
  const { contacts } = useBeacon();
  const scroller = useRef<HTMLDivElement>(null);
  const ev = view.event;
  const result = view.screening;
  const visibleTurns = useReadableTurns(view.eventId, view.turns);
  const transcriptCaughtUp = visibleTurns.length >= view.turns.length;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [visibleTurns.length, Boolean(result), Boolean(view.recap), Boolean(view.verification?.request), Boolean(view.verification?.outcome)]);

  if (!ev) return null;
  const saved = contactForHandle(contacts, ev.from.handle);
  const claimed = ev.from.displayName && ev.from.displayName !== "Unknown" ? ev.from.displayName : undefined;
  const claimedContact = claimed ? contacts.find((c) => c.name.toLowerCase().startsWith(claimed.toLowerCase())) : undefined;
  const name = saved?.name ?? claimed ?? formatHandle(ev.from.handle);
  const turnsTotal = view.turns.length || 1;
  const turnProgress = Math.min(1, visibleTurns.length / turnsTotal);
  const maxSignalsToShow = Math.max(1, Math.ceil(turnProgress * view.signals.length));
  const activeSignals = view.signals.slice(0, maxSignalsToShow);
  const rawP = view.pScam;
  const p = rawP !== undefined
    ? transcriptCaughtUp
      ? rawP
      : visibleTurns.length <= 1
        ? Math.min(0.18, rawP)
        : visibleTurns.length <= 2
          ? Math.min(0.48, rawP)
          : visibleTurns.length <= 3
            ? Math.min(0.76, rawP)
            : rawP
    : undefined;
  const tint = result && transcriptCaughtUp ? VERDICT_COLOR[result.verdict.verdict] : p === undefined ? "var(--color-harbor-700)" : LABEL_COLOR[labelFor(p)];
  const status = view.callStatus?.status ?? "ringing";
  const live = !result;
  const risky = activeSignals.filter((s) => s.weight > 0).slice(-3).reverse();

  const handleEndCall = () => {
    if (ev?.id) {
      fetch(`/api/calls/${encodeURIComponent(ev.id)}/end`, { method: "POST" }).catch(() => {});
    }
    onDone();
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden" data-testid="screening-screen">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full blur-3xl"
        animate={{ backgroundColor: tint, opacity: 0.28 }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative flex flex-col items-center px-6 pt-5 text-center">
        <StatusPill status={status} live={live} note={view.callStatus?.note} />
        <h1 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight">{name}</h1>
        <p className="mt-0.5 text-[15px] text-ink-2">{formatHandle(ev.from.handle)}</p>
        {claimedContact && !saved && (
          <p className="mt-2 rounded-full bg-warn/15 px-3 py-1 text-[13px] font-semibold text-warn">Not {claimedContact.name}'s saved number</p>
        )}
      </div>

      <div className="relative mx-5 mt-3 rounded-2xl bg-harbor-900/70 px-4 py-3 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink-2">Scam risk</span>
          {p !== undefined && (
            <span className="font-bold" style={{ color: LABEL_COLOR[labelFor(p)] }}>
              {LABEL_TEXT[labelFor(p)]} · <AnimatedPct value={p} />
            </span>
          )}
        </div>
        <RiskMeter p={p} size="sm" />
        <AnimatePresence initial={false}>
          {risky.length > 0 && (
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5 flex flex-wrap gap-1.5">
              {risky.map((s) => (
                <motion.li key={s.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full bg-scam/12 px-2.5 py-1 text-[12px] font-semibold text-scam">
                  {s.title}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={scroller}
        className="scroll-quiet relative mt-2 flex-1 overflow-y-auto px-5 pb-3 pt-4"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0, black 24px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 24px)" }}
      >
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visibleTurns.map((t, idx) => {
              const isLatest = idx === visibleTurns.length - 1 && !transcriptCaughtUp;
              return (
                <motion.div
                  key={t.seq}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                    t.speaker === "caller" ? "self-start rounded-bl-md bg-harbor-700/90 text-ink" : "self-end rounded-br-md bg-lamp/90 text-harbor-900"
                  }`}
                >
                  <span className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${t.speaker === "caller" ? "text-ink-3" : "text-harbor-800"}`}>
                    {t.speaker === "agent" && <Bot size={12} aria-hidden />}
                    {t.speaker === "caller" ? name : "Magenta-Guard (AI)"}
                  </span>
                  <VoiceDictatedText
                    text={t.text.replace(/\[SAFE_WORD\]/g, "••••••••")}
                    isLatest={isLatest}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {view.verification?.request && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-1">
              <VerificationCard request={view.verification.request} outcome={view.verification.outcome} compact />
            </motion.div>
          )}

          {live && visibleTurns.length > 0 && <ListeningDots status={status} />}

          <AnimatePresence>{result && transcriptCaughtUp && <ScreeningVerdictCard key="verdict" result={result} />}</AnimatePresence>
          {result?.decidedBy === "nemotron" && transcriptCaughtUp && (view.recap ? <RecapCard recap={view.recap} /> : <p className="py-2 text-center text-xs text-ink-3">Writing your 30-second recap…</p>)}
        </div>
      </div>

      <div className="relative px-6 pb-8 pt-3">
        {result && transcriptCaughtUp ? (
          <button type="button" onClick={onDone} className="w-full rounded-2xl bg-harbor-700 py-3.5 text-[16px] font-semibold text-ink" data-testid="screening-done">
            Done
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] leading-snug text-ink-3">Magenta-Guard is handling this call. You don't need to do anything.</p>
            <button
              type="button"
              onClick={handleEndCall}
              className="grid size-14 shrink-0 place-items-center rounded-full bg-scam text-white shadow-[0_8px_30px_-6px_rgba(255,90,82,0.8)]"
              aria-label="End call"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The caller's words are already scrubbed on the server; show the placeholder as a hidden word, not as a bracket token. */
function hideCodeWord(text: string): ReactNode {
  const parts = text.split("[SAFE_WORD]");
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={i} className="mx-0.5 rounded bg-harbor-500 px-1.5 text-[12px] font-semibold text-ink-2">
            code word hidden
          </span>,
          part,
        ],
  );
}

const STATUS: Record<CallStatus, { text: string; icon: ReactNode }> = {
  ringing: { text: "Incoming call", icon: <PhoneCall size={13} /> },
  screening: { text: "Screening · your phone hasn't rung", icon: <Bot size={13} /> },
  challenging: { text: "Checking the family code word", icon: <KeyRound size={13} /> },
  verifying: { text: "Caller on hold · checking with the real person", icon: <PhoneForwarded size={13} /> },
  deciding: { text: "Deciding", icon: <Bot size={13} /> },
  bridged: { text: "Verified · connected to you", icon: <ShieldCheck size={13} /> },
  blocked: { text: "Scam call blocked", icon: <Ban size={13} /> },
  voicemail: { text: "Not connected · sent to voicemail", icon: <Voicemail size={13} /> },
};

function StatusPill({ status, live, note }: { status: CallStatus; live: boolean; note?: string }) {
  const s = STATUS[status];
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-harbor-800/90 px-3 py-1.5 text-[12.5px] font-semibold text-ink-2" title={note} data-testid="call-status">
      {live ? <span className="size-2 animate-pulse rounded-full bg-lamp" aria-hidden /> : s.icon}
      Magenta-Guard · {s.text}
    </span>
  );
}

function ListeningDots({ status }: { status: CallStatus }) {
  const text = status === "verifying" ? "Waiting for the real person to answer…" : status === "deciding" ? "Nemotron is deciding…" : "Listening and thinking…";
  return (
    <p className="flex items-center justify-center gap-1.5 py-1 text-center text-xs text-ink-3">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1 rounded-full bg-ink-3" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
        ))}
      </span>
      {text}
    </p>
  );
}

const VERDICT_COLOR: Record<CallVerdictLabel, string> = {
  SCAM: "var(--color-scam)",
  SUSPICIOUS: "var(--color-warn)",
  VERIFIED: "var(--color-safe)",
};

const VERDICT_CLASSES: Record<CallVerdictLabel, string> = {
  SCAM: "border-scam/50 bg-scam/12",
  SUSPICIOUS: "border-warn/50 bg-warn/12",
  VERIFIED: "border-safe/50 bg-safe/12",
};

function headline(r: ScreeningResult): string {
  if (r.decidedBy === "error") return "Couldn't screen this call";
  if (r.verdict.verdict === "SCAM") return "Scam call blocked";
  if (r.action === "bridge") return "Verified · connecting you";
  return "Not verified · sent to voicemail";
}

/** The structured verdict: label, confidence, plain-language reasons, what happens next, and the two challenge results. */
export function ScreeningVerdictCard({ result }: { result: ScreeningResult }) {
  const v = result.verdict;
  const color = VERDICT_COLOR[v.verdict];
  const Icon = v.verdict === "SCAM" ? ShieldAlert : v.verdict === "VERIFIED" ? ShieldCheck : ShieldQuestion;
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={`mt-2 rounded-2xl border p-4 ${VERDICT_CLASSES[v.verdict]}`}
      role="status"
      data-testid="screening-verdict"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide" style={{ color }}>
            <Icon size={16} aria-hidden /> {v.verdict}
          </p>
          <h2 className="mt-1 text-[20px] font-bold leading-tight text-ink">{headline(result)}</h2>
        </div>
        {result.decidedBy === "nemotron" && (
          <div className="shrink-0 text-right">
            <p className="tabular text-[26px] font-bold leading-none" style={{ color }}>
              {v.confidence}%
            </p>
            <p className="mt-0.5 text-[11px] text-ink-3">confident</p>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {v.evidence.map((e) => (
          <li key={e} className="flex gap-2 text-[14px] leading-snug text-ink">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
            {e}
          </li>
        ))}
      </ul>

      <CheckRow checks={result.checks} />

      <p className="mt-3 rounded-xl bg-harbor-900/60 px-3 py-2 text-[13.5px] leading-snug text-ink-2">
        <span className="font-semibold text-ink">What now: </span>
        {v.next_action}
      </p>

      {result.gateNote && <p className="mt-2 text-[12px] leading-snug text-ink-3">Safety rule: nobody is connected without a passed code word or callback.</p>}
      <p className="mt-2 text-[11px] text-ink-3">
        {result.decidedBy === "nemotron" ? `Decided by NVIDIA Nemotron · ${(result.latencyMs / 1000).toFixed(1)} s · ${result.turns} caller turn${result.turns === 1 ? "" : "s"}` : "The screening model was unreachable. The call was not connected."}
      </p>
    </motion.section>
  );
}

const CODE_WORD_TEXT: Record<ScreeningChecks["codeWord"], [string, "good" | "bad" | "none"]> = {
  matched: ["Code word correct", "good"],
  failed: ["Wrong code word", "bad"],
  not_checked: ["Code word not asked", "none"],
  none_on_file: ["No code word set", "none"],
};
const CALLBACK_TEXT: Record<ScreeningChecks["callback"], [string, "good" | "bad" | "none"]> = {
  confirmed: ["Callback: it's really them", "good"],
  denied: ["Callback: \"that's not me\"", "bad"],
  unclear: ["Callback: unclear answer", "none"],
  no_answer: ["Callback: no answer", "none"],
  unreachable: ["Callback: unreachable", "none"],
  not_placed: ["No callback needed", "none"],
};

function CheckRow({ checks }: { checks: ScreeningChecks }) {
  const chip = ([text, tone]: [string, "good" | "bad" | "none"]) => (
    <span
      key={text}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        tone === "good" ? "bg-safe/15 text-safe" : tone === "bad" ? "bg-scam/15 text-scam" : "bg-harbor-700 text-ink-3"
      }`}
    >
      {tone === "good" ? <Check size={12} strokeWidth={3} /> : tone === "bad" ? <X size={12} strokeWidth={3} /> : null}
      {text}
    </span>
  );
  return <div className="mt-3 flex flex-wrap gap-1.5">{[chip(CODE_WORD_TEXT[checks.codeWord]), chip(CALLBACK_TEXT[checks.callback])]}</div>;
}
