import type { RecoveryStep } from "@beacon/shared";

/**
 * Recovery steps used by the mock scenarios. Every action target comes from a
 * trusted source (carrier short code 7726, the FTC, a saved contact) — never
 * from the suspicious message.
 */

export const FORWARD_TO_7726: RecoveryStep = {
  id: "report_7726",
  title: "Forward the text to 7726",
  detail: "7726 spells SPAM. Your carrier uses these reports to block the sender for everyone.",
  urgency: "now",
  action: { kind: "sms", label: "Forward to 7726", target: "7726" },
};

export const BLOCK_SENDER: RecoveryStep = {
  id: "block_sender",
  title: "Block this number",
  detail: "Replying, even with STOP, tells scammers your number is live.",
  urgency: "now",
  action: { kind: "block", label: "Block sender" },
};

export const REPORT_FTC: RecoveryStep = {
  id: "report_ftc",
  title: "Report it to the FTC",
  detail: "Takes about five minutes and helps investigators connect cases.",
  urgency: "later",
  action: { kind: "link", label: "Open ReportFraud.ftc.gov", target: "https://reportfraud.ftc.gov" },
};

export const TOLL_RECOVERY: RecoveryStep[] = [
  {
    id: "dont_tap",
    title: "Don't tap the link",
    detail: "It goes to metrotag-billing.top, which isn't MetroTag. Toll agencies don't text payment links.",
    urgency: "now",
  },
  FORWARD_TO_7726,
  BLOCK_SENDER,
  {
    id: "check_real_account",
    title: "Check your real toll account",
    detail: "Open the agency's app or type its address yourself. Never sign in from a text.",
    urgency: "soon",
  },
  {
    id: "if_paid_call_bank",
    title: "Already paid? Call your bank",
    detail: "Use the number on the back of your card and ask them to block the charge and reissue the card.",
    urgency: "soon",
  },
  REPORT_FTC,
];

export const GIFT_CARD_RECOVERY: RecoveryStep[] = [
  {
    id: "dont_buy_cards",
    title: "Don't buy the gift cards",
    detail: "Real family never needs gift card codes. Anyone asking for them is running a scam.",
    urgency: "now",
  },
  BLOCK_SENDER,
  FORWARD_TO_7726,
  {
    id: "tell_mom",
    title: "Let Mom know",
    detail: "Someone is pretending to be her. Warn the family group chat so they don't fall for it either.",
    urgency: "soon",
    action: { kind: "call", label: "Call Mom", target: "+15550100001" },
  },
  {
    id: "if_sent_codes",
    title: "Already sent codes? Call the card issuer",
    detail: "Use the number on the back of the card. Unspent balances can sometimes be frozen if you're quick.",
    urgency: "soon",
  },
  REPORT_FTC,
];

export const VOICE_CLONE_RECOVERY: RecoveryStep[] = [
  {
    id: "hang_up",
    title: "Hang up",
    detail: "A real emergency can wait two minutes while you check. Scammers can't.",
    urgency: "now",
  },
  {
    id: "call_sam",
    title: "Call Sam at his saved number",
    detail: "Magenta-Guard already asked him. Hearing his real voice settles it.",
    urgency: "now",
    action: { kind: "call", label: "Call Sam", target: "+15550100002" },
  },
  {
    id: "no_cash",
    title: "Don't send cash, gift cards or crypto",
    detail: "No court, jail or lawyer takes bail as gift cards, and couriers collecting cash are part of the scam.",
    urgency: "now",
  },
  {
    id: "safe_word",
    title: "Set a family safe word",
    detail: "A word only your family knows. Magenta-Guard checks it on the server and never sends it anywhere.",
    urgency: "soon",
  },
  REPORT_FTC,
];

export const CALL_MOM_FIRST: RecoveryStep[] = [
  {
    id: "call_mom_first",
    title: "Call Mom before you buy anything",
    detail: "Use her saved number, not the one that texted you.",
    urgency: "now",
    action: { kind: "call", label: "Call Mom", target: "+15550100001" },
  },
  BLOCK_SENDER,
];
