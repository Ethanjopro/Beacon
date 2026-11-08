import type { RecoveryStep, RecoveryUrgency } from "@beacon/shared";
import { Ban, Check, ChevronLeft, ExternalLink, Flag, MessageSquare, Phone } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { formatHandle, scamTypeText } from "../lib/format";
import type { EventView } from "../state/reducer";

/**
 * "Get safe": the verdict's recovery steps grouped by urgency, each checkable,
 * with one-tap actions. In the desktop demo frame, actions are simulated
 * (a toast) so a click on stage never opens FaceTime or Messages on the laptop.
 */

const GROUPS: { urgency: RecoveryUrgency; title: string }[] = [
  { urgency: "now", title: "Do these now" },
  { urgency: "soon", title: "Today" },
  { urgency: "later", title: "When you have a minute" },
];

export function RecoveryScreen({
  view,
  simulateActions,
  onBack,
  onToast,
}: {
  view: EventView;
  simulateActions: boolean;
  onBack: () => void;
  onToast: (text: string) => void;
}) {
  const steps = view.verdict?.recovery ?? [];
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const toggle = (id: string, on?: boolean) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const progress = steps.length ? done.size / steps.length : 0;

  return (
    <div className="flex h-full flex-col" data-testid="recovery-screen">
      <header className="flex items-center px-2 pb-1 pt-1">
        <button type="button" onClick={onBack} className="flex items-center text-[17px] text-lamp">
          <ChevronLeft size={28} /> Verdict
        </button>
      </header>
      <div className="scroll-quiet flex-1 overflow-y-auto px-5 pb-8">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">Get safe</h1>
        {view.verdict && view.verdict.scamType !== "none" && (
          <p className="mt-1 text-[15px] text-ink-2">Steps for a {scamTypeText(view.verdict.scamType).toLowerCase()}</p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-harbor-700">
            <motion.div className="h-full rounded-full bg-safe" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 20 }} />
          </div>
          <span className="tabular text-[13px] font-semibold text-ink-2">
            {done.size} of {steps.length} done
          </span>
        </div>

        {GROUPS.map(({ urgency, title }) => {
          const group = steps.filter((s) => s.urgency === urgency);
          if (group.length === 0) return null;
          return (
            <section key={urgency} className="mt-6">
              <h2 className={`mb-2.5 text-[15px] font-bold ${urgency === "now" ? "text-scam" : "text-ink-2"}`}>{title}</h2>
              <ul className="flex flex-col gap-2.5">
                {group.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    done={done.has(step.id)}
                    onToggle={() => toggle(step.id)}
                    onAction={() => {
                      toggle(step.id, true);
                      if (simulateActions || step.action?.kind === "block" || step.action?.kind === "report") onToast(actionToast(step));
                    }}
                    simulate={simulateActions}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StepCard({
  step,
  done,
  onToggle,
  onAction,
  simulate,
}: {
  step: RecoveryStep;
  done: boolean;
  onToggle: () => void;
  onAction: () => void;
  simulate: boolean;
}) {
  return (
    <li className={`rounded-2xl bg-harbor-800 p-3.5 transition-opacity ${done ? "opacity-60" : ""}`} data-testid="recovery-step">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${step.title}" done`}
          onClick={onToggle}
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 ${done ? "border-safe bg-safe text-harbor-900" : "border-harbor-500"}`}
        >
          {done && <Check size={16} strokeWidth={3.5} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-[17px] font-semibold leading-snug ${done ? "line-through decoration-ink-3" : ""}`}>{step.title}</p>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">{step.detail}</p>
          {step.action && step.action.kind !== "none" && <ActionButton step={step} onAction={onAction} simulate={simulate} />}
        </div>
      </div>
    </li>
  );
}

const ACTION_ICON = { call: Phone, sms: MessageSquare, link: ExternalLink, block: Ban, report: Flag, none: Check } as const;

function ActionButton({ step, onAction, simulate }: { step: RecoveryStep; onAction: () => void; simulate: boolean }) {
  const action = step.action!;
  const Icon = ACTION_ICON[action.kind];
  const href = !simulate ? hrefFor(action.kind, action.target) : undefined;
  const className = "mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-lamp/15 px-3.5 text-[15px] font-semibold text-lamp";
  return href ? (
    <a href={href} target={action.kind === "link" ? "_blank" : undefined} rel="noreferrer" onClick={onAction} className={className}>
      <Icon size={16} /> {action.label}
    </a>
  ) : (
    <button type="button" onClick={onAction} className={className}>
      <Icon size={16} /> {action.label}
    </button>
  );
}

function hrefFor(kind: string, target?: string): string | undefined {
  if (!target) return undefined;
  if (kind === "call") return `tel:${target}`;
  if (kind === "sms") return `sms:${target}`;
  if (kind === "link" && /^https:\/\//.test(target)) return target;
  return undefined;
}

function actionToast(step: RecoveryStep): string {
  const a = step.action;
  if (!a) return "Done";
  switch (a.kind) {
    case "call":
      return `Calling ${a.target ? formatHandle(a.target) : "now"}…`;
    case "sms":
      return `Forwarded to ${a.target ?? "your carrier"}`;
    case "link":
      return `Opening ${a.target?.replace(/^https:\/\//, "") ?? "link"}`;
    case "block":
      return "Sender blocked";
    case "report":
      return "Reported. Thank you.";
    default:
      return "Done";
  }
}
