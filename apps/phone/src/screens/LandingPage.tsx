import { ArrowDown, ArrowUpRight, AudioLines, BatteryFull, Check, Fingerprint, LockKeyhole, Phone, ShieldCheck, Signal, Wifi } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform, useMotionValueEvent } from "motion/react";
import { useRef, useState } from "react";
import "./landing.css";
import { InteractivePhone } from "../components/InteractivePhone";
import { useViewport } from "../lib/useViewport";

/** Illustrative product introduction. Live call data stays in the existing stage below. */
export function LandingPage() {
  const scene = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { height, width } = useViewport();
  const [ready, setReady] = useState(false);
  const { scrollYProgress } = useScroll({ target: scene, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", p => setReady(p >= .94));
  const rotateX = useTransform(scrollYProgress, [0, 1], [28, 0]);
  const rotateY = useTransform(scrollYProgress, [0, 1], [-22, 0]);
  const rotateZ = useTransform(scrollYProgress, [0, 1], [-9, 0]);
  const zoom = useTransform(scrollYProgress, [0, 1], [.78, Math.min((height - 50) / 473, (width - 32) / 248, 1.7)]);
  const top = useTransform(scrollYProgress, [0, 1], [Math.min(height * .53, 460), Math.max(25, (height - 473 * Math.min((height - 50) / 473, (width - 32) / 248, 1.7)) / 2)]);
  const fade = useTransform(scrollYProgress, [0, .5], [1, 0]);
  const leftExit = useTransform(scrollYProgress, [0, .7], [0, -350]);
  const rightExit = useTransform(scrollYProgress, [0, .7], [0, 350]);
  const liveOpacity = useTransform(scrollYProgress, [.8, .96], [0, 1]);
  const previewOpacity = useTransform(scrollYProgress, [.75, .92], [1, 0]);
  const enterDemo = () => {
    if (!scene.current) return;
    window.scrollTo({ top: scene.current.offsetTop + scene.current.offsetHeight - height, behavior: reduced ? "instant" : "smooth" });
  };  return <main className="mg-landing">
    <header className="mg-nav">
      <a className="mg-brand" href="#" aria-label="Magenta-Guard home"><ShieldCheck size={24} /><span>Magenta<span className="mg-light">–Guard</span></span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#/architecture">Technology</a></nav>
      <button className="mg-nav-cta" onClick={enterDemo}>Open demo <ArrowUpRight size={15} /></button>
    </header>
    <section className="mg-scroll-scene" ref={scene} aria-labelledby="landing-title">
      <div className="mg-sticky-scene">
        <motion.div className="mg-heading" style={{ opacity: fade, pointerEvents: ready ? "none" : "auto" }}>
          <span className="mg-eyebrow"><span /> A LITTLE DISTANCE. A LOT OF PEACE OF MIND.</span>
          <h1 id="landing-title">Your people.<br /><span>Only your people.</span></h1>
          <p>An AI call screener that answers first.<br className="mg-mobile-break" /> So you can pick up with confidence.</p>
          <button className="mg-primary" onClick={enterDemo}>Experience Magenta-Guard <ArrowUpRight size={17} /></button>
        </motion.div>
        <div className="mg-product-scene">
          <div className="mg-floor" /><div className="mg-shadow" />
          <motion.div className="mg-orbit mg-orbit-left" style={{ opacity: fade, x: leftExit }}><span className="mg-icon"><AudioLines size={21} /></span><div><small>BEFORE YOU ANSWER</small><strong>A calmer first hello.</strong><p>AI screens the conversation.</p></div><div className="mg-wave">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ height: `${9 + Math.sin(i * 1.7) ** 2 * 28}px` }} />)}</div></motion.div>
          <motion.div className="mg-orbit mg-orbit-right" style={{ opacity: fade, x: rightExit }}><span className="mg-icon mg-green"><Fingerprint size={22} /></span><small>TRUST, VERIFIED</small><strong>A familiar voice isn’t proof.</strong><p>A family code word.<br />A callback to the saved contact.</p><div className="mg-verification"><LockKeyhole size={14} /> Identity before connection</div></motion.div>
          <motion.div className="mg-device-position" style={{ top, scale: zoom }} initial={reduced ? false : { opacity: 0, y: -160 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease: [.16, 1, .3, 1] }}>
            <motion.div className="mg-device-tilt" style={reduced ? {} : { rotateX, rotateY, rotateZ }}>
              <div className="mg-device-float" style={{ animationPlayState: ready ? "paused" : "running" }}>
                <div className="mg-device"><div className="mg-side-button" /><div className="mg-phone-screen">
                  <div className="mg-status"><span>9:41</span><span><Signal size={12} /><Wifi size={12} /><BatteryFull size={16} /></span></div><div className="mg-island" />
                  <motion.div className="mg-phone-preview" style={{ opacity: previewOpacity, pointerEvents: ready ? "none" : "auto" }}><div className="mg-phone-brand"><ShieldCheck size={17} /> Magenta-Guard</div>
                  <div className="mg-shield"><ShieldCheck size={68} strokeWidth={1} /></div>
                  <div className="mg-phone-copy"><small>MEET YOUR CALL SCREENER</small><h2>A little more<br />peace of mind.</h2><p>Let the right people through.<br />Leave the uncertainty behind.</p></div>
                  <svg className="mg-phone-wave" viewBox="0 0 280 140" aria-hidden="true"><defs><linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c766a8" stopOpacity=".38" /><stop offset="1" stopColor="#c766a8" stopOpacity="0" /></linearGradient></defs><path d="M0 55 C65 0 90 120 155 65 S235 5 280 50 V140 H0Z" fill="url(#wave-fill)" /><path d="M0 55 C65 0 90 120 155 65 S235 5 280 50 M0 80 C65 25 120 110 180 55 S235 40 280 60" fill="none" stroke="#d578b8" strokeOpacity=".7" /></svg>
                  <button className="mg-phone-button" onClick={enterDemo}>Explore the demo <ArrowUpRight size={14} /></button><span className="mg-preview-label">PRODUCT PREVIEW</span></motion.div><motion.div className="mg-live-screen" style={{ opacity: reduced ? 1 : liveOpacity, pointerEvents: ready || reduced ? "auto" : "none" }} inert={!ready && !reduced}><InteractivePhone /></motion.div><div className="mg-home-bar" />
                </div></div>
                <motion.div className="mg-lift-card" style={{ opacity: fade, x: leftExit }}><span className="mg-icon mg-green"><ShieldCheck size={20} /></span><div><strong>Verification comes first.</strong><small>Built around the people you trust.</small></div><Check size={16} /></motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
        <a className="mg-scroll-cue" href="#how-it-works">A closer look <ArrowDown size={14} /></a>
        <span className="mg-scene-note">DESIGNED FOR TRUST. BUILT FOR REAL CONVERSATIONS.</span>
      </div>
    </section>
    <section className="mg-explainer" id="how-it-works">
      <div><span className="mg-eyebrow">A PAUSE BETWEEN RING AND RISK</span><h2>Familiar doesn’t<br />always mean safe.</h2><p>Magenta-Guard checks who’s calling before they reach you. You get a clear explanation, not another decision to make under pressure.</p></div>
      <ol>{[
        ["01", "An AI answers first.", "It introduces itself and asks what the call is about.", Phone],
        ["02", "Identity gets checked.", "A code word and a callback to the contact’s saved number challenge the caller’s story.", Fingerprint],
        ["03", "You stay in the know.", "See the verdict, the reasons, and what to watch for next time.", ShieldCheck],
      ].map(([number, title, copy, Icon]) => { const StepIcon = Icon as typeof Phone; return <li key={String(number)}><span>{String(number)}</span><div><h3>{String(title)}</h3><p>{String(copy)}</p></div><StepIcon size={22} /></li>; })}</ol>
    </section>
    <section className="mg-demo" id="live-demo" aria-label="Interactive call screening demo">
      <div className="mg-demo-heading"><div><span className="mg-eyebrow">TAKE A CLOSER LOOK</span><h2>See what happens before hello.</h2></div><a href="#/console">Scenario console <ArrowUpRight size={17} /></a></div>
      <div className="mg-demo-toolbar"><span><ShieldCheck size={18} /> Magenta-Guard <small>INTERACTIVE DEMO</small></span><a href="#/architecture">View architecture <ArrowUpRight size={15} /></a></div>
      <a className="mg-full-demo-link" href="#/demo">Open full screening dashboard ↗</a>
    </section>
    <footer className="mg-footer"><span><ShieldCheck size={18} /> Magenta-Guard</span><p>HackUTD 2026 concept · Simulated carrier network and synthetic customer data.</p><a href="#">Back to top ↑</a></footer>
  </main>;
}


