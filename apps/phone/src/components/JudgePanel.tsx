import { Bot, Loader2, PhoneCall, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBeacon } from "../state/store";

/**
 * "Be the scammer": anyone (a judge) types what a caller says and places a
 * real call to the protected phone. It goes through the same pipeline as any
 * other call (POST /api/calls → normalize → Nemotron screener), then each
 * reply is the caller speaking (POST /api/calls/:id/say). Nothing is scripted.
 */

const EXAMPLES = [
  "Hi Grandma, it's Sam. I crashed the car and I'm at the police station, I need $2,000 for bail. Please don't tell Mom.",
  "This is Officer Daniels with the county sheriff. There's a warrant for your arrest unless you pay a fine today with gift cards.",
  "Hey it's your bank's fraud team. We blocked a charge, I just need the code we texted you to unlock your card.",
];

export function JudgePanel() {
  const { backend, state } = useBeacon();
  const [name, setName] = useState("Sam");
  const [words, setWords] = useState("");
  const [reply, setReply] = useState("");
  const [callId, setCallId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const scroller = useRef<HTMLDivElement>(null);

  const view = callId ? state.byId[callId] : undefined;
  const live = Boolean(callId && !view?.screening);
  const turns = view?.turns ?? [];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, Boolean(view?.screening)]);

  if (!backend.startCall || !backend.say) {
    return <p className="rounded-2xl border border-dashed border-harbor-600 px-4 py-4 text-sm text-ink-3">The judge's call needs the live server (Nemotron). It isn't available in offline mock mode.</p>;
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    act(async () => {
      const handle = `+1555010${String(1000 + Math.floor(Math.random() * 9000))}`;
      const { callId } = await backend.startCall!({ from: { handle, ...(name.trim() ? { displayName: name.trim() } : {}) }, firstWords: words.trim() });
      setCallId(callId);
      setReply("");
    });

  const send = () =>
    act(async () => {
      await backend.say!(callId!, reply.trim());
      setReply("");
    });

  return (
    <div className="rounded-2xl border border-lamp/30 bg-harbor-800 p-4" data-testid="judge-panel">
      {!callId || !live ? (
        <>
          <label className="block text-[13px] font-semibold text-ink-2">
            Caller ID name <span className="font-normal text-ink-3">(scammers can set this to anything)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-harbor-600 bg-harbor-900 px-3 py-2 text-[15px] text-ink" />
          </label>
          <label className="mt-3 block text-[13px] font-semibold text-ink-2">
            What the caller says
            <textarea
              value={words}
              onChange={(e) => setWords(e.target.value)}
              rows={3}
              placeholder="Type any scam line, in your own words…"
              className="mt-1 w-full resize-none rounded-xl border border-harbor-600 bg-harbor-900 px-3 py-2 text-[15px] text-ink placeholder:text-ink-3"
              data-testid="judge-words"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setWords(e)} className="rounded-full bg-harbor-700 px-2.5 py-1 text-left text-[12px] text-ink-2 hover:text-ink">
                {e.slice(0, 38)}…
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !words.trim()}
            onClick={start}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lamp py-3 text-[15px] font-bold text-harbor-900 disabled:opacity-50"
            data-testid="judge-call"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />} Call the protected phone
          </button>
        </>
      ) : null}

      {callId && (
        <div ref={scroller} className="scroll-quiet mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto" data-testid="judge-transcript">
          {turns.map((t) => (
            <p key={t.seq} className={`flex gap-2 text-[14px] leading-snug ${t.speaker === "agent" ? "text-lamp" : "text-ink"}`}>
              <span className="mt-0.5 shrink-0">{t.speaker === "agent" ? <Bot size={14} /> : <User size={14} />}</span>
              {t.text}
            </p>
          ))}
          {view?.screening && (
            <p className="mt-1 text-[13px] font-bold text-ink-2">
              Call over: {view.screening.verdict.verdict} · {view.screening.verdict.confidence}% · {view.screening.action}
            </p>
          )}
        </div>
      )}

      {live && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim() && !busy) void send();
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Answer Magenta-Guard as the caller…"
            className="min-w-0 flex-1 rounded-xl border border-harbor-600 bg-harbor-900 px-3 py-2 text-[15px] text-ink placeholder:text-ink-3"
            data-testid="judge-reply"
          />
          <button type="submit" disabled={busy || !reply.trim()} className="grid size-10 place-items-center rounded-xl bg-lamp text-harbor-900 disabled:opacity-50" aria-label="Say it">
            <Send size={16} />
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[13px] text-warn">{error}</p>}
    </div>
  );
}
