import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LiveBackend } from "./backend/live";
import { MockBackend } from "./backend/mock";
import { isMockMode } from "./lib/mode";
import { BeaconProvider } from "./state/store";
import "./styles.css";

// `?mock=1` → everything runs in the browser with canned traces (no server, no network).
const backend = isMockMode() ? new MockBackend() : new LiveBackend();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BeaconProvider backend={backend}>
      <App />
    </BeaconProvider>
  </StrictMode>,
);
