import type { ScamType } from "@beacon/shared";

/**
 * Map T-Mobile's category strings onto our ScamType. Fuzzy by keyword (first
 * match wins, so order matters: specific before generic). Unknown → "other".
 * Edit the table once the real taxonomy is in hand.
 */
const RULES: Array<[RegExp, ScamType]> = [
  [/^(none|legit|legitimate|ham|benign|not[\s_-]?(a[\s_-]?)?scam|safe|normal)$/i, "none"],
  [/toll/i, "toll_smishing"],
  [/deliver|parcel|package|shipping|courier/i, "delivery_smishing"],
  [/sim[\s_-]?swap|carrier|telco|wireless|port[\s_-]?out/i, "carrier_impersonation"],
  [/otp|one[\s_-]?time|verification[\s_-]?code|2fa|account[\s_-]?takeover|credential/i, "account_takeover_otp"],
  [/bank|financ|credit[\s_-]?card|fraud[\s_-]?alert|payment|phishing/i, "bank_impersonation"],
  [/gov|irs|tax|ssa|social[\s_-]?security|police|immigration|court|legal/i, "government_impersonation"],
  [/tech[\s_-]?support|virus|malware|computer/i, "tech_support"],
  [/job|employ|recruit|work[\s_-]?from[\s_-]?home|task/i, "job_offer"],
  [/wrong[\s_-]?number/i, "wrong_number"],
  [/crypto|invest|trading|bitcoin|pig/i, "investment_crypto"],
  [/romance|dating|love/i, "romance"],
  [/prize|lotter|sweepstake|giveaway|reward|winner/i, "prize_lottery"],
  [/marketplace|overpay|buyer|seller|classified/i, "marketplace"],
  [/family|grand(son|ma|pa|child)|relative|emergency|impersonat.*(friend|family)/i, "family_emergency"],
];

export function mapTmobileCategory(category: string | undefined): ScamType {
  const c = (category ?? "").trim();
  if (!c) return "other";
  for (const [re, type] of RULES) if (re.test(c)) return type;
  return "other";
}
