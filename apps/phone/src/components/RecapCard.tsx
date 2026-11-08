import type { CallRecap } from "@beacon/shared";
import { Check, GraduationCap, Lightbulb, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

/**
 * After the call: a 30-second "what gave it away" recap written by Nemotron,
 * and an optional practice drill on a new, similar scam (tap an answer).
 */
export function RecapCard({ recap }: { recap: CallRecap }) {
  const [drillOpen, setDrillOpen] = useState(false);
  const [picked, setPicked] = useState<number>();
  const drill = recap.drill;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-2xl border border-lamp/30 bg-harbor-800 p-4"
      data-testid="recap-card"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-lamp">
        <Lightbulb size={14} aria-hidden /> 30-second recap
      </p>
      <h3 className="mt-1 text-[17px] font-bold leading-snug text-ink">{recap.headline}</h3>

      <p className="mt-3 text-[13px] font-semibold text-ink-2">What gave it away</p>
      <ol className="mt-1.5 flex flex-col gap-2">
        {recap.tells.map((t, i) => (
          <li key={t.sign} className="flex gap-2.5">
            <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-lamp/20 text-[11px] font-bold text-lamp">{i + 1}</span>
            <span className="text-[14px] leading-snug">
              <span className="font-semibold text-ink">{t.sign.replace(/[.!?\s]+$/, "")}.</span> <span className="text-ink-2">{t.lesson}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 rounded-xl bg-harbor-900/70 px-3 py-2 text-[14px] font-semibold leading-snug text-ink">{recap.takeaway}</p>

      {drill && !drillOpen && (
        <button
          type="button"
          onClick={() => setDrillOpen(true)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-harbor-700 py-2.5 text-[14px] font-semibold text-ink"
          data-testid="drill-open"
        >
          <GraduationCap size={16} /> Try a 20-second practice drill
        </button>
      )}

      {drill && drillOpen && (
        <div className="mt-3 rounded-xl border border-harbor-600 p-3" data-testid="drill">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Practice: a different caller says</p>
          <p className="mt-1 text-[14px] italic leading-snug text-ink">“{drill.scenario}”</p>
          <p className="mt-2 text-[14px] font-semibold text-ink">{drill.question}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {drill.options.map((o, i) => {
              const chosen = picked === i;
              const right = i === drill.answerIndex;
              const reveal = picked !== undefined;
              const tone = reveal && right ? "border-safe/60 bg-safe/12 text-ink" : reveal && chosen ? "border-scam/60 bg-scam/12 text-ink" : "border-harbor-600 bg-harbor-900/60 text-ink-2";
              return (
                <button
                  key={o}
                  type="button"
                  disabled={reveal}
                  onClick={() => setPicked(i)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[14px] leading-snug ${tone}`}
                >
                  {reveal && right ? <Check size={15} className="shrink-0 text-safe" /> : reveal && chosen ? <X size={15} className="shrink-0 text-scam" /> : null}
                  {o}
                </button>
              );
            })}
          </div>
          {picked !== undefined && (
            <p className="mt-2 text-[13px] leading-snug text-ink-2">
              <span className="font-semibold text-ink">{picked === drill.answerIndex ? "Right. " : "Not quite. "}</span>
              {drill.explanation}
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}
