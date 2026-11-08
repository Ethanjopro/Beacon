import type { Verdict } from "@beacon/shared";
import { Ban, Check, ChevronDown, CloudOff, CloudUpload, LifeBuoy, X } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { SourceBadge, VerdictPill } from "../components/Badges";
import { MathCard } from "../components/MathCard";
import { AnimatedPct, RiskMeter } from "../components/RiskMeter";
import { VerificationCard } from "../components/VerificationCard";
import { formatPct, formatRange, formatWeight, LABEL_COLOR, plainVerdict, scamTypeText } from "../lib/format";
import type { EventView } from "../state/reducer";

/**
 * The verdict sheet: label and headline first (readable at a glance from the
 * back of the room), then the number with its honest band, the reasons with
 * their weights, the real person's answer, and what left the phone.
 */
export function VerdictSheet({
  view,
  simple,
  onClose,
  onRecover,
  onBlock,
}: {
  view: EventView;
  simple: boolean;
  onClose: () => void;
  onRecover: () => void;
  onBlock: () => void;
}) {
  const v = view.verdict;
  if (!v) return null;
  const color = LABEL_COLOR[v.label];
  const plain = plainVerdict(v.label, v.verification?.contactName);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" data-testid="verdict-sheet" data-label={v.label}>
      <motion.button
        type="button"
        aria-label="Close verdict"
        className="absolute inset-0 bg-black/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.section
        role="dialog"
        aria-label="Beacon verdict"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
        className="relative flex max-h-[90%] flex-col rounded-t-[32px] bg-harbor-850 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]"
        style={{ boxShadow: `0 -1px 0 0 color-mix(in srgb, ${color} 55%, transparent), 0 -30px 80px -30px color-mix(in srgb, ${color} 45%, transparent)` }}
      >
        <span className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-harbor-600" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 px-5 pb-1 pt-2">
          <VerdictPill label={v.label} />
          {v.scamType !== "none" && <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-3">{scamTypeText(v.scamType)}</span>}
          <button type="button" onClick={onClose} className="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-harbor-700 text-ink-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="scroll-quiet flex-1 overflow-y-auto px-5 pb-4">

          <h2 className="mt-2 text-[28px] font-bold leading-[1.12] tracking-tight" data-testid="verdict-headline">
            {simple ? plain.title : v.headline}
          </h2>
          {simple && <p className="mt-2 text-[19px] leading-snug text-ink-2">{plain.body}</p>}

          {!simple && <ScoreBlock verdict={v} />}

          {v.verification && view.verification?.request && (
            <Section title={`We asked the real ${v.verification.contactName}`}>
              <VerificationCard request={view.verification.request} outcome={view.verification.outcome} />
            </Section>
          )}

          {!simple && (
            <Section title="Why Beacon thinks so">
              <ReasonList verdict={v} />
            </Section>
          )}

          <Section title="What left your phone">
            <PrivacyLedger verdict={v} />
          </Section>
        </div>

        <div className="flex gap-2.5 border-t border-harbor-700 bg-harbor-850 px-5 pb-7 pt-3">
          {v.label === "safe" ? (
            <button type="button" onClick={onClose} className="h-13 flex-1 rounded-2xl bg-harbor-700 text-[17px] font-semibold">
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onRecover}
                className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-lamp text-[17px] font-bold text-harbor-900"
                data-testid="cta-recover"
              >
                <LifeBuoy size={19} strokeWidth={2.4} /> Get safe · {v.recovery.length} steps
              </button>
              <button type="button" onClick={onBlock} className="flex h-13 items-center gap-1.5 rounded-2xl bg-harbor-700 px-4 text-[15px] font-semibold">
                <Ban size={17} /> Block
              </button>
            </>
          )}
        </div>
      </motion.section>
    </div>
  );
}

