/**
 * Stage 7 — recover. A checklist matched to the scam type and to what the user
 * already did. Only trusted resources: 7726, the number on the back of the
 * card, FTC / IC3 / identitytheft.gov, credit bureaus, and contacts' SAVED
 * handles from the registry. Never a number or link from the message.
 */
import type { IncomingEvent, RecoveryStep, ScamType, TrustedContact, VerdictLabel } from "@beacon/shared";
import { shortName } from "../privacy/redact.js";
import { isOrg } from "../tools/contacts.js";

type StepId = keyof typeof STEPS;

/** The step library. Targets here are the ONLY numbers/links recovery may use (besides registry handles). */
const STEPS = {
  dont_engage: { title: "Don't reply, call back or tap any links", detail: "Replying tells scammers your number is live. Links and callback numbers in the message go to them, not the real company.", urgency: "now", action: { kind: "block", label: "Block sender" } },
  report_7726: { title: "Report it to your carrier", detail: "Forward the text to 7726 (SPAM). It's free on major US carriers and helps block the sender for everyone.", urgency: "soon", action: { kind: "sms", label: "Forward to 7726", target: "7726" } },
  report_ftc: { title: "Report it to the FTC", detail: "Reports help law enforcement spot and shut down scams.", urgency: "later", action: { kind: "link", label: "Open reportfraud.ftc.gov", target: "https://reportfraud.ftc.gov" } },
  report_ic3: { title: "Report it to the FBI's IC3", detail: "Online fraud involving money, crypto or impersonation can be reported to the FBI's Internet Crime Complaint Center.", urgency: "later", action: { kind: "link", label: "Open ic3.gov", target: "https://www.ic3.gov" } },
  dont_buy_gift_cards: { title: "Don't buy gift cards or send money", detail: "No real family member, company or agency needs payment in gift cards, crypto or wire transfers.", urgency: "now" },
  bank_back_of_card: { title: "Call your bank at the number on the back of your card", detail: "Use the number printed on your card or typed from the bank's real website — never one from the message.", urgency: "now", action: { kind: "none", label: "Use the number on your card" } },
  gov_no_calls: { title: "Real agencies don't demand payment by phone or text", detail: "The IRS and Social Security contact you by mail first and never ask for gift cards, crypto or wire transfers.", urgency: "soon" },
  track_official_site: { title: "Check deliveries in the carrier's own app", detail: "Type the shipping company's address yourself or use its official app — never the link in the text.", urgency: "soon" },
  toll_official_site: { title: "Check your toll account yourself", detail: "Log in through your toll agency's official website or app, typed by hand, to see if you owe anything.", urgency: "soon" },
  never_share_codes: { title: "Never read a sign-in code to anyone", detail: "One-time codes are keys to your accounts. No company will ever ask you to read one back.", urgency: "now" },
  carrier_port_lock: { title: "Lock your number against SIM swaps", detail: "Call your carrier at the number in its official app or on your bill and ask for a port-out / SIM-change lock and a new account PIN.", urgency: "soon" },
  no_remote_access: { title: "Don't install remote-access apps", detail: "Never let a caller \"fix\" your device. Real tech companies don't cold-call or text about viruses.", urgency: "now" },
  job_never_pay: { title: "Real jobs never make you pay to work", detail: "Don't send money, buy \"equipment\" or crypto, or share bank logins for a job you got by text.", urgency: "soon" },
  invest_no_more: { title: "Don't send more money to the platform", detail: "\"Fees to withdraw\" are part of the scam. Stop all transfers and talk to someone you trust.", urgency: "now" },
  romance_pause: { title: "Pause and talk to someone you trust", detail: "Someone you've never met in person asking for money is the defining sign of a romance scam.", urgency: "soon" },
  wrong_number_ignore: { title: "Don't continue the chat", detail: "Friendly \"wrong number\" texts often turn into investment pitches. It's OK to just not reply.", urgency: "soon" },
  prize_no_fees: { title: "Never pay to claim a prize", detail: "You can't win a contest you didn't enter, and real prizes don't charge fees.", urgency: "soon" },
  marketplace_platform: { title: "Keep payment inside the marketplace", detail: "Don't accept overpayments, checks or \"verification codes\" from buyers. Use the platform's own payment and messaging.", urgency: "soon" },
  verify_before_acting: { title: "Check before you act", detail: "Contact the person or company yourself using a number you already have — not one from this message.", urgency: "now" },
  // ── Exposure-specific ──────────────────────────────────────────────────────
  clicked_passwords: { title: "Change passwords and turn on 2-step verification", detail: "If you entered anything on the page, change that password now (from the real site or app) and enable two-factor authentication.", urgency: "now" },
  clicked_scan: { title: "Check your phone for unknown apps or profiles", detail: "Remove any app or configuration profile you don't recognize that appeared after tapping the link.", urgency: "soon" },
  replied_expect_more: { title: "Expect more scam messages", detail: "Replying confirms your number is active. Ignore follow-ups and block new numbers that contact you.", urgency: "soon", action: { kind: "block", label: "Block sender" } },
  code_secure_account: { title: "Secure the account that code was for", detail: "Sign in from the official app, change the password, sign out other sessions and turn on 2-step verification. Call the company using its official number if you're locked out.", urgency: "now" },
  money_call_bank: { title: "Call your bank or card issuer right now", detail: "Use the number on the back of your card. Ask them to stop or reverse the payment and flag your account. For gift cards, call the number on the card itself.", urgency: "now", action: { kind: "none", label: "Use the number on your card" } },
  money_report_ic3: { title: "Report the loss to the FBI's IC3 and the FTC", detail: "Official reports can help recover money and are needed for many bank disputes.", urgency: "soon", action: { kind: "link", label: "Open ic3.gov", target: "https://www.ic3.gov" } },
  info_identity_theft: { title: "Make an identity-theft recovery plan", detail: "identitytheft.gov gives you a step-by-step plan and pre-filled letters.", urgency: "now", action: { kind: "link", label: "Open identitytheft.gov", target: "https://www.identitytheft.gov" } },
  info_credit_freeze: { title: "Freeze your credit", detail: "A free freeze at Equifax, Experian and TransUnion stops anyone opening new accounts in your name.", urgency: "soon", action: { kind: "link", label: "How to freeze your credit", target: "https://consumer.ftc.gov/articles/what-know-about-credit-freezes-fraud-alerts" } },
} satisfies Record<string, Omit<RecoveryStep, "id">>;

