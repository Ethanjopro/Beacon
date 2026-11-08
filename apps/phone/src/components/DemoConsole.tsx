import type { ScenarioSummary, VerificationRequest } from "@beacon/shared";
import { House, Loader2, MessageSquareText, PhoneIncoming, RotateCcw, Send, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { formatHandle, CHANNEL_TEXT } from "../lib/format";
import { useBeacon } from "../state/store";
import { VerdictPill } from "./Badges";
import { JudgePanel } from "./JudgePanel";

/**
 * Demo console (press D, or open #/console in a second window): fire
 * scenarios, answer verification requests as the trusted contact, reset.
 * Hidden from the phone view so judges see only the product.
 */

const QUICK_REPLIES = ["No?? That's not me!", "Yes, that was me", "Who is this?"];

export function DemoConsole({ onClose, standalone = false }: { onClose?: () => void; standalone?: boolean }) {
  const { backend, status, resetDemo, simpleMode, setSimpleMode } = useBeacon();
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>();
  const [loadError, setLoadError] = useState<string>();
  const [pending, setPending] = useState<VerificationRequest[]>([]);
  const [busy, setBusy] = useState<string>();
  const [autoReply, setAutoReply] = useState(() => backend.autoReply?.get() ?? false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      backend.scenarios().then(
        (list) => alive && (setScenarios(list), setLoadError(undefined)),
        (err: unknown) => alive && setLoadError(err instanceof Error ? err.message : "Couldn't load scenarios"),
      );
    void load();
    return () => {
      alive = false;
    };
  }, [backend, status]);

  useEffect(() => backend.watchPending(setPending), [backend]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(undefined);
    }
  };

  const fire = (id: string) =>
    run(`fire:${id}`, async () => {
      await backend.fire(id);
      // On the standalone console page there's no phone on screen: go to the live dashboard to watch the call.
      if (standalone) window.location.hash = "#/demo";
      else onClose?.();
    });

  const orderedScenarios = scenarios ? orderScenarios(scenarios) : undefined;

  // Number keys run scenarios 1–9 while the console is open (not while typing a reply).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const s = Number.isInteger(n) && n >= 1 ? orderedScenarios?.[n - 1] : undefined;
      if (s) {
        e.preventDefault();
        void fire(s.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="demo-console">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-harbor-700 px-5 py-4 sm:px-6">
        {standalone && (
          <a href="#" className="inline-flex items-center gap-1.5 rounded-xl bg-harbor-700 px-3 py-2 text-sm font-semibold text-ink-2">
            <House size={15} /> Home
          </a>
        )}
        <Zap size={18} className="shrink-0 text-lamp" />
        <h2 className="whitespace-nowrap text-[19px] font-bold">Demo console</h2>
        <span className="order-last w-full sm:order-none sm:w-auto">
          <ModePill mode={backend.mode} status={status} />
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => run("reset", resetDemo)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-harbor-700 px-3 py-2 text-sm font-semibold text-ink-2"
          data-testid="console-reset"
        >
          <RotateCcw size={15} /> Reset
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-harbor-700 text-ink-2" aria-label="Close console">
            <X size={17} />
          </button>
        )}
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {loadError && <p className="mb-4 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">{loadError}</p>}

        <h3 className="mb-1 text-[13px] font-bold text-ink-2">Be the scammer</h3>
        <p className="mb-3 text-[13px] text-ink-3">Type anything. It goes through the same pipeline as a real call, and Nemotron reacts live.</p>
        <JudgePanel />

        <div className="mb-3 mt-7 flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="text-[13px] font-bold text-ink-2">Preset scenarios</h3><p className="mt-1 text-[12px] text-ink-3">Mobile-network threats appear first. Run one through the live screening pipeline.</p></div>
          <span className="rounded-full border border-lamp/20 bg-lamp/5 px-2.5 py-1 text-[10px] font-bold tracking-wide text-lamp">RUN = START DEMO</span>
        </div>
        {!orderedScenarios ? (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 size={15} className="animate-spin" /> Loading scenarios…
          </p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {orderedScenarios.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy !== undefined}
                  onClick={() => fire(s.id)}
                  className="group flex h-full w-full flex-col rounded-2xl border border-harbor-700 bg-harbor-800 p-4 text-left transition-colors hover:border-lamp/60 disabled:opacity-60"
                  data-testid={`fire-${s.id}`}
                >
                  <span className="flex items-center gap-2">
                    {s.kind === "call" ? <PhoneIncoming size={15} className="text-ink-3" /> : <MessageSquareText size={15} className="text-ink-3" />}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.title}</span>
                    {i < 9 && <kbd className="rounded border border-harbor-600 px-1.5 font-mono text-[11px] text-ink-3">{i + 1}</kbd>}
                  </span>
                  <span className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{s.summary}</span>
                  <span className="mt-3 flex items-center gap-2">
                    <VerdictPill label={s.expected.label} size="sm" />
                    {s.tags.map((t) => (
                      <span key={t} className="text-[11px] font-medium text-ink-3">
                        #{t}
                      </span>
                    ))}
                    <span className="flex-1" />
                    <span className="text-[13px] font-bold text-lamp opacity-80 group-hover:opacity-100">
                      {busy === `fire:${s.id}` ? "Starting…" : "Run demo →"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-3 mt-7 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-ink-2">Reply as the trusted contact</h3>
          {backend.autoReply && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={autoReply}
                onChange={(e) => {
                  backend.autoReply?.set(e.target.checked);
                  setAutoReply(e.target.checked);
                }}
                className="size-4 accent-[var(--color-lamp)]"
              />
              Contacts reply on their own
            </label>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-harbor-600 px-4 py-4 text-sm text-ink-3">
            No one is being asked right now. Run the "Mom" scenario and Magenta-Guard's question will show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((req) => (
              <PendingCard key={req.id} request={req} busy={busy === `reply:${req.id}`} onReply={(text) => run(`reply:${req.id}`, () => backend.reply(req.id, text))} />
            ))}
          </ul>
        )}

        <h3 className="mb-3 mt-7 text-[13px] font-bold text-ink-2">Display</h3>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} className="size-4 accent-[var(--color-lamp)]" />
          Simple mode (plain-language verdicts)
        </label>
        {standalone && backend.mode === "mock" && (
          <p className="mt-6 text-[13px] text-ink-3">
            Demo mode runs inside one tab. To drive the phone from here, use the live server, or press D in the phone tab.
          </p>
        )}
      </div>
    </div>
  );
}

