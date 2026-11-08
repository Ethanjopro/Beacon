import type { VerdictLabel } from "@beacon/shared";
import { isVerificationPending, type EventView } from "../state/reducer";
import { CHANNEL_TEXT, LABEL_TEXT, formatPct } from "./format";

/**
 * What the Beacon banner says right now, in plain words.
 * Order matters: verdict > waiting on a person > current stage.
 */
export interface BannerState {
  tone: "working" | "waiting" | VerdictLabel | "error";
  title: string;
  detail?: string;
}

export function bannerState(view: EventView, simple = false): BannerState {
  const v = view.verdict;
  if (v) {
    const contact = v.verification?.contactName;
    const reply = view.verification?.outcome?.replyText;
    if (simple) {
      const title = v.label === "scam" ? "This is a scam" : v.label === "suspicious" ? "Be careful" : "Looks fine";
      return { tone: v.label, title, detail: "Tap to see what to do" };
    }
    return {
      tone: v.label,
      title: `${LABEL_TEXT[v.label]} · ${formatPct(v.pScam)}`,
      // Quote the real person when we have their words — it's the most convincing evidence.
      detail: contact && reply ? `${contact}: “${reply}”` : v.headline,
    };
  }

  const request = view.verification?.request;
  if (request && isVerificationPending(view)) {
    return {
      tone: "waiting",
      title: `Asking the real ${request.contactName}…`,
      detail: `Sent on ${CHANNEL_TEXT[request.channel]} to their saved number`,
    };
  }

  if (view.errors.length > 0 && !view.activeStage) {
    return { tone: "error", title: "Magenta-Guard hit a problem", detail: "Treat this message with care until it's checked." };
  }

  switch (view.activeStage) {
    case "analyze":
      return { tone: "working", title: "Taking a closer look…", detail: "Nemotron, with your personal details removed" };
    case "challenge":
      return { tone: "working", title: "Finding what it claims…", detail: "Who is this really from?" };
    case "verify":
      return { tone: "working", title: "Checking with the real person…" };
    case "verdict":
    case "recover":
      return { tone: "working", title: "Weighing the evidence…" };
    case "triage":
    case "ingest":
    default:
      return { tone: "working", title: "Checking on your phone…", detail: "Nothing has left this phone" };
  }
}
