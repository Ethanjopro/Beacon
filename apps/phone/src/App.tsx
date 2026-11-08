import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { DemoConsole, isTyping } from "./components/DemoConsole";
import { PhoneFrame } from "./components/PhoneFrame";
import { StoryRail } from "./components/StoryRail";
import { TracePanel } from "./components/TracePanel";
import { isArchitectureRoute, isConsoleRoute } from "./lib/mode";
import { ArchitecturePage } from "./screens/ArchitecturePage";
import { useViewport } from "./lib/useViewport";
import { PhoneApp } from "./PhoneApp";
import { latestEvent } from "./state/reducer";
import { useBeacon } from "./state/store";
import { LandingPage } from "./screens/LandingPage";

/** Layout shell: stage (phone + judges' panels) or the standalone console route. */
export function App() {
  const [demoRoute, setDemoRoute] = useState(() => location.hash === "#/demo");
  const [consoleRoute, setConsoleRoute] = useState(() => isConsoleRoute());
  const [archRoute, setArchRoute] = useState(() => isArchitectureRoute());
  useEffect(() => {
    const onHash = () => {
      setDemoRoute(location.hash === "#/demo");
      setConsoleRoute(isConsoleRoute());
      setArchRoute(isArchitectureRoute());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (consoleRoute) {
    return (
      <div className="mx-auto h-dvh max-w-3xl">
        <DemoConsole standalone />
      </div>
    );
  }
  if (archRoute) return <ArchitecturePage />;
  if (demoRoute) return <Stage />;
  return <LandingPage />;
}

function Stage() {
  const { state, backend, status } = useBeacon();
  const { width, height, compact } = useViewport();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [focusId, setFocusId] = useState<string>();
  const onFocusChange = useCallback((id: string | undefined) => setFocusId(id), []);

  // `d` toggles the demo console; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "d" || e.key === "D") setConsoleOpen((o) => !o);
      if (e.key === "Escape") setConsoleOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focused = (focusId ? state.byId[focusId] : undefined) ?? latestEvent(state);
  const showRail = width >= 1280;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-harbor-950">
      {!compact && <Backdrop />}
      {compact ? (
        <PhoneFrame compact maxHeight={height}>
          <PhoneApp compact onFocusChange={onFocusChange} />
        </PhoneFrame>
      ) : (
        <div className="relative mx-auto flex h-full max-w-[1500px] items-center justify-center gap-10 px-8 py-6">
          {showRail && <StoryRail view={focused} mode={backend.mode} status={status} />}
          <PhoneFrame compact={false} maxHeight={height - 48}>
            <PhoneApp compact={false} onFocusChange={onFocusChange} />
          </PhoneFrame>
          <div className="h-full min-w-[380px] max-w-[500px] flex-1">
            <TracePanel view={focused} onOpenConsole={() => setConsoleOpen(true)} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {consoleOpen && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setConsoleOpen(false)}
          >
            <motion.div
              initial={{ y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.98 }}
              className="h-full w-full overflow-hidden bg-harbor-900 sm:h-auto sm:max-h-[86vh] sm:max-w-3xl sm:rounded-[28px] sm:border sm:border-harbor-700"
            >
              <DemoConsole onClose={() => setConsoleOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A faint lamp glow from behind the phone — the only decoration on the page. */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 50% 60% at 50% 35%, rgba(217,154,199,0.10), transparent 70%), radial-gradient(ellipse 80% 60% at 50% 110%, rgba(113,65,99,0.25), transparent 70%)",
      }}
    />
  );
}


