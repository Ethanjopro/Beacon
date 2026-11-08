import { API } from "@beacon/shared";
import { useState } from "react";
import { ArrowLeft, Delete, MessageSquare, Phone } from "lucide-react";
import { PhoneApp } from "../PhoneApp";

export function InteractivePhone() {
  const [app, setApp] = useState<"home" | "phone" | "screening">("home");
  const [number, setNumber] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [dialing, setDialing] = useState(false);

  const handleDial = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetNumber = number.trim();
    if (!targetNumber || dialing) return;

    setDialing(true);
    setNotice(null);

    try {
      const res = await fetch(API.callsDial, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: targetNumber }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice({ text: dialError(res.status, data.error), error: true });
        setDialing(false);
        return;
      }

      // Transition to the live screening view where transcript streams live with red drop call button!
      setApp("screening");
      setDialing(false);
    } catch {
      setNotice({ text: "Can't reach the Magenta-Guard server. Is it running?", error: true });
      setDialing(false);
    }
  };

  return (
    <div className="mg-interactive-phone">
      {app !== "home" && (
        <button className="mg-app-back" onClick={() => setApp("home")} aria-label="Home">
          <ArrowLeft size={16} /> Home
        </button>
      )}
      {app === "home" && (
        <div className="mg-app-home">
          <p>Magenta-Guard</p>
          <h2>Your phone.<br />Your peace of mind.</h2>
          <div className="mg-app-icons">
            <button onClick={() => setApp("phone")}>
              <span><Phone /></span>Phone
            </button>
            <button onClick={() => setApp("screening")}>
              <span><MessageSquare /></span>Screening
            </button>
          </div>
          <a href="#/console">Open scenario console ↗</a>
        </div>
      )}
      {app === "screening" && (
        <div className="mg-screening-app">
          <PhoneApp compact />
        </div>
      )}
      {app === "phone" && (
        <form className="mg-dialer" onSubmit={handleDial}>
          <label htmlFor="dial-number">Phone</label>
          <input
            id="dial-number"
            type="tel"
            autoComplete="off"
            placeholder="Enter a number"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value.replace(/[^0-9+*#]/g, "").slice(0, 20));
              setNotice(null);
            }}
          />
          <p role="status" className={notice?.error ? "mg-dial-status mg-dial-error" : "mg-dial-status"} data-testid="dial-status">
            {notice ? notice.text : dialing ? "Placing call via Magenta-Guard…" : "Enter a number to place a voice-screened call."}
          </p>
          <div className="mg-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => {
                  setNumber((n) => (n + key).slice(0, 20));
                  setNotice(null);
                }}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="mg-call-actions">
            <button type="submit" disabled={!number || dialing} aria-label="Call">
              <Phone />
            </button>
            <button
              type="button"
              aria-label="Delete last digit"
              onClick={() => setNumber((n) => n.slice(0, -1))}
            >
              <Delete />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Plain-language reasons the server refused to dial. */
function dialError(status: number, serverMessage?: string): string {
  switch (status) {
    case 403:
      return "This number isn't on the demo's dial allowlist (DIAL_ALLOWLIST in .env).";
    case 409:
      return "A call is already live. Wait for it to finish.";
    case 401:
      return "Dialing needs the demo's dial token.";
    case 400:
      return "That doesn't look like a full phone number.";
    default:
      return serverMessage || `Couldn't place the call (error ${status}).`;
  }
}
