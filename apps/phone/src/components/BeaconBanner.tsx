import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { LABEL_COLOR } from "../lib/format";
import { bannerState, type BannerState } from "../lib/progress";
import type { EventView } from "../state/reducer";
import { BeaconMark } from "./BeaconMark";
import { RiskMeter } from "./RiskMeter";
import { TraceTimeline } from "./TraceTimeline";

/**
 * Live Beacon banner pinned under the thread header. While Beacon works, a
 * beam sweeps across it and the steps can be expanded; once there's a
 * verdict it turns the verdict color and opens the verdict sheet on tap.
 */
export function BeaconBanner({ view, simple, onOpenVerdict }: { view: EventView; simple: boolean; onOpenVerdict: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const state = bannerState(view, simple);
  const done = Boolean(view.verdict);
  const color = toneColor(state);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mx-3 overflow-hidden rounded-3xl border bg-harbor-800/95 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
      data-testid="beacon-banner"
      data-tone={state.tone}
    >
      {!done && (
        <span
          aria-hidden
          className="beam-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,200,97,0.13), transparent)" }}
        />
      )}
      <button
        type="button"
        onClick={done ? onOpenVerdict : () => setExpanded((e) => !e)}
        className="relative flex w-full items-center gap-3 px-4 pb-2.5 pt-3 text-left"
      >
        <ToneIcon state={state} />
        <div className="min-w-0 flex-1" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={state.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="tabular text-[17px] font-bold leading-tight"
              style={{ color: done ? color : "var(--color-ink)" }}
            >
              {state.title}
            </motion.p>
          </AnimatePresence>
          {state.detail && <p className="mt-0.5 truncate text-[13px] text-ink-2">{state.detail}</p>}
        </div>
        {done ? (
          <ChevronRight size={20} className="shrink-0 text-ink-3" aria-label="See verdict" />
        ) : (
          <ChevronDown size={20} className={`shrink-0 text-ink-3 transition-transform ${expanded ? "rotate-180" : ""}`} aria-label="Show steps" />
        )}
      </button>
      <div className="relative px-4 pb-3">
        <RiskMeter p={view.pScam} band={view.verdict?.band} size="sm" />
      </div>
      <AnimatePresence initial={false}>
        {expanded && !done && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative overflow-hidden"
          >
            <div className="scroll-quiet max-h-[340px] overflow-y-auto border-t border-harbor-600/60 px-4 py-3">
              <TraceTimeline view={view} dense />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function toneColor(state: BannerState): string {
  if (state.tone === "scam" || state.tone === "suspicious" || state.tone === "safe") return LABEL_COLOR[state.tone];
  if (state.tone === "error") return "var(--color-warn)";
  return "var(--color-lamp)";
}

function ToneIcon({ state }: { state: BannerState }) {
  const color = toneColor(state);
  const Icon =
    state.tone === "scam" ? ShieldAlert : state.tone === "suspicious" ? ShieldQuestion : state.tone === "safe" ? ShieldCheck : state.tone === "error" ? TriangleAlert : null;
  return (
    <span
      className="relative grid size-10 shrink-0 place-items-center rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {Icon ? <Icon size={22} strokeWidth={2.3} /> : <BeaconMark size={26} glow className="lamp-breathe text-ink" />}
    </span>
  );
}
