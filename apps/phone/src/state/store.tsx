import type { PublicContact, TraceEvent } from "@beacon/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Backend } from "../backend/types";
import { Pacer } from "../lib/pacer";
import type { ConnectionStatus } from "../lib/stream";
import { initialPhoneState, phoneReducer, type PhoneState } from "./reducer";

/**
 * App-wide store: wires a Backend (live or mock) into the reducer through
 * the Pacer, so the trace tells its story at a readable pace.
 */

export interface Arrival {
  eventId: string;
  /** Increments on every new live arrival so effects re-run even for the same id. */
  n: number;
}

interface BeaconStore {
  backend: Backend;
  state: PhoneState;
  status: ConnectionStatus;
  contacts: PublicContact[];
  /** Latest event that arrived live (not replayed) — drives auto-navigation. */
  arrival?: Arrival;
  /** Latest verdict that arrived live — drives the auto-opened verdict sheet. */
  verdictArrival?: Arrival;
  simpleMode: boolean;
  setSimpleMode: (on: boolean) => void;
  resetDemo: () => Promise<void>;
}

const Ctx = createContext<BeaconStore | null>(null);

const SIMPLE_KEY = "beacon.simpleMode";

function readSimpleMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(SIMPLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function BeaconProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [state, dispatch] = useReducer(phoneReducer, initialPhoneState);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [contacts, setContacts] = useState<PublicContact[]>([]);
  const [arrival, setArrival] = useState<Arrival>();
  const [verdictArrival, setVerdictArrival] = useState<Arrival>();
  const [simpleMode, setSimple] = useState(readSimpleMode);
  const counter = useRef(0);

  const pacer = useMemo(
    () =>
      new Pacer<{ ev: TraceEvent; replay: boolean }>(({ ev, replay }) => {
        dispatch({ type: "trace", event: ev });
        if (replay) return;
        if (ev.type === "event.received") setArrival({ eventId: ev.eventId, n: ++counter.current });
        if (ev.type === "verdict") setVerdictArrival({ eventId: ev.eventId, n: ++counter.current });
      }),
    [],
  );

  useEffect(() => {
    const disconnect = backend.connect({
      onTrace: (ev, meta) => pacer.push({ ev, replay: meta.replay }, { immediate: meta.replay }),
      onStatus: setStatus,
      onReset: () => {
        pacer.clear();
        dispatch({ type: "reset" });
        setArrival(undefined);
        setVerdictArrival(undefined);
      },
    });
    return () => {
      disconnect();
      pacer.clear();
    };
  }, [backend, pacer]);

  // Contacts let the phone show "Mom" instead of a number. Retry once the server is up.
  useEffect(() => {
    if (status !== "live" || contacts.length > 0) return;
    backend.contacts().then(setContacts, () => {});
  }, [backend, status, contacts.length]);

  const setSimpleMode = useCallback((on: boolean) => {
    setSimple(on);
    try {
      globalThis.localStorage?.setItem(SIMPLE_KEY, on ? "1" : "0");
    } catch {
      /* private mode — fine, it just won't persist */
    }
  }, []);

  const resetDemo = useCallback(() => backend.reset(), [backend]);

  const value = useMemo<BeaconStore>(
    () => ({ backend, state, status, contacts, arrival, verdictArrival, simpleMode, setSimpleMode, resetDemo }),
    [backend, state, status, contacts, arrival, verdictArrival, simpleMode, setSimpleMode, resetDemo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBeacon(): BeaconStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useBeacon must be used inside <BeaconProvider>");
  return store;
}
