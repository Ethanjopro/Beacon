/** Runtime mode flags read from the URL. Kept tiny so tests can import freely. */

/**
 * `?mock=1` replays canned traces in the browser — no server, no network.
 * A build made with VITE_FORCE_MOCK=1 is always in mock mode (a shareable,
 * server-free demo page, e.g. for testing on a phone anywhere).
 */
export function isMockMode(search: string = globalThis.location?.search ?? ""): boolean {
  if (import.meta.env?.VITE_FORCE_MOCK === "1") return true;
  const value = new URLSearchParams(search).get("mock");
  return value !== null && value !== "0" && value !== "false";
}

/** `#/console` renders only the demo console (for a second window on stage). */
export function isConsoleRoute(hash: string = globalThis.location?.hash ?? ""): boolean {
  return hash.replace(/^#/, "").startsWith("/console");
}