function ScoreBlock({ verdict: v }: { verdict: Verdict }) {
  const [showMath, setShowMath] = useState(false);
  const color = LABEL_COLOR[v.label];
  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <AnimatedPct value={v.pScam} className="text-[44px] font-bold leading-none tracking-tight" style={{ color }} />
          <p className="mt-1 text-[13px] text-ink-2">chance this is a scam</p>
        </div>
        <div className="text-right text-[13px] leading-snug text-ink-2">
          <p>
            Beacon is <span className="tabular font-semibold text-ink">{formatPct(v.confidence)}</span> sure
          </p>
          <p className="tabular">
            Likely {formatRange(v.band[0], v.band[1])}
          </p>
        </div>
      </div>
      <button type="button" onClick={() => setShowMath((s) => !s)} className="mt-3 w-full text-left" aria-expanded={showMath}>
        <RiskMeter p={v.pScam} band={v.band} />
        <span className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-lamp">
          {showMath ? "Hide the math" : "How we got this number"}
          <ChevronDown size={15} className={`transition-transform ${showMath ? "rotate-180" : ""}`} />
        </span>
      </button>
      {showMath && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
          <MathCard signals={v.signals} pScam={v.pScam} />
        </motion.div>
      )}
    </div>
  );
}

function ReasonList({ verdict: v }: { verdict: Verdict }) {
  const max = Math.max(...v.signals.map((s) => Math.abs(s.weight)), 1);
  return (
    <ul className="flex flex-col gap-2">
      {v.signals.map((s) => {
        const up = s.weight > 0;
        const c = up ? "var(--color-scam)" : "var(--color-safe)";
        return (
          <li key={s.id} className="rounded-2xl bg-harbor-800 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="min-w-0 flex-1 text-[16px] font-semibold leading-snug">{s.title}</span>
              <span className="tabular shrink-0 text-[15px] font-bold" style={{ color: c }}>
                {formatWeight(s.weight)}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-harbor-700">
              <motion.div
                className="h-full rounded-full"
                style={{ background: c }}
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(s.weight) / max) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="mt-2 text-[14px] leading-snug text-ink-2">{s.detail}</p>
            <div className="mt-2">
              <SourceBadge source={s.source} label={s.source === "verification" ? `Asked ${v.verification?.contactName ?? "contact"}` : undefined} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const REDACTION_TEXT: Record<string, [string, string, string]> = {
  phone_number: ["phone number", "phone numbers", "removed"],
  contact_name: ["name", "names", "swapped for relationships"],
  email: ["email", "emails", "removed"],
  card_number: ["card number", "card numbers", "removed"],
  ssn: ["SSN", "SSNs", "removed"],
  code: ["code", "codes", "removed"],
  address: ["address", "addresses", "removed"],
};

function redactionLabel(kind: string, n: number): string {
  const fallback = kind.replace(/_/g, " ");
  const [one, many, verb] = REDACTION_TEXT[kind] ?? [fallback, fallback, "removed"];
  return `${n} ${n === 1 ? one : many} ${verb}`;
}

function PrivacyLedger({ verdict: v }: { verdict: Verdict }) {
  const p = v.privacy;
  const redactions = Object.entries(p.redactions).filter(([, n]) => n > 0);
  return (
    <div className="rounded-2xl bg-harbor-800 p-3.5" data-testid="privacy-ledger">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${p.sentToCloud ? "bg-lamp/15 text-lamp" : "bg-safe/15 text-safe"}`}
        >
          {p.sentToCloud ? <CloudUpload size={18} /> : <CloudOff size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug">
            {p.sentToCloud ? "A redacted copy went to Nemotron" : "Nothing. Checked on this phone."}
          </p>
          {p.sentToCloud && p.model && <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{p.model}</p>}
        </div>
      </div>
      {redactions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {redactions.map(([kind, n]) => (
            <span key={kind} className="rounded-full bg-harbor-700 px-2.5 py-1 text-[12px] font-semibold text-ink-2">
              {redactionLabel(kind, n)}
            </span>
          ))}
        </div>
      )}
      {p.notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {p.notes.map((n) => (
            <li key={n} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
              <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-safe" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-[15px] font-bold text-ink-2">{title}</h3>
      {children}
    </section>
  );
}
