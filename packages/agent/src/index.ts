/**
 * @beacon/agent — the brain. Public API is `createAgent(deps, config?)`.
 *
 * WALKING SKELETON: this file is a deliberately small, working pipeline so the
 * server, phone UI and eval harness can integrate on day one. SWE 1 replaces the
 * internals (see packages/agent/AGENTS.md) — keep the exported signature.
 */
import {
  DEFAULT_AGENT_CONFIG,
  confidenceFor,
  labelFor,
  logistic,
  type Agent,
  type AgentConfig,
  type AgentDeps,
  type IncomingEvent,
  type ScamType,
  type Signal,
  type TrustedContact,
  type Verdict,
  type VerificationOutcome,
  type VerificationRequest,
  type VerificationResult,
} from "@beacon/shared";

const PRIOR_LOG_ODDS = -1.5; // base rate: most messages are not scams

interface Rule {
  id: string;
  title: string;
  detail: string;
  weight: number;
  pattern: RegExp;
  scamType?: ScamType;
}

// A handful of starter rules. SWE 1: move these to triage/ and grow them.
const RULES: Rule[] = [
  { id: "gift_card_payment", title: "Asks for gift cards", detail: "Real people and companies don't ask to be paid in gift cards.", weight: 2.5, pattern: /gift ?cards?|itunes|google play card|steam card/i },
  { id: "urgency", title: "Pressure to act now", detail: "Scammers rush you so you don't stop to check.", weight: 1.0, pattern: /\b(urgent|immediately|right now|asap|within \d+ (hours?|minutes?)|final notice|today only)\b/i },
  { id: "secrecy", title: "Asks you to keep it secret", detail: "\"Don't tell anyone\" is a classic way to stop you from verifying.", weight: 1.5, pattern: /don'?t tell|keep (this|it) (between us|secret)|don'?t call/i, scamType: "family_emergency" },
  { id: "new_number_claim", title: "Claims a new number", detail: "\"New phone, new number\" lets an impostor skip caller ID.", weight: 1.2, pattern: /new (phone|number)|lost my phone|broke my phone/i, scamType: "family_emergency" },
  { id: "otp_request", title: "Asks for a one-time code", detail: "Nobody legitimate needs you to read them a verification code.", weight: 2.5, pattern: /\b(code|otp|passcode|verification code)\b.*\b(send|read|tell|share|give)\b|\b(send|read|tell|share|give)\b.*\b(code|otp)\b/i, scamType: "account_takeover_otp" },
  { id: "unpaid_toll", title: "Unpaid toll / fee", detail: "Toll and package-fee texts are among the most common smishing lures.", weight: 1.8, pattern: /unpaid toll|toll (balance|violation)|redelivery fee|package (is )?(on hold|held)/i, scamType: "toll_smishing" },
  { id: "link_present", title: "Contains a link", detail: "Links in unexpected texts often lead to credential-stealing pages.", weight: 0.6, pattern: /https?:\/\/|\b[a-z0-9-]+\.(top|xyz|info|click|live|icu|cc)\b/i },
  { id: "wire_crypto", title: "Wire, crypto or payment app", detail: "Irreversible payments are a scammer's favorite.", weight: 1.5, pattern: /\b(wire transfer|bitcoin|btc|crypto|usdt|zelle|cash ?app|venmo)\b/i },
  { id: "bail_jail", title: "Emergency involving police or hospital", detail: "Fake emergencies create panic so you pay first and think later.", weight: 1.3, pattern: /\b(bail|jail|arrested|hospital|accident|lawyer)\b/i, scamType: "family_emergency" },
  { id: "prompt_injection", title: "Tries to manipulate the AI", detail: "The message contains instructions aimed at an AI assistant — a strong sign of a crafted attack.", weight: 2.0, pattern: /ignore (all |any )?(previous|prior) instructions|you are (now )?an? (ai|assistant)|mark (this|as) (safe|legit)/i },
];

