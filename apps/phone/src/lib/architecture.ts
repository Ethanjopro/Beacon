import type { EventView } from "../state/reducer";

/**
 * The Magenta-Guard architecture as five boxes, and which box a live call is
 * in right now. The story rail, the trace panel and the Architecture page all
 * light up from this one mapping, so they never disagree.
 */

export interface ArchBox {
  id: "ingest" | "bus" | "orchestrator" | "challenge" | "handset";
  title: string;
  subtitle: string;
  /** What runs here, in the repo. */
  code: string;
  real: "real" | "simulated" | "mixed";
  realNote: string;
}

export const ARCH: ArchBox[] = [
  {
    id: "ingest",
    title: "Carrier SIP ingest",
    subtitle: "Simulated via Photon",
    code: "Photon webhook (HMAC-signed) + sim injection → one normalizer",
    real: "mixed",
    realNote: "Carrier network simulated; webhook listener and normalizer are real code",
  },
  {
    id: "bus",
    title: "Event bus",
    subtitle: "Every step, streamed live",
    code: "Trace bus → Server-Sent Events (/api/stream)",
    real: "real",
    realNote: "Real",
  },
  {
    id: "orchestrator",
    title: "Nemotron orchestrator",
    subtitle: "Answers first, interviews, decides",
    code: "NVIDIA Nemotron tool-calling loop: lookup, risk scan, code word, callback",
    real: "real",
    realNote: "Real Nemotron calls; no scripted replies or verdicts",
  },
  {
    id: "challenge",
    title: "Out-of-band challenge",
    subtitle: "Code word + callback",
    code: "Code word compared on the server · callback to the saved number via Photon",
    real: "real",
    realNote: "Real registry (SQLite, synthetic data) and a real outbound call",
  },
  {
    id: "handset",
    title: "Subscriber handset",
    subtitle: "Verdict, then bridge or block",
    code: "This phone: live screening, verdict card, recap",
    real: "simulated",
    realNote: "Simulated handset (this web app)",
  },
];

/** Index into ARCH of where a call is right now, or -1 when there's no call. */
export function callPhase(view?: EventView): number {
  if (!view?.event) return -1;
  if (view.screening) return 4;
  switch (view.callStatus?.status) {
    case "challenging":
    case "verifying":
      return 3;
    case "screening":
    case "deciding":
      return 2;
    case "bridged":
    case "blocked":
    case "voicemail":
      return 4;
    default:
      return view.trace.length > 1 ? 1 : 0;
  }
}
