import { LABEL_THRESHOLDS, labelFor } from "@beacon/shared";
import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { LABEL_COLOR, formatPct, formatRange } from "../lib/format";

/**
 * The risk meter: a horizontal "beam" that fills as evidence arrives. Zones
 * are marked at the shared thresholds, the honest-uncertainty band is drawn
 * as a bracket, and the number counts up with the fill.
 */

const SPRING = { stiffness: 190, damping: 28, mass: 0.8 };

export function AnimatedPct({ value, className = "", style }: { value: number; className?: string; style?: CSSProperties }) {
  // Starts at 0 so the number counts up when a verdict first appears.
  const spring = useSpring(0, SPRING);
  const [shown, setShown] = useState(0);
  useEffect(() => spring.set(value), [spring, value]);
  useMotionValueEvent(spring, "change", (v) => setShown(v));
  return <span className={`tabular ${className}`} style={style}>{formatPct(Math.min(1, Math.max(0, shown)))}</span>;
}

interface RiskMeterProps {
  /** Running probability of scam; undefined = no evidence yet. */
  p?: number;
  band?: readonly [number, number];
  size?: "sm" | "lg";
  /** Show "Safe / Suspicious / Scam" under the track. */
  showZones?: boolean;
}

export function RiskMeter({ p, band, size = "lg", showZones = size === "lg" }: RiskMeterProps) {
  const value = p ?? 0;
  const color = p === undefined ? "var(--color-harbor-500)" : LABEL_COLOR[labelFor(value)];
  const h = size === "lg" ? 12 : 6;
  const sus = LABEL_THRESHOLDS.suspicious * 100;
  const scam = LABEL_THRESHOLDS.scam * 100;

  return (
    <div className="w-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Chance this is a scam">
      <div className="relative w-full" style={{ height: h + (size === "lg" ? 12 : 4) }}>
        {/* track with zone tints */}
        <div
          className="absolute inset-x-0 overflow-hidden rounded-full"
          style={{ top: size === "lg" ? 6 : 2, height: h, background: "var(--color-harbor-700)" }}
        >
          <div className="absolute inset-y-0" style={{ left: 0, width: `${sus}%`, background: "rgba(61,220,151,0.10)" }} />
          <div className="absolute inset-y-0" style={{ left: `${sus}%`, width: `${scam - sus}%`, background: "rgba(255,165,58,0.12)" }} />
          <div className="absolute inset-y-0" style={{ left: `${scam}%`, right: 0, background: "rgba(255,90,82,0.14)" }} />
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            initial={false}
            animate={{ width: `${value * 100}%`, backgroundColor: color }}
            transition={{ width: { type: "spring", ...SPRING }, backgroundColor: { duration: 0.4 } }}
            style={{ boxShadow: p === undefined ? "none" : `0 0 ${size === "lg" ? 18 : 10}px ${color}` }}
          />
        </div>
        {/* threshold ticks */}
        {[sus, scam].map((x) => (
          <div
            key={x}
            className="absolute w-px bg-harbor-900/80"
            style={{ left: `${x}%`, top: size === "lg" ? 6 : 2, height: h }}
          />
        ))}
        {/* honest-uncertainty band: a bright capsule hugging the track */}
        {band && size === "lg" && (
          <motion.div
            className="absolute rounded-full border-2 border-ink/85 bg-ink/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: `calc(${band[0] * 100}% - 3px)`, width: `calc(${Math.max(0, (band[1] - band[0]) * 100)}% + 6px)` }}
            transition={{ type: "spring", ...SPRING }}
            style={{ top: 3, height: h + 6 }}
            title={`Likely range: ${formatRange(band[0], band[1])}`}
          />
        )}
      </div>
      {showZones && (
        <div className="relative mt-1.5 h-4 text-[11px] font-medium text-ink-3">
          <span className="absolute left-0">Safe</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${(sus + scam) / 2}%` }}>
            Suspicious
          </span>
          <span className="absolute right-0">Scam</span>
        </div>
      )}
    </div>
  );
}