/**
 * Per-type playbooks. Typed as Record<ScamType, …> so adding a ScamType in
 * packages/shared fails typecheck until it gets a playbook here.
 */
const PLAYBOOKS: Record<ScamType, StepId[]> = {
  family_emergency: ["dont_engage", "dont_buy_gift_cards", "report_7726", "report_ftc"],
  bank_impersonation: ["dont_engage", "bank_back_of_card", "report_7726", "report_ftc"],
  government_impersonation: ["dont_engage", "gov_no_calls", "report_7726", "report_ftc"],
  delivery_smishing: ["dont_engage", "track_official_site", "report_7726", "report_ftc"],
  toll_smishing: ["dont_engage", "toll_official_site", "report_7726", "report_ftc"],
  account_takeover_otp: ["never_share_codes", "dont_engage", "report_7726", "report_ftc"],
  carrier_impersonation: ["dont_engage", "carrier_port_lock", "never_share_codes", "report_7726"],
  tech_support: ["no_remote_access", "dont_engage", "report_ftc", "report_ic3"],
  job_offer: ["dont_engage", "job_never_pay", "report_7726", "report_ftc"],
  investment_crypto: ["invest_no_more", "dont_engage", "report_ic3", "report_ftc"],
  romance: ["romance_pause", "dont_buy_gift_cards", "report_ic3", "report_ftc"],
  wrong_number: ["wrong_number_ignore", "dont_engage", "report_7726"],
  prize_lottery: ["prize_no_fees", "dont_engage", "report_7726", "report_ftc"],
  marketplace: ["marketplace_platform", "dont_engage", "report_ftc"],
  other: ["dont_engage", "verify_before_acting", "report_7726", "report_ftc"],
  none: [],
};

type Exposure = NonNullable<IncomingEvent["exposure"]>;

/** Exposure steps come first: if money or a code already left, minutes matter. */
const EXPOSURE_STEPS: Record<keyof Required<Exposure>, StepId[]> = {
  sentMoney: ["money_call_bank", "money_report_ic3"],
  sharedCode: ["code_secure_account"],
  sharedPersonalInfo: ["info_identity_theft", "info_credit_freeze"],
  clickedLink: ["clicked_passwords", "clicked_scan"],
  repliedToSender: ["replied_expect_more"],
};

export interface RecoveryInput {
  label: VerdictLabel;
  scamType: ScamType;
  exposure?: IncomingEvent["exposure"];
  /** The trusted contact the message impersonated (call them at their SAVED handle). */
  claimedContact?: TrustedContact;
}

export function buildRecovery(input: RecoveryInput): RecoveryStep[] {
  if (input.label === "safe") return [];
  const ids: StepId[] = [];
  const add = (id: StepId) => !ids.includes(id) && ids.push(id);

  for (const [flag, steps] of Object.entries(EXPOSURE_STEPS) as [keyof Exposure, StepId[]][]) {
    if (input.exposure?.[flag]) steps.forEach(add);
  }
  const playbook = input.label === "suspicious" ? ["verify_before_acting" as StepId, ...PLAYBOOKS[input.scamType]] : PLAYBOOKS[input.scamType];
  playbook.forEach(add);

  const steps: RecoveryStep[] = ids.map((id) => ({ id, ...STEPS[id] }) as RecoveryStep);
  const contactStep = callSavedNumberStep(input.claimedContact);
  if (contactStep) steps.splice(Math.min(1, steps.length), 0, contactStep);
  return steps;
}

/** "Call Mom at the number saved in your phone" — target from the registry, never the message. */
function callSavedNumberStep(contact?: TrustedContact): RecoveryStep | undefined {
  if (!contact) return undefined;
  const target = contact.handles.find((h) => /^\+?\d[\d\s().-]{6,}$/.test(h)) ?? (contact.verifyVia.channel === "call" || contact.verifyVia.channel === "sms" ? contact.verifyVia.handle : undefined);
  const name = shortName(contact);
  return {
    id: "call_saved_contact",
    title: isOrg(contact) ? `Call ${name} at the number you already have` : `Call ${name} at the number saved in your phone`,
    detail: `Talk to the real ${name} before doing anything the message asked. Use the number saved in your phone — not the one that messaged you.`,
    urgency: "now",
    action: target ? { kind: "call", label: `Call ${name}`, target } : { kind: "none", label: `Call ${name} from your contacts` },
  };
}
