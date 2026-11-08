import { ArrowDown, ArrowLeft, ArrowRight, BrainCircuit, Check, DatabaseZap, Lock, Radio, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { MagentaGuardLogo } from "../components/MagentaGuardLogo";
import { ARCH, callPhase, type ArchBox } from "../lib/architecture";
import { latestEvent } from "../state/reducer";
import { useBeacon } from "../state/store";
import "./architecture.css";

const BOX_ICONS = { ingest: Radio, bus: DatabaseZap, orchestrator: BrainCircuit, challenge: ShieldCheck, handset: Smartphone } as const;

/** A live, judge-friendly view of the real call-screening path. */
export function ArchitecturePage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const { state } = useBeacon();
  const view = latestEvent(state);
  const phase = view?.event?.kind === "call" ? callPhase(view) : -1;
  const lastNote = [...(view?.trace ?? [])].reverse().find((t) => t.type === "thought" || t.type === "call.status" || (t.type === "tool" && t.status === "result"));
  const now = lastNote?.type === "thought" ? lastNote.text : lastNote?.type === "tool" ? `${lastNote.name}: ${lastNote.summary}` : lastNote?.type === "call.status" ? lastNote.note : undefined;

  return (
    <div className="mg-tech-page scroll-quiet" data-testid="architecture-page">
      <div className="mg-tech-aurora" aria-hidden="true" />
      <header className="mg-tech-nav">
        <a className="mg-tech-brand" href="#/"><MagentaGuardLogo size={27} /><span>Magenta<span>–Guard</span></span></a>
        <nav aria-label="Technology navigation"><a href="#how-it-works">How it works</a><a className="active" href="#/architecture">Technology</a></nav>
        <a className="mg-tech-back" href="#/"><ArrowLeft size={14} /> Back to demo</a>
      </header>

      <main className="mg-tech-main">
        <section className="mg-tech-hero">
          <div>
            <p className="mg-tech-kicker"><i /> THE TRUST PATH</p>
            <h1>Every hello,<br /><span>accounted for.</span></h1>
            <p className="mg-tech-lede">One call moves through five visible checks. The model can reason, but it cannot bypass the identity gate.</p>
          </div>
          <div className="mg-tech-proof" aria-label="System guarantees">
            <article><BrainCircuit size={18} /><span><strong>Real reasoning</strong><small>Nemotron tool loop</small></span><Check size={13} /></article>
            <article><Lock size={18} /><span><strong>Private by default</strong><small>No stored audio</small></span><Check size={13} /></article>
            <article><ShieldCheck size={18} /><span><strong>Identity before access</strong><small>Hard bridge gate</small></span><Check size={13} /></article>
          </div>
        </section>

        <section className="mg-tech-flow" aria-labelledby="flow-title">
          <header><div><p>LIVE SYSTEM MAP</p><h2 id="flow-title">From ring to resolution.</h2></div><span className={phase >= 0 ? "is-live" : ""}><i />{phase >= 0 ? "CALL IN MOTION" : "READY FOR A CALL"}</span></header>
          <div className="mg-tech-boxes">
            {ARCH.map((box, i) => <div key={box.id} className="mg-tech-box-wrap"><Box box={box} index={i} active={phase === i} done={phase > i} />{i < ARCH.length - 1 && <div className="mg-tech-connector"><ArrowDown className="mobile" size={17} /><ArrowRight className="desktop" size={17} /></div>}</div>)}
          </div>
          {now && <motion.p className="mg-tech-now" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="arch-now"><span><i /> RIGHT NOW</span>{now}</motion.p>}
        </section>

        <div className="mg-tech-details">
          <section>
            <p className="mg-tech-section-label">THE CALL, IN PLAIN ENGLISH</p>
            <h2>Fast enough to feel invisible.<br /><span>Strict enough to matter.</span></h2>
            <ol>
              <li><b>01</b><div><strong>Answer before the ring</strong><p>A signed Photon event becomes one normalized call. Magenta-Guard discloses that it is an AI.</p></div></li>
              <li><b>02</b><div><strong>Challenge the story</strong><p>Nemotron interviews the caller, checks risk patterns, then requests a code word or saved-number callback.</p></div></li>
              <li><b>03</b><div><strong>Gate the connection</strong><p>A structured verdict explains the decision. No passed challenge means no bridge—regardless of what the model says.</p></div></li>
            </ol>
          </section>
          <section className="mg-tech-privacy">
            <div className="mg-tech-privacy-icon"><Lock size={22} /></div>
            <p className="mg-tech-section-label">PRIVACY, BUILT INTO THE PATH</p>
            <h2>The safest data<br />is data we never keep.</h2>
            <ul>
              <li><Check size={13} /> Audio processed live, never stored</li>
              <li><Check size={13} /> Code words stay outside the model</li>
              <li><Check size={13} /> Saved numbers are redacted from traces</li>
              <li><Check size={13} /> Callbacks use registry numbers only</li>
            </ul>
            <p className="mg-tech-disclosure">Concept demo · synthetic customer data and simulated carrier network</p>
          </section>
        </div>
      </main>
    </div>
  );
}

const REAL_TEXT: Record<ArchBox["real"], string> = { real: "REAL", simulated: "SIMULATED", mixed: "SIM + REAL" };

function Box({ box, index, active, done }: { box: ArchBox; index: number; active: boolean; done: boolean }) {
  const Icon = BOX_ICONS[box.id];
  return <motion.article className={`mg-tech-box ${active ? "active" : ""} ${done ? "done" : ""}`} animate={{ y: active ? -5 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} data-testid={`arch-${box.id}`} data-active={active || undefined}>
    <div className="mg-tech-box-top"><span>0{index + 1}</span><Icon size={18} />{active && <i aria-label="active now" />}</div>
    <h3>{box.title}</h3><strong>{box.subtitle}</strong><p>{box.code}</p><small className={`tone-${box.real}`} title={box.realNote}>{REAL_TEXT[box.real]}</small>
  </motion.article>;
}
