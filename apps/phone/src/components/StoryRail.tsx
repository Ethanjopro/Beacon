import type { Stage } from "@beacon/shared";
import type { EventView } from "../state/reducer";
import { BeaconMark } from "./BeaconMark";
import { ModePill } from "./DemoConsole";

/**
 * Desktop-only left column: who we are in one line, and the four things
 * Beacon does, with the one happening right now lit up.
 */

const STEPS: { title: string; detail: string; stages: Stage[] }[] = [
  { title: "Detect", detail: "On-device rules first. Nemotron only for the hard cases.", stages: ["ingest", "triage", "analyze"] },
  { title: "Ask the real person", detail: "Checks the claim with Mom on her saved number, never the sender.", stages: ["challenge", "verify"] },
  { title: "Honest verdict", detail: "A probability, a range, and every reason with its weight.", stages: ["verdict"] },
  { title: "Get safe", detail: "Steps matched to the scam and to what you already did.", stages: ["recover"] },
];

function activeStep(view?: EventView): number {
  if (!view) return -1;
  if (view.verdict) return view.verdict.label === "safe" ? 2 : 3;
  const stage = view.activeStage ?? (view.verification?.request ? "verify" : "triage");
  return STEPS.findIndex((s) => s.stages.includes(stage));
}

export function StoryRail({ view, mode, status }: { view?: EventView; mode: "live" | "mock"; status: string }) {
  const active = activeStep(view);
  return (
    <div className="flex h-full max-w-[300px] flex-col justify-between py-2">
      <div>
        <div className="flex items-center gap-3">
          <BeaconMark size={44} glow className="text-ink" />
          <span className="text-[32px] font-bold tracking-tight">Beacon</span>
        </div>
        <p className="mt-5 text-[22px] font-medium leading-snug text-ink-2">
          Scam detection tells you it's probably fake. Beacon finds out.
        </p>
      </div>

      <ol className="flex flex-col gap-5">
        {STEPS.map((s, i) => {
          const on = i === active;
          const past = active > i;
          return (
            <li key={s.title} className="flex gap-3.5 transition-opacity duration-500" style={{ opacity: on ? 1 : past ? 0.75 : 0.45 }}>
              <span
                className="tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold transition-colors duration-500"
                style={{
                  background: on ? "var(--color-lamp)" : "var(--color-harbor-700)",
                  color: on ? "var(--color-harbor-900)" : "var(--color-ink-2)",
                  boxShadow: on ? "0 0 22px rgba(255,200,97,0.55)" : "none",
                }}
              >
                {i + 1}
              </span>
              <span>
                <span className="block text-[17px] font-semibold leading-tight">{s.title}</span>
                <span className="mt-1 block text-[14px] leading-snug text-ink-2">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col items-start gap-2.5">
        <ModePill mode={mode} status={status} />
        <p className="text-[13px] text-ink-3">
          Press <kbd className="rounded-md border border-harbor-600 px-1.5 py-0.5 font-mono text-ink-2">D</kbd> for the demo console
        </p>
      </div>
    </div>
  );
}
