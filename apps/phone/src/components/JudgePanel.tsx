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
  { group: "mobile", label: "SIM swap alert", name: "Mobile Security", text: "This is your wireless carrier's security team. We detected a SIM change. Read back the six-digit code we sent so we can cancel it." },
  { group: "mobile", label: "Number transfer", name: "Account Protection", text: "A transfer of your mobile number is pending. Confirm your account PIN now or your service will be disconnected today." },
  { group: "mobile", label: "Device upgrade", name: "Wireless Rewards", text: "You qualify for a free phone upgrade. I just need your account PIN and the verification code we texted to reserve it." },
  { group: "mobile", label: "eSIM activation", name: "eSIM Support", text: "Your eSIM has expired. Share the one-time code from your phone so I can reactivate service before you lose your number." },
  { group: "other", label: "Fake Medicare", name: "Medicare Support", text: "This is Medicare support. Your coverage will be suspended today unless you confirm your member number and payment details." },
  { group: "other", label: "Fake IRS", name: "Revenue Officer", text: "This is a federal revenue officer. A warrant will be issued unless you settle the tax balance today using prepaid gift cards." },
  { group: "other", label: "Bank code theft", name: "Fraud Department", text: "We blocked a charge on your bank card. Read me the one-time code we texted you so I can unlock the account." },
  { group: "other", label: "Family emergency", name: "Sam", text: "Hi Grandma, it's Sam. I crashed the car and need $2,000 for bail. Please don't tell Mom." },
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
          <div className="mt-3 rounded-xl border border-harbor-700/80 bg-harbor-900/45 p-2.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-lamp">Mobile-network attacks</p>
            <div className="flex flex-wrap gap-1.5">{EXAMPLES.filter((e) => e.group === "mobile").map((e) => <ExampleButton key={e.label} example={e} onPick={() => { setName(e.name); setWords(e.text); }} />)}</div>
            <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink-3">Other common scams</p>
            <div className="flex flex-wrap gap-1.5">{EXAMPLES.filter((e) => e.group === "other").map((e) => <ExampleButton key={e.label} example={e} onPick={() => { setName(e.name); setWords(e.text); }} />)}</div>
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

function ExampleButton({ example, onPick }: { example: (typeof EXAMPLES)[number]; onPick: () => void }) {
  return <button type="button" onClick={onPick} title={example.text} className={`rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors ${example.group === "mobile" ? "border-lamp/25 bg-lamp/10 text-lamp hover:bg-lamp/15" : "border-harbor-600 bg-harbor-700 text-ink-2 hover:text-ink"}`}>{example.label}</button>;
}
