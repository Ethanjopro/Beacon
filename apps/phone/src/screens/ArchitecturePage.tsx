import { ArrowDown, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { motion } from "motion/react";
import { ARCH, callPhase, type ArchBox } from "../lib/architecture";
import { latestEvent } from "../state/reducer";
import { useBeacon } from "../state/store";
import { BeaconMark } from "../components/BeaconMark";

/**
 * #/architecture — the system diagram for judges, live: the box the current
 * call is in lights up as the trace streams in.
 */
export function ArchitecturePage() {
  const { state } = useBeacon();
  const view = latestEvent(state);
  const phase = view?.event?.kind === "call" ? callPhase(view) : -1;
  const lastNote = [...(view?.trace ?? [])]
    .reverse()
    .find((t) => t.type === "thought" || t.type === "call.status" || (t.type === "tool" && t.status === "result"));
  const now =
    lastNote?.type === "thought" ? lastNote.text : lastNote?.type === "tool" ? `${lastNote.name}: ${lastNote.summary}` : lastNote?.type === "call.status" ? lastNote.note : undefined;

  return (
    <div className="scroll-quiet h-dvh overflow-y-auto bg-harbor-950" data-testid="architecture-page">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-center gap-3">
          <a href="#/" className="inline-flex items-center gap-1.5 rounded-xl bg-harbor-800 px-3 py-2 text-sm font-semibold text-ink-2">
            <ArrowLeft size={15} /> Phone
          </a>
          <BeaconMark size={30} className="text-ink" />
          <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Magenta-Guard architecture</h1>
        </header>
        <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-2">
          Every call is answered by the agent first. The subscriber's phone only rings for callers who pass an identity challenge.
          {phase >= 0 ? " The highlighted box is where the latest call is right now." : " Place a call from the demo console (D) and watch it move through."}
        </p>

        <div className="mt-8 flex flex-col items-stretch gap-2 lg:flex-row">
          {ARCH.map((box, i) => (
            <div key={box.id} className="flex flex-col items-center gap-2 lg:flex-1 lg:flex-row">
              <Box box={box} active={phase === i} done={phase > i} />
              {i < ARCH.length - 1 && (
                <>
                  <ArrowDown size={20} className="shrink-0 text-ink-3 lg:hidden" />
                  <ArrowRight size={20} className="hidden shrink-0 text-ink-3 lg:block" />
                </>
              )}
            </div>
          ))}
        </div>

        {now && (
          <p className="mt-5 rounded-2xl bg-harbor-900 px-4 py-3 text-[14px] text-ink-2" data-testid="arch-now">
            <span className="font-semibold text-lamp">Right now: </span>
            {now}
          </p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-harbor-700 bg-harbor-900/70 p-5">
            <h2 className="text-[17px] font-bold">One call, in order</h2>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-snug text-ink-2">
              <li>A call arrives (Photon webhook or sim injection) and is normalized into one call event.</li>
              <li>Magenta-Guard answers before the phone rings and says it's an AI.</li>
              <li>Nemotron interviews the caller and calls tools: who they claim to be, known scam tactics.</li>
              <li>It challenges the claim: the family code word (checked on the server) and a callback to the real contact's saved number.</li>
              <li>It returns a structured verdict: VERIFIED, SUSPICIOUS or SCAM, with confidence and plain-language reasons.</li>
              <li>A bridge gate connects the call only if a challenge passed. Otherwise it's blocked or sent to voicemail.</li>
            </ol>
          </section>
          <section className="rounded-3xl border border-harbor-700 bg-harbor-900/70 p-5">
            <h2 className="flex items-center gap-2 text-[17px] font-bold">
              <Lock size={16} className="text-lamp" /> Privacy by design
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-snug text-ink-2">
              <li>Call audio is processed live and never stored. Transcripts live in memory only for the length of the call.</li>
              <li>Code words, saved numbers and the caller's number never reach the model: Nemotron sees redacted text only.</li>
              <li>Callbacks go only to the number already saved for the contact, never to a number the caller gives.</li>
              <li>Customer data and the carrier network are simulated; nothing here is real customer data.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const REAL_STYLE: Record<ArchBox["real"], string> = {
  real: "bg-safe/15 text-safe",
  simulated: "bg-harbor-700 text-ink-2",
  mixed: "bg-warn/15 text-warn",
};
const REAL_TEXT: Record<ArchBox["real"], string> = { real: "Real", simulated: "Simulated", mixed: "Sim + real" };

function Box({ box, active, done }: { box: ArchBox; active: boolean; done: boolean }) {
  return (
    <motion.div
      animate={{ scale: active ? 1.03 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="flex w-full flex-1 flex-col rounded-3xl border p-4"
      style={{
        borderColor: active ? "var(--color-lamp)" : done ? "color-mix(in srgb, var(--color-lamp) 35%, transparent)" : "var(--color-harbor-700)",
        background: active ? "color-mix(in srgb, var(--color-lamp) 12%, var(--color-harbor-900))" : "var(--color-harbor-900)",
        boxShadow: active ? "0 0 36px -8px rgba(255,200,97,0.55)" : "none",
      }}
      data-testid={`arch-${box.id}`}
      data-active={active || undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[16px] font-bold leading-tight">{box.title}</h3>
        {active && <span className="mt-1 size-2.5 shrink-0 animate-pulse rounded-full bg-lamp" aria-label="active now" />}
      </div>
      <p className="mt-1 text-[13px] font-semibold text-ink-2">{box.subtitle}</p>
      <p className="mt-3 flex-1 text-[13px] leading-snug text-ink-3">{box.code}</p>
      <span className={`mt-3 self-start rounded-full px-2.5 py-1 text-[11px] font-bold ${REAL_STYLE[box.real]}`} title={box.realNote}>
        {REAL_TEXT[box.real]}
      </span>
    </motion.div>
  );
}
