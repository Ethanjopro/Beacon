import { Check, Phone, PhoneOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isScreenedCall, threadKeyOf, type EventView } from "./state/reducer";
import { useBeacon } from "./state/store";
import { CallScreen } from "./screens/CallScreen";
import { ScreeningScreen } from "./screens/ScreeningScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { RecoveryScreen } from "./screens/RecoveryScreen";
import { ThreadScreen } from "./screens/ThreadScreen";
import { VerdictSheet } from "./screens/VerdictSheet";

/**
 * The phone itself: screen navigation, auto-navigation when something
 * arrives (texts open their thread, calls ring), the verdict sheet and toasts.
 */

type Screen =
  | { name: "home" }
  | { name: "thread"; threadKey: string }
  | { name: "call"; eventId: string }
  | { name: "recovery"; eventId: string; threadKey?: string };

const SHEET_DELAY_MS = 900;

export function PhoneApp({ compact, activeCallId, onFocusChange, onBackToHome }: { compact: boolean; activeCallId?: string; onFocusChange?: (eventId: string | undefined) => void; onBackToHome?: () => void }) {
  const { state, arrival, verdictArrival, simpleMode } = useBeacon();
  const [screen, setScreen] = useState<Screen>(activeCallId ? { name: "call", eventId: activeCallId } : { name: "home" });
  const [sheetId, setSheetId] = useState<string>();
  const [toast, setToast] = useState<{ text: string; n: number }>();
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => {
    if (activeCallId) setScreen({ name: "call", eventId: activeCallId });
  }, [activeCallId]);

  const showToast = useCallback((text: string) => setToast({ text, n: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Something new arrived: open its thread, or ring for a call.
  useEffect(() => {
    if (!arrival) return;
    const ev = state.byId[arrival.eventId]?.event;
    if (!ev) return;
    setSheetId(undefined);
    setScreen(ev.kind === "call" ? { name: "call", eventId: ev.id } : { name: "thread", threadKey: threadKeyOf(ev) });
    // Deliberately keyed on `arrival` only: re-running on every state change would fight the user.
  }, [arrival]);

  // A verdict landed: buzz for scams, and open the sheet for anything not safe.
  useEffect(() => {
    if (!verdictArrival) return;
    const view = state.byId[verdictArrival.eventId];
    const verdict = view?.verdict;
    if (!view?.event || !verdict) return;
    if (verdict.label === "scam") vibrate([180, 80, 180]);
    const current = screenRef.current;
    const showing = current.name === "thread" && current.threadKey === threadKeyOf(view.event);
    if (!showing || verdict.label === "safe") return;
    const t = setTimeout(() => setSheetId(view.eventId), SHEET_DELAY_MS);
    return () => clearTimeout(t);
    // Keyed on `verdictArrival` only (see above).
  }, [verdictArrival]);

  // Demo reset: back to the inbox.
  useEffect(() => {
    if (state.order.length === 0) {
      setScreen({ name: "home" });
      setSheetId(undefined);
    }
  }, [state.order.length]);

  // Tell the judges' panel which event the phone is showing.
  const focusId = focusedEventId(screen, state);
  useEffect(() => onFocusChange?.(focusId), [focusId, onFocusChange]);

  const sheetView = sheetId ? state.byId[sheetId] : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={screenKey(screen)}
          className="absolute inset-0"
          initial={{ opacity: 0, x: screen.name === "home" ? -24 : 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {screen.name === "home" && <HomeScreen onOpen={(c) => setScreen({ name: "thread", threadKey: c.key })} />}
          {screen.name === "thread" && (
            <ThreadScreen threadKey={screen.threadKey} onBack={() => setScreen({ name: "home" })} onOpenVerdict={setSheetId} />
          )}
          {screen.name === "call" && state.byId[screen.eventId] && isScreened(state.byId[screen.eventId]!) && (
            <ScreeningScreen view={state.byId[screen.eventId]!} onDone={() => { if (onBackToHome) onBackToHome(); else setScreen({ name: "home" }); }} />
          )}
          {screen.name === "call" && !state.byId[screen.eventId] && (
            <div className="flex h-full flex-col items-center justify-between px-6 pb-12 pt-14 text-center bg-harbor-900 text-ink">
              <div className="flex flex-col items-center">
                <span className="rounded-full bg-harbor-800 px-3.5 py-1 text-[12px] font-semibold text-lamp animate-pulse">
                  Connecting to Magenta-Guard…
                </span>
                <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-ink">Active Call</h1>
                <p className="mt-1 text-[13px] text-ink-2">AI Call Screener answering first…</p>
              </div>
              <div className="relative size-20 grid place-items-center">
                <span className="absolute inset-0 rounded-full bg-lamp/20 animate-ping" />
                <span className="size-16 rounded-full bg-harbor-800 border border-lamp/40 grid place-items-center">
                  <Phone className="size-7 text-lamp" />
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (screen.eventId) fetch(`/api/calls/${encodeURIComponent(screen.eventId)}/end`, { method: "POST" }).catch(() => {});
                    if (onBackToHome) onBackToHome();
                    else setScreen({ name: "home" });
                  }}
                  className="grid size-14 place-items-center rounded-full bg-scam text-white shadow-[0_8px_30px_-6px_rgba(255,90,82,0.8)]"
                  aria-label="End call"
                >
                  <PhoneOff size={24} />
                </button>
                <p className="text-[12px] text-ink-3">End call</p>
              </div>
            </div>
          )}
          {screen.name === "call" && state.byId[screen.eventId] && !isScreened(state.byId[screen.eventId]!) && (
            <CallScreen
              view={state.byId[screen.eventId]!}
              onHangUp={() => {
                const view = state.byId[screen.eventId];
                setScreen(view?.event ? { name: "thread", threadKey: threadKeyOf(view.event) } : { name: "home" });
                if (view?.verdict) setSheetId(view.eventId);
              }}
            />
          )}
          {screen.name === "recovery" && state.byId[screen.eventId] && (
            <RecoveryScreen
              view={state.byId[screen.eventId]!}
              simulateActions={!compact}
              onToast={showToast}
              onBack={() => {
                setScreen(screen.threadKey ? { name: "thread", threadKey: screen.threadKey } : { name: "home" });
                setSheetId(screen.eventId);
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {sheetView?.verdict && (
          <VerdictSheet
            key={sheetView.eventId}
            view={sheetView}
            simple={simpleMode}
            onClose={() => setSheetId(undefined)}
            onBlock={() => {
              setSheetId(undefined);
              showToast("Sender blocked");
            }}
            onRecover={() => {
              setSheetId(undefined);
              setScreen({
                name: "recovery",
                eventId: sheetView.eventId,
                threadKey: sheetView.event ? threadKeyOf(sheetView.event) : undefined,
              });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.n}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute inset-x-0 top-2 z-50 flex justify-center px-6"
            role="status"
          >
            <span className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[15px] font-semibold text-harbor-900 shadow-lg">
              <Check size={17} strokeWidth={3} className="text-safe" /> {toast.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function screenKey(s: Screen): string {
  switch (s.name) {
    case "home":
      return "home";
    case "thread":
      return `thread:${s.threadKey}`;
    case "call":
      return `call:${s.eventId}`;
    case "recovery":
      return `recovery:${s.eventId}`;
  }
}

function focusedEventId(screen: Screen, state: ReturnType<typeof useBeacon>["state"]): string | undefined {
  if (screen.name === "call" || screen.name === "recovery") return screen.eventId;
  if (screen.name === "thread") {
    return state.order.find((id) => {
      const ev = state.byId[id]?.event;
      return ev && threadKeyOf(ev) === screen.threadKey;
    });
  }
  return undefined;
}

/** Live calls are answered by the Magenta-Guard screener; only the offline mock replays a pre-baked transcript. */
function isScreened(view: EventView): boolean {
  return isScreenedCall(view) || !view.event?.transcript?.length;
}

function vibrate(pattern: number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* unsupported — fine */
  }
}
