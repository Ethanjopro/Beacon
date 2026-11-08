/**
 * Cross-window "demo reset" notice (console in one window, phone in another).
 * BroadcastChannel is same-origin and local only — nothing leaves the laptop.
 */
const CHANNEL = "beacon-demo";

export function broadcastDemoReset(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage({ type: "reset" });
  ch.close();
}

export function onDemoReset(fn: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (msg: MessageEvent) => {
    if ((msg.data as { type?: string } | null)?.type === "reset") fn();
  };
  return () => ch.close();
}
