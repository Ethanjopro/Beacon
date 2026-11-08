import { z } from "zod";

/**
 * Beacon's scam taxonomy. T-Mobile ships its own taxonomy with the track data;
 * map theirs onto these in `packages/scenarios/src/tmobile/` instead of renaming
 * these (the UI, recovery playbooks and eval all key off these IDs).
 *
 * Adding a type is a contract change: add it here, add a recovery playbook in
 * packages/agent, add a label in apps/phone, add at least one scenario.
 */
export const SCAM_TYPES = [
  "family_emergency", // "Grandma it's me, I'm in jail" — incl. cloned-voice calls
  "bank_impersonation", // fake fraud alert, "verify your account"
  "government_impersonation", // IRS, SSA, police, immigration
  "delivery_smishing", // USPS/UPS/FedEx "package held, pay fee"
  "toll_smishing", // "unpaid toll balance" texts
  "account_takeover_otp", // "read me the code we just sent you"
  "carrier_impersonation", // fake carrier support → SIM swap / port-out
  "tech_support", // "your computer/account is compromised, call us"
  "job_offer", // remote job / task scams
  "investment_crypto", // pig butchering, fake trading platforms
  "romance", // long-con relationship scams
  "wrong_number", // "sorry wrong number" opener for pig butchering
  "prize_lottery", // "you won", pay fee to claim
  "marketplace", // overpayment / fake buyer / fake seller
  "other",
  "none", // legitimate message
] as const;

export const ScamType = z.enum(SCAM_TYPES);
export type ScamType = z.infer<typeof ScamType>;

/** Human-readable labels for UI and reports. */
export const SCAM_TYPE_LABELS: Record<ScamType, string> = {
  family_emergency: "Family emergency",
  bank_impersonation: "Bank impersonation",
  government_impersonation: "Government impersonation",
  delivery_smishing: "Fake delivery notice",
  toll_smishing: "Fake toll bill",
  account_takeover_otp: "One-time-code theft",
  carrier_impersonation: "Phone carrier impersonation",
  tech_support: "Tech support scam",
  job_offer: "Fake job offer",
  investment_crypto: "Investment / crypto scam",
  romance: "Romance scam",
  wrong_number: "\"Wrong number\" opener",
  prize_lottery: "Prize / lottery scam",
  marketplace: "Marketplace scam",
  other: "Other scam",
  none: "Legitimate",
};
