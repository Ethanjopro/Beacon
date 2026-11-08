import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Clock3,
  Compass,
  Image as PhotoIcon,
  Mail,
  Map,
  MessageSquare,
  Phone,
  Settings,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { PhoneApp } from "../PhoneApp";
import { useBeacon } from "../state/store";
import { MagentaGuardLogo } from "./MagentaGuardLogo";

export function InteractivePhone() {
  const { backend, state, arrival, status } = useBeacon();
  const [app, setApp] = useState<"home" | "phone" | "messages" | "guard" | "screening">("home");
  const [messageThread, setMessageThread] = useState<"inbox" | "mom" | "photon">("inbox");
  const [simulating, setSimulating] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | undefined>();
  const [activePhotonId, setActivePhotonId] = useState<string | undefined>();

  const photonViews = state.order
    .map((id) => state.byId[id])
    .filter((view) => view?.event?.source === "photon");
  const latestPhoton = photonViews[0];
  const activePhoton = (activePhotonId ? state.byId[activePhotonId] : undefined) ?? latestPhoton;
  const photonName = activePhoton?.event?.from.displayName ?? activePhoton?.event?.from.handle ?? "Photon sender";

  useEffect(() => {
    if (!arrival) return;
    const view = state.byId[arrival.eventId];
    if (view?.event?.source !== "photon") return;
    setActivePhotonId(arrival.eventId);
    setMessageThread("photon");
    setApp("messages");
  }, [arrival, state.byId]);

  const runSimulatedCall = async () => {
    if (simulating) return;
    setSimulating(true);
    try {
      const { eventId } = await backend.fire("bank-fraud-dept-call");
      setActiveCallId(eventId);
      setApp("screening");
    } finally {
      setTimeout(() => setSimulating(false), 900);
    }
  };

  return (
    <div className="mg-interactive-phone">
      {/* Top iOS In-App Bar */}
      {app !== "home" && (
        <div className="mg-ios-nav-bar">
          <button className="mg-app-back" onClick={() => setApp("home")} aria-label="Home">
            <ArrowLeft size={14} /> Home
          </button>
          <span className="mg-ios-nav-title">
            {app === "phone" ? "Demo Calls" : app === "messages" ? "Messages" : app === "guard" ? "Magenta-Guard" : "Call Screener"}
          </span>
          <span className="mg-ios-nav-right" />
        </div>
      )}

      {/* ── HOME SCREEN: Authentic iPhone Grid & Dock ── */}
      {app === "home" && (
        <div className="mg-ios-home">
          {/* iOS Date & Clock Widget */}
          <div className="mg-ios-widget">
            <p className="mg-ios-date">Sunday, November 8</p>
            <h1 className="mg-ios-clock">9:41</h1>
            <div className="mg-ios-shield-pill">
              <span className="mg-ios-pulse-dot" />
              <span>Magenta-Guard Active</span>
            </div>
          </div>

          {/* iOS App Grid */}
          <div className="mg-ios-grid">
            {/* Messages App */}
            <button className="mg-ios-app-item" onClick={() => setApp("messages")}>
              <div className="mg-ios-icon mg-icon-messages">
                <MessageSquare size={26} className="text-white" />
                <span className="mg-ios-badge">1</span>
              </div>
              <span className="mg-ios-label">Messages</span>
            </button>

            {/* Phone App */}
            <button className="mg-ios-app-item" onClick={() => setApp("phone")}>
              <div className="mg-ios-icon mg-icon-phone">
                <Phone size={26} className="text-white" />
              </div>
              <span className="mg-ios-label">Phone</span>
            </button>

            {/* Magenta-Guard */}
            <button className="mg-ios-app-item" onClick={() => setApp("guard")}>
              <div className="mg-ios-icon mg-icon-security">
                <MagentaGuardLogo size={29} />
                <span className="mg-ios-badge mg-badge-green">ON</span>
              </div>
              <span className="mg-ios-label mg-guard-label">Magenta-Guard</span>
            </button>

            {/* Safari */}
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-safari">
                <Compass size={26} className="text-white" />
              </div>
              <span className="mg-ios-label">Safari</span>
            </div>

            {/* Photos */}
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-photos">
                <PhotoIcon size={26} className="text-white" />
              </div>
              <span className="mg-ios-label">Photos</span>
            </div>

            {/* Settings */}
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-settings">
                <Settings size={26} className="text-white" />
              </div>
              <span className="mg-ios-label">Settings</span>
            </div>

            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-facetime"><Video size={25} /></div>
              <span className="mg-ios-label">FaceTime</span>
            </div>
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-mail"><Mail size={25} /></div>
              <span className="mg-ios-label">Mail</span>
            </div>
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-maps"><Map size={25} /></div>
              <span className="mg-ios-label">Maps</span>
            </div>
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-camera"><Camera size={25} /></div>
              <span className="mg-ios-label">Camera</span>
            </div>
            <div className="mg-ios-app-item mg-app-dim">
              <div className="mg-ios-icon mg-icon-clock"><Clock3 size={25} /></div>
              <span className="mg-ios-label">Clock</span>
            </div>
          </div>

          {/* Frosted Glass Bottom Dock */}
          <div className="mg-ios-dock">
            <button onClick={() => setApp("phone")} aria-label="Open Phone">
              <div className="mg-ios-icon mg-icon-phone">
                <Phone size={22} className="text-white" />
              </div>
            </button>
            <button onClick={() => setApp("messages")} aria-label="Open Messages">
              <div className="mg-ios-icon mg-icon-messages">
                <MessageSquare size={22} className="text-white" />
              </div>
            </button>
            <div className="mg-ios-icon mg-icon-safari">
              <Compass size={22} className="text-white" />
            </div>
            <div className="mg-ios-icon mg-icon-settings">
              <Settings size={22} className="text-white" />
            </div>
          </div>
        </div>
      )}

      {/* ── MAGENTA-GUARD: compact protection dashboard ── */}
      {app === "guard" && (
        <div className="mg-guard-dashboard">
          <header className="mg-guard-head">
            <span className="mg-guard-logo"><MagentaGuardLogo size={26} /></span>
            <div><strong>Magenta-Guard</strong><small>AI CALL PROTECTION</small></div>
            <span className="mg-guard-live"><i /> LIVE</span>
          </header>

          <section className="mg-guard-hero">
            <MagentaGuardLogo size={54} />
            <div><small>PROTECTION STATUS</small><h2>Watching every hello.</h2><p>Nemotron screens unknown callers before your phone rings.</p></div>
          </section>

          <div className="mg-guard-wave" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>

          <div className="mg-guard-grid">
            <article><span>01</span><strong>Answer first</strong><small>AI disclosure active</small></article>
            <article><span>02</span><strong>Verify identity</strong><small>Code + callback</small></article>
          </div>

          <section className="mg-agent-card">
            <div><span className="mg-agent-dot" /><strong>Nemotron agent</strong></div>
            <code>status: ready<br />bridge_gate: armed<br />audio_storage: off</code>
          </section>

          <div className="mg-guard-actions">
            <button onClick={runSimulatedCall} disabled={simulating}><Sparkles size={13} />{simulating ? "Starting…" : "Run demo attack"}</button>
            <button onClick={() => setApp("screening")}><ShieldCheck size={13} />Open screening</button>
          </div>
        </div>
      )}

      {/* ── MESSAGES: a dedicated iMessage-style inbox and conversation ── */}
      {app === "messages" && (
        <div className="mg-messages-view">
          {messageThread === "inbox" ? (
            <>
              <div className="mg-imessage-title"><h2>Messages</h2><span className={`mg-photon-status ${status === "live" ? "is-live" : ""}`}><i />{status === "live" ? "PHOTON LIVE" : "CONNECTING"}</span></div>
              <div className="mg-imessage-search">Search</div>
              <div className="mg-imessage-list">
                {latestPhoton && (
                  <button onClick={() => { setActivePhotonId(latestPhoton.eventId); setMessageThread("photon"); }}>
                    <span className="mg-avatar mg-avatar-photon">P</span>
                    <div><strong>{latestPhoton.event?.from.displayName ?? latestPhoton.event?.from.handle}</strong><p>{latestPhoton.turns.at(-1)?.text ?? "Incoming Photon message"}</p></div>
                    <time>Live</time><ChevronRight size={12} />
                  </button>
                )}
                <button onClick={() => setMessageThread("mom")}><span className="mg-avatar mg-avatar-mom">M</span><div><strong>Mom</strong><p>Yep! Thanks for dinner ❤️</p></div><time>Yesterday</time><ChevronRight size={12} /></button>
                <button><span className="mg-avatar mg-avatar-jordan">J</span><div><strong>Jordan</strong><p>Running 10 min late, save me a seat</p></div><time>Tue</time><ChevronRight size={12} /></button>
                <button><span className="mg-avatar mg-avatar-pharmacy">O</span><div><strong>Oakridge Pharmacy</strong><p>Your prescription is ready.</p></div><time>Mon</time><ChevronRight size={12} /></button>
              </div>
            </>
          ) : (
            <div className="mg-imessage-thread">
              <header><button onClick={() => setMessageThread("inbox")}><ArrowLeft size={14} /> Messages</button><span className={`mg-avatar ${messageThread === "photon" ? "mg-avatar-photon" : ""}`}>{messageThread === "mom" ? "M" : "P"}</span><strong>{messageThread === "mom" ? "Mom" : photonName}</strong></header>
              <div className="mg-chat-day">{messageThread === "photon" ? "Live via Photon · screened by Magenta-Guard" : "Today 9:41 AM"}</div>
              {messageThread === "mom" ? (
                <div className="mg-chat-bubbles"><p className="from-them">Are we still on for dinner?</p><p className="from-me">Yes! I’ll be there at 6.</p><p className="from-them">Perfect ❤️</p></div>
              ) : (
                <div className="mg-chat-bubbles mg-live-photon-thread">
                  <div className="mg-photon-live-banner"><span /><strong>Live Photon conversation</strong><small>New texts appear here automatically</small></div>
                  {activePhoton?.turns.map((turn) => (
                    <p key={turn.seq} className={turn.speaker === "caller" ? "from-them" : "from-me"}>{turn.text}</p>
                  ))}
                  {!activePhoton?.turns.length && <p className="mg-photon-waiting">Waiting for a text to the protected Photon number…</p>}
                </div>
              )}
              <div className="mg-message-compose"><span>＋</span><div>iMessage</div><span>↑</span></div>
            </div>
          )}
        </div>
      )}

      {/* ── PHONE: demo-only simulated calls ── */}
      {app === "phone" && (
        <div className="mg-demo-calls">
          <div className="mg-demo-call-icon"><Phone size={27} /></div>
          <h2>Simulated calls</h2><p>No real number is dialed. Choose a demo and watch Magenta-Guard answer first.</p>
          <button onClick={runSimulatedCall} disabled={simulating}><span className="mg-avatar mg-avatar-bank">B</span><div><strong>Fake bank fraud desk</strong><small>Pressures you to reveal a one-time code</small></div><Phone size={14} /></button>
          <blockquote className="mg-demo-call-preview">“We detected a $2,300 charge. Read back the six-digit code so I can stop it.”</blockquote>
          <small className="mg-simulation-note">SIMULATION · SYNTHETIC DATA</small>
        </div>
      )}

      {/* ── CALLING / SCREENING: Live Screener with Red Drop Call Button ── */}
      {app === "screening" && (
        <div className="mg-screening-view">
          <PhoneApp
            compact
            activeCallId={activeCallId}
            onBackToHome={() => setApp("home")}
          />
        </div>
      )}

      {/* Bottom iOS Home Indicator (interactive: tap to return home) */}
      <div
        className="mg-ios-home-indicator"
        onClick={() => setApp("home")}
        title="Tap to return Home"
        aria-label="Home bar"
      />
    </div>
  );
}