function orderScenarios(scenarios: ScenarioSummary[]): ScenarioSummary[] {
  const mobileThreat = (scenario: ScenarioSummary) => /carrier|sim[ -]?swap|mobile|wireless|port[ -]?out|verification code|one-time code|2fa|otp/i.test(`${scenario.id} ${scenario.title} ${scenario.tags.join(" ")}`);
  return scenarios.map((scenario, index) => ({ scenario, index, priority: mobileThreat(scenario) ? 0 : 1 })).sort((a, b) => a.priority - b.priority || a.index - b.index).map(({ scenario }) => scenario);
}

function PendingCard({ request, busy, onReply }: { request: VerificationRequest; busy: boolean; onReply: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <li className="rounded-2xl border border-lamp/30 bg-harbor-800 p-4" data-testid="pending-verification">
      <p className="text-[13px] text-ink-3">
        To {request.contactName} on {CHANNEL_TEXT[request.channel]} ({formatHandle(request.to)})
      </p>
      <p className="mt-1.5 text-[15px] leading-snug">{request.question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_REPLIES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => onReply(r)}
            className="rounded-full bg-harbor-700 px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-harbor-600 disabled:opacity-50"
          >
            {r}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onReply(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply as ${request.contactName}…`}
          className="min-w-0 flex-1 rounded-xl border border-harbor-600 bg-harbor-900 px-3 py-2 text-[15px] text-ink placeholder:text-ink-3"
        />
        <button type="submit" disabled={busy || !text.trim()} className="grid size-10 place-items-center rounded-xl bg-lamp text-harbor-900 disabled:opacity-40" aria-label="Send reply">
          <Send size={16} />
        </button>
      </form>
    </li>
  );
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function ModePill({ mode, status }: { mode: "live" | "mock"; status: string }) {
  const [text, color] =
    mode === "mock"
      ? ["Demo mode · offline", "var(--color-lamp)"]
      : status === "live"
        ? ["Live · server connected", "var(--color-safe)"]
        : status === "down"
          ? ["Server unreachable", "var(--color-warn)"]
          : ["Connecting…", "var(--color-ink-3)"];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-harbor-800 px-2.5 py-1 text-[12px] font-semibold" style={{ color }} data-testid="mode-pill">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}
