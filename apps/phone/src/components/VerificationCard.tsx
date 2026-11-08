import type { VerificationOutcome, VerificationRequest } from "@beacon/shared";
import { Lock, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { CHANNEL_TEXT, formatHandle } from "../lib/format";

/**
 * "Asked Mom on iMessage · waiting…" → her reply. The card visibly waits,
 * because the wait IS the feature: Beacon checks with the real person.
 */
export function VerificationCard({
  request,
  outcome,
  compact = false,
}: {
  request: VerificationRequest;
  outcome?: VerificationOutcome;
  compact?: boolean;
}) {
  const statusText = outcome ? OUTCOME_TEXT[outcome.status](request.contactName) : undefined;
  const statusColor = outcome ? OUTCOME_COLOR[outcome.status] : "var(--color-lamp)";

  return (
    <div className="rounded-2xl border border-lamp/25 bg-harbor-800 p-3.5" data-testid="verification-card">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-lamp/15 text-lamp">
          <MessageCircle size={16} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-ink">
            Asked the real {request.contactName} on {CHANNEL_TEXT[request.channel]}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
            <Lock size={11} aria-hidden /> Saved number {formatHandle(request.to)}, not the sender
          </p>
        </div>
      </div>

      {!compact && (
        <div className="mt-3 flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-lamp px-3 py-2 text-[13px] leading-snug text-harbor-900">
            {request.question}
          </p>
        </div>
      )}

      <div className="mt-2.5">
        {outcome?.replyText ? (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex flex-col items-start gap-1.5">
            <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-harbor-600 px-3 py-2 text-[15px] font-medium leading-snug text-ink">
              {outcome.replyText}
            </p>
            <span className="text-xs font-bold" style={{ color: statusColor }}>
              {statusText}
            </span>
          </motion.div>
        ) : outcome ? (
          <span className="text-xs font-bold" style={{ color: statusColor }}>
            {statusText}
          </span>
        ) : (
          <div className="flex items-center gap-2 text-sm text-lamp">
            <TypingDots />
            Waiting for {request.contactName} to reply
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-harbor-600 px-2.5 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-2"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

// Status labels name the contact instead of guessing pronouns.
const OUTCOME_TEXT: Record<VerificationOutcome["status"], (name: string) => string> = {
  pending: () => "Waiting",
  denied: (name) => `Denied by ${name}`,
  confirmed: (name) => `Confirmed by ${name}`,
  unclear: () => "Reply wasn't clear",
  timeout: (name) => `No reply from ${name} in time`,
  unreachable: (name) => `Couldn't reach ${name}`,
};

const OUTCOME_COLOR: Record<VerificationOutcome["status"], string> = {
  pending: "var(--color-lamp)",
  denied: "var(--color-scam)",
  confirmed: "var(--color-safe)",
  unclear: "var(--color-warn)",
  timeout: "var(--color-warn)",
  unreachable: "var(--color-warn)",
};
