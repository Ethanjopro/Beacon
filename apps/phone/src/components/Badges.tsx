import type { EvidenceSource, VerdictLabel } from "@beacon/shared";
import { BrainCircuit, Cpu, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Smartphone, UserCheck } from "lucide-react";
import { LABEL_COLOR, LABEL_TEXT, SOURCE_TEXT } from "../lib/format";

const SOURCE_ICON: Record<EvidenceSource, typeof Cpu> = {
  heuristic: Smartphone,
  classifier: Cpu,
  llm: BrainCircuit,
  tool: Search,
  verification: UserCheck,
};

/** Where a piece of evidence came from — shown on every reason ("show your work"). */
export function SourceBadge({ source, label }: { source: EvidenceSource; label?: string }) {
  const Icon = SOURCE_ICON[source];
  const isPerson = source === "verification";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isPerson ? "bg-lamp/15 text-lamp" : "bg-harbor-700 text-ink-2"
      }`}
    >
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      {label ?? SOURCE_TEXT[source]}
    </span>
  );
}

const LABEL_ICON: Record<VerdictLabel, typeof ShieldAlert> = {
  scam: ShieldAlert,
  suspicious: ShieldQuestion,
  safe: ShieldCheck,
};

export function VerdictPill({ label, size = "md" }: { label: VerdictLabel; size?: "sm" | "md" }) {
  const Icon = LABEL_ICON[label];
  const color = LABEL_COLOR[label];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm"}`}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <Icon size={size === "sm" ? 12 : 15} strokeWidth={2.5} aria-hidden />
      {LABEL_TEXT[label]}
    </span>
  );
}

export { LABEL_ICON };
