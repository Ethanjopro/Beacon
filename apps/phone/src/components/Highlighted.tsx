import type { Signal } from "@beacon/shared";
import type { ReactNode } from "react";
import { evidenceRanges } from "../lib/evidence";

/** Message text with the phrases Beacon flagged underlined, so users see what tipped it off. */
export function Highlighted({ text, signals, color }: { text: string; signals: Signal[]; color: string }) {
  const ranges = evidenceRanges(text, signals);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark
        key={r.start}
        title={r.signal.title}
        className="rounded-[3px] bg-transparent px-px text-inherit"
        style={{ boxShadow: `inset 0 -0.42em 0 color-mix(in srgb, ${color} 38%, transparent)` }}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