function findClaimedContact(event: IncomingEvent, contacts: TrustedContact[]): TrustedContact | undefined {
  const text = `${event.from.displayName ?? ""} ${event.body}`.toLowerCase();
  return contacts.find((c) =>
    [c.name, ...c.aliases].some((alias) => new RegExp(`\\b${alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)),
  );
}

/** Skeleton reply interpreter (rules only). SWE 1: add a fast-model fallback for ambiguous replies. */
export function interpretReply(request: VerificationRequest, result: VerificationResult, at: Date): VerificationOutcome {
  const base = { requestId: request.id, resolvedAt: at.toISOString() };
  if (result.status !== "replied") {
    return { ...base, status: result.status, summary: `${request.contactName} didn't answer${result.status === "unreachable" ? " (couldn't reach them)" : " in time"}.` };
  }
  const text = result.reply.text;
  const denied = /\b(no|nope|not me|wasn'?t me|didn'?t|never|scam)\b/i.test(text);
  const confirmed = /\b(yes|yeah|yep|that was me|it'?s me|it was me)\b/i.test(text);
  const status = denied && !confirmed ? "denied" : confirmed && !denied ? "confirmed" : "unclear";
  return { ...base, status, replyText: text, summary: `${request.contactName} replied: "${text}"` };
}

function verificationWeight(outcome: VerificationOutcome | undefined): number {
  switch (outcome?.status) {
    case "denied":
      return 4.0;
    case "confirmed":
      return -5.0;
    case "timeout":
    case "unclear":
      return 0.3;
    default:
      return 0;
  }
}

export function createAgent(deps: AgentDeps, overrides: Partial<AgentConfig> = {}): Agent {
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...overrides };
  const now = deps.now ?? (() => new Date());

  async function run(event: IncomingEvent): Promise<Verdict> {
    const started = now().getTime();
    const emit = (body: Parameters<AgentDeps["emit"]>[1]) => deps.emit(event.id, body);
    const stagesRun: string[] = [];
    const text = [event.body, ...(event.transcript ?? []).map((s) => s.text)].join("\n");
    const contacts = deps.contacts();

    // ingest
    stagesRun.push("ingest");
    emit({ type: "stage", stage: "ingest", status: "completed" });

    // triage (local heuristics — never leaves the device)
    stagesRun.push("triage");
    emit({ type: "stage", stage: "triage", status: "started" });
    const signals: Signal[] = [];
    let scamType: ScamType = "none";
    for (const rule of RULES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      const signal: Signal = { id: rule.id, title: rule.title, detail: rule.detail, weight: rule.weight, source: "heuristic", evidence: match[0] };
      signals.push(signal);
      emit({ type: "signal", signal });
      if (rule.scamType && scamType === "none") scamType = rule.scamType;
    }
    const knownSender = contacts.some((c) => c.handles.includes(event.from.handle));
    if (!knownSender) {
      const signal: Signal = { id: "unknown_sender", title: "Sender isn't in your contacts", detail: "This number isn't one your trusted contacts use.", weight: 0.4, source: "heuristic" };
      signals.push(signal);
      emit({ type: "signal", signal });
    }
    let logOdds = PRIOR_LOG_ODDS + signals.reduce((s, x) => s + x.weight, 0);
    emit({ type: "score", pScam: logistic(logOdds) });
    emit({ type: "stage", stage: "triage", status: "completed" });

    // analyze — mock skeleton does not call an LLM yet
    emit({ type: "stage", stage: "analyze", status: "skipped", note: "skeleton: no LLM wired yet" });

    // challenge + verify (out-of-band, to the REAL contact — never to the sender)
    let outcome: VerificationOutcome | undefined;
    const claimed = findClaimedContact(event, contacts);
    if (claimed && !claimed.handles.includes(event.from.handle) && logistic(logOdds) >= 0.3) {
      stagesRun.push("challenge", "verify");
      const claim = `Message from ${event.from.handle} claims to be ${claimed.name}.`;
      emit({ type: "thought", text: `This claims to be ${claimed.name}, but from a number ${claimed.name} doesn't use. Asking the real ${claimed.name}.` });
      const request: VerificationRequest = {
        id: `ver_${event.id}`,
        eventId: event.id,
        contactId: claimed.id,
        contactName: claimed.name,
        channel: claimed.verifyVia.channel,
        to: claimed.verifyVia.handle,
        question: `Hi ${claimed.name}, this is Beacon. Someone just messaged your family member claiming to be you, from a number we don't recognize. Was that you? Reply YES or NO.`,
        claim,
        sentAt: now().toISOString(),
        timeoutMs: config.verifyTimeoutMs,
      };
      emit({ type: "verification.requested", request });
      outcome = interpretReply(request, await deps.verify(request), now());
      emit({ type: "verification.resolved", outcome });
      const w = verificationWeight(outcome);
      if (w !== 0) {
        const signal: Signal = { id: `verification_${outcome.status}`, title: outcome.status === "denied" ? `${claimed.name} says it wasn't them` : outcome.status === "confirmed" ? `${claimed.name} confirmed it` : `${claimed.name} didn't answer`, detail: outcome.summary, weight: w, source: "verification" };
        signals.push(signal);
        emit({ type: "signal", signal });
        logOdds += w;
      }
      if (scamType === "none" && outcome.status === "denied") scamType = "family_emergency";
    }

    // verdict
    stagesRun.push("verdict", "recover");
    const pScam = logistic(logOdds);
    const label = labelFor(pScam);
    if (label === "safe") scamType = "none";
    else if (scamType === "none") scamType = "other";
    const spread = outcome?.status === "denied" || outcome?.status === "confirmed" ? 0.03 : 0.12;
    const verdict: Verdict = {
      eventId: event.id,
      label,
      pScam,
      confidence: confidenceFor(label, pScam),
      band: [Math.max(0, pScam - spread), Math.min(1, pScam + spread)],
      scamType,
      headline: label === "scam" ? "This is almost certainly a scam." : label === "suspicious" ? "Be careful — this looks suspicious." : "This looks safe.",
      signals: [...signals].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
      verification: outcome && claimed ? { status: outcome.status, contactName: claimed.name, summary: outcome.summary } : undefined,
      recovery:
        label === "safe"
          ? []
          : [
              { id: "dont_reply", title: "Don't reply or tap any links", detail: "Replying confirms your number is active.", urgency: "now", action: { kind: "block", label: "Block sender" } },
              { id: "report_7726", title: "Report it to your carrier", detail: "Forward the text to 7726 (SPAM) — free on major US carriers.", urgency: "soon", action: { kind: "sms", label: "Forward to 7726", target: "7726" } },
            ],
      privacy: { sentToCloud: false, redactions: {}, notes: ["Skeleton: everything ran locally."] },
      stagesRun,
      latencyMs: now().getTime() - started,
      decidedAt: now().toISOString(),
    };
    emit({ type: "verdict", verdict });
    return verdict;
  }

  return { config, run };
}
