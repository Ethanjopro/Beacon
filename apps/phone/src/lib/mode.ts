/** Runtime mode flags read from the URL. Kept tiny so tests can import freely. */

/** `?mock=1` replays canned traces in the browser — no server, no network. */
export function isMockMode(search: string = globalThis.location?.search ?? ""): boolean {
  const value = new URLSearchParams(search).get("mock");
  return value !== null && value !== "0" && value !== "false";
}

/** `#/architecture` renders the live architecture page (for judges). */
export function isArchitectureRoute(hash = globalThis.location?.hash ?? ""): boolean {
  return hash.replace(/^#/, "").startsWith("/architecture");
}

/** `#/console` renders only the demo console (for a second window on stage). */
export function isConsoleRoute(hash: string = globalThis.location?.hash ?? ""): boolean {
  return hash.replace(/^#/, "").startsWith("/console");
}
