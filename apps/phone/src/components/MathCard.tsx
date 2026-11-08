import type { Signal } from "@beacon/shared";
import { explainScore } from "../lib/explain";
import { colorForP, formatPct, formatWeight } from "../lib/format";

/** The arithmetic behind the number, one line per piece of evidence. */
export function MathCard({ signals, pScam }: { signals: Signal[]; pScam?: number }) {
  const ex = explainScore(signals, pScam);
  return (
    <div className="rounded-2xl bg-harbor-850 p-4 text-sm" data-testid="math-card">
      <p className="mb-3 text-ink-2">
        Each reason adds or removes evidence. Beacon adds them up, then turns the total into a chance.
      </p>
      <ul className="tabular flex flex-col gap-1.5">
        <MathRow label="Starting point (most messages are fine)" value={formatWeight(ex.prior)} muted />
        {ex.signals.map((s) => (
          <MathRow key={s.id} label={s.title} value={formatWeight(s.weight)} positive={s.weight > 0} />
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-harbor-600 pt-3">
        <span className="text-ink-2">
          Total <span className="tabular font-semibold text-ink">{formatWeight(ex.logOdds)}</span> → chance of scam
        </span>
        <span className="tabular text-lg font-bold" style={{ color: colorForP(ex.pScam) }}>
          {formatPct(ex.pScam)}
        </span>
      </div>
    </div>
  );
}

function MathRow({ label, value, positive, muted }: { label: string; value: string; positive?: boolean; muted?: boolean }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className={`min-w-0 flex-1 truncate ${muted ? "text-ink-3" : "text-ink-2"}`}>{label}</span>
      <span
        className="font-semibold"
        style={{ color: muted ? "var(--color-ink-3)" : positive ? "var(--color-scam)" : "var(--color-safe)" }}
      >
        {value}
      </span>
    </li>
  );
}
