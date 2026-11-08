import type { Stage, TraceEvent } from "@beacon/shared";
import { AlertTriangle, Bot, Check, CircleDashed, Gavel, Inbox, Loader2, PhoneCall, ShieldCheck, User, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { STAGE_TEXT, formatPct, formatWeight, LABEL_COLOR, LABEL_TEXT } from "../lib/format";
import type { EventView } from "../state/reducer";
import { SourceBadge } from "./Badges";
import { VerificationCard } from "./VerificationCard";

/**
 * The live "agent is thinking" timeline. Stages render as headers whose icon
 * updates in place; tool calls collapse into their result; scores are left to
 * the meter. Used in the judges' side panel and inside the phone.
 */
export function TraceTimeline({ view, dense = false }: { view: EventView; dense?: boolean }) {
  const rows = buildRows(view);
  return (
    <ol className="relative flex flex-col gap-2.5" data-testid="trace-timeline">
      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.li
            key={row.key}
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {row.render(dense)}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

interface Row {
  key: string;
  render: (dense: boolean) => ReactNode;
}

function buildRows(view: EventView): Row[] {
  const rows: Row[] = [];
  const trace = view.trace;
  for (const [i, item] of trace.entries()) {
    const key = `${item.seq}`;
    switch (item.type) {
      case "event.received":
        rows.push({
          key,
          render: () => (
            <Line icon={<Inbox size={15} />} tone="muted">
              {item.event.kind === "call" ? "Incoming call" : "New message"} arrived
            </Line>
          ),
        });
        break;
      case "stage":
        if (item.status === "completed") break; // shown on the "started" header
        rows.push({ key, render: () => <StageHeader stage={item.stage} view={view} skippedNote={item.status === "skipped" ? item.note : undefined} startNote={item.note} /> });
        break;
      case "thought":
        rows.push({
          key,
          render: (dense) => (
            <p className={`border-l-2 border-lamp/60 pl-3 ${dense ? "text-[13px]" : "text-sm"} italic leading-snug text-ink-2`}>{item.text}</p>
          ),
        });
        break;
      case "signal": {
        const s = item.signal;
        const up = s.weight > 0;
        rows.push({
          key,
          render: (dense) => (
            <div className="rounded-xl bg-harbor-800/80 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span
                  className="tabular mt-px shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold"
                  style={{
                    color: up ? "var(--color-scam)" : "var(--color-safe)",
                    background: up ? "rgba(255,90,82,0.13)" : "rgba(61,220,151,0.13)",
                  }}
                >
                  {formatWeight(s.weight)}
                </span>
                <span className={`min-w-0 flex-1 font-semibold leading-snug text-ink ${dense ? "text-[13px]" : "text-[15px]"}`}>{s.title}</span>
                <SourceBadge source={s.source} />
              </div>
              {!dense && s.evidence && <p className="mt-1.5 truncate pl-10 text-xs text-ink-3">“{s.evidence}”</p>}
            </div>
          ),
        });
        break;
      }
      case "tool": {
        if (item.status === "result" || item.status === "error") break;
        const result = trace.slice(i + 1).find((t) => t.type === "tool" && t.name === item.name && t.status !== "called");
        const done = result?.type === "tool" ? result : undefined;
        rows.push({
          key,
          render: (dense) => (
            <Line
              icon={done ? <Wrench size={14} /> : <Loader2 size={14} className="animate-spin" />}
              tone={done?.status === "error" ? "bad" : "muted"}
            >
              <span className="font-mono text-[11px] text-ink-3">{item.name}</span>
              <span className={`block ${dense ? "text-[13px]" : "text-sm"} text-ink-2`}>{done ? done.summary : item.summary}</span>
            </Line>
          ),
        });
        break;
      }
      case "privacy": {
        const r = item.report;
        const redacted = Object.values(r.redactions).reduce((a, b) => a + b, 0);
        rows.push({
          key,
          render: () => (
            <Line icon={<ShieldCheck size={15} />} tone="good">
              {r.sentToCloud
                ? `Sent to Nemotron with ${redacted} personal detail${redacted === 1 ? "" : "s"} removed`
                : "Nothing left this phone"}
            </Line>
          ),
        });
        break;
      }
      case "verification.requested":
        rows.push({
          key,
          render: (dense) => <VerificationCard request={item.request} outcome={view.verification?.outcome} compact={dense} />,
        });
        break;
      case "verification.resolved":
        break; // merged into the card above
      case "score":
        break; // the meter shows it
      case "verdict": {
        const v = item.verdict;
        rows.push({
          key,
          render: () => (
            <div
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-bold"
              style={{ color: LABEL_COLOR[v.label], background: `color-mix(in srgb, ${LABEL_COLOR[v.label]} 13%, transparent)` }}
            >
              <Gavel size={16} aria-hidden />
              <span className="flex-1">
                {LABEL_TEXT[v.label]} · {formatPct(v.pScam)}
              </span>
              <span className="tabular text-xs font-medium text-ink-3">{v.latencyMs < 1000 ? `${v.latencyMs} ms` : `${(v.latencyMs / 1000).toFixed(1)} s`}</span>
            </div>
          ),
        });
        break;
      }
      case "error":
        rows.push({ key, render: () => <Line icon={<AlertTriangle size={15} />} tone="bad">{item.message}</Line> });
        break;
      case "call.turn":
        rows.push({
          key,
          render: () => (
            <Line icon={item.speaker === "agent" ? <Bot size={15} /> : <User size={15} />} tone="muted">
              <span className="font-semibold text-ink">{item.speaker === "agent" ? "Magenta-Guard" : "Caller"}:</span> “{item.text}”
            </Line>
          ),
        });
        break;
      case "call.status":
        if (item.note) rows.push({ key, render: () => <Line icon={<PhoneCall size={15} />} tone="muted">{item.note}</Line> });
        break;
      case "call.verdict": {
        const r = item.result;
        const color = r.verdict.verdict === "SCAM" ? LABEL_COLOR.scam : r.verdict.verdict === "VERIFIED" ? LABEL_COLOR.safe : LABEL_COLOR.suspicious;
        rows.push({
          key,
          render: () => (
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-bold" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
              <Gavel size={16} aria-hidden />
              <span className="flex-1">
                {r.verdict.verdict} · {r.verdict.confidence}% · {r.action}
              </span>
              <span className="tabular text-xs font-medium text-ink-3">{r.decidedBy === "error" ? "model unreachable" : `${(r.latencyMs / 1000).toFixed(1)} s`}</span>
            </div>
          ),
        });
        break;
      }
    }
  }
  return rows;
}

function StageHeader({ stage, view, skippedNote, startNote }: { stage: Stage; view: EventView; skippedNote?: string; startNote?: string }) {
  const status = view.stages[stage];
  const completed = view.trace.find(
    (t): t is Extract<TraceEvent, { type: "stage" }> => t.type === "stage" && t.stage === stage && t.status === "completed",
  );
  const note = skippedNote ?? completed?.note ?? startNote;
  const icon =
    status === "skipped" ? (
      <CircleDashed size={14} className="text-ink-3" />
    ) : status === "completed" ? (
      <Check size={14} strokeWidth={3} className="text-lamp" />
    ) : (
      <Loader2 size={14} className="animate-spin text-lamp" />
    );
  return (
    <div className={`flex items-center gap-2 pt-1.5 ${status === "skipped" ? "opacity-55" : ""}`}>
      <span className="grid size-5 place-items-center">{icon}</span>
      <span className="text-[13px] font-bold text-ink">{STAGE_TEXT[stage]}</span>
      {note && <span className="min-w-0 truncate text-xs text-ink-3">{note}</span>}
    </div>
  );
}

function Line({ icon, tone, children }: { icon: ReactNode; tone: "muted" | "good" | "bad"; children: ReactNode }) {
  const color = tone === "good" ? "text-safe" : tone === "bad" ? "text-scam" : "text-ink-3";
  return (
    <div className="flex items-start gap-2 text-sm text-ink-2">
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center ${color}`}>{icon}</span>
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </div>
  );
}
