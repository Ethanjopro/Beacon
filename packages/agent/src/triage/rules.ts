/**
 * On-device triage rules. Each rule is a named, explainable log-odds weight.
 *
 * Weight anchors (prior −1.5): Σ ≥ 2.9 → scam (p ≥ 0.80), Σ ≥ 1.1 → suspicious
 * (p ≥ 0.40). One strong cue alone should land "suspicious"; two independent
 * cues should land "scam". English + basic Spanish patterns.
 *
 * Patterns must describe scam BEHAVIOR (asks for gift cards, threatens arrest),
 * not specific scenario wording, so they generalize to messages we've never seen.
 */
import type { ScamType } from "@beacon/shared";

export interface Rule {
  id: string;
  title: string;
  detail: string;
  weight: number;
  pattern: RegExp;
  /** Which scam family this cue points to (summed per type to guess the type). */
  scamType?: ScamType;
  /** Rule only counts if this also matches somewhere in the text. */
  requires?: RegExp;
  /** Rule is suppressed if this matches (e.g. "never share this code"). */
  unless?: RegExp;
  /** Phrase used in the verification question: "…and is ___". Never message text. */
  ask?: string;
}

const MONEY = /\$\s?\d|\b\d+\s?(dollars|usd|d[oó]lares)\b|\b(pay|payment|send|transfer|fee|pagar|pago|env[ií]a|transferencia|cuota)\b/i;

export const RULES: Rule[] = [
  // ── Payment methods scammers love (irreversible) ──────────────────────────
  {
    id: "gift_card_payment",
    title: "Asks for gift cards",
    detail: "Real people and companies don't ask to be paid in gift cards.",
    weight: 2.2,
    pattern: /gift ?cards?|tarjetas? de regalo|prepaid (?:debit |visa |gift )?cards?|tarjetas? prepagadas?|itunes cards?|google play cards?|steam cards?|apple cards?\b|(?:send|text|read)(?: me)? the (?:card )?(?:codes|numbers on the back)/i,
    ask: "asking for gift cards",
  },
  {
    id: "irreversible_payment",
    title: "Wants a wire transfer or crypto",
    detail: "Wire transfers and crypto can't be reversed — scammers' favorite way to get paid.",
    weight: 1.4,
    pattern: /\b(wire (?:transfer|the money)|western union|moneygram|bitcoin|btc|usdt|crypto(?:currency)?|criptomonedas?|bitcoin atm)\b/i,
    requires: MONEY,
    ask: "asking for money",
  },
  {
    // Friends split dinner on payment apps too, so this alone stays below "suspicious".
    id: "payment_app",
    title: "Wants payment by Zelle, Cash App or Venmo",
    detail: "Payment-app transfers are instant and rarely refundable, so impostors prefer them.",
    weight: 0.7,
    pattern: /\b(zelle|cash ?app|venmo)\b/i,
    requires: MONEY,
    ask: "asking for money",
  },
  {
    id: "money_request_emergency",
    title: "Urgent request for money",
    detail: "A sudden money request is the payload of most impostor scams.",
    weight: 1.0,
    pattern: /\b(send|need|wire|lend|transfer|env[ií]a(?:me)?|necesito)\b[^.!?\n]{0,40}(\$\s?\d+|money|cash|dinero|funds|\d+\s?d[oó]lares)/i,
    ask: "asking for money",
  },

  // ── Pressure and isolation ────────────────────────────────────────────────
  {
    id: "urgency",
    title: "Pressure to act now",
    detail: "Scammers rush you so you don't stop to check.",
    weight: 0.8,
    pattern: /\b(urgent(?:ly)?|immediately|right now|right away|asap|within \d+ ?(hours?|hrs?|minutes?|mins?|days?)|final (notice|warning|reminder)|today only|act now|last chance|expires? (today|tonight|soon)|urgente|inmediatamente|ahora mismo|de inmediato)\b/i,
  },
  {
    id: "secrecy",
    title: "Asks you to keep it secret",
    detail: "\"Don't tell anyone\" is a classic way to stop you from checking with family.",
    weight: 1.2,
    pattern: /don'?t tell|do not tell|(?:don'?t|do not) discuss (?:this|it)[^.!?\n]{0,20}with anyone|keep (this|it) (between us|secret|quiet)|don'?t (call|talk to) (anyone|mom|dad|your)|no (le )?digas (nada )?a nadie|no le digas|es un secreto/i,
    scamType: "family_emergency",
  },
  {
    id: "threat_consequence",
    title: "Threatens arrest, fines or a shutoff",
    detail: "Threats of arrest, lawsuits or account closure are pressure tactics, not how real agencies work.",
    weight: 1.0,
    pattern: /\b(arrest(ed)? warrant|warrant for your arrest|warrant (will be|has been) issued|legal action|lawsuit|will be (suspended|closed|terminated|disconnected|arrested)|penalt(y|ies)|deport(ed|ation)?|orden de arresto|ser[aá] (arrestad[oa]|suspendid[oa])|multa)\b/i,
  },

  // ── Family emergency / impostor ───────────────────────────────────────────
  {
    id: "new_number_claim",
    title: "Claims a new number",
    detail: "\"New phone, new number\" lets an impostor explain why caller ID doesn't match.",
    weight: 1.0,
    pattern: /new (phone|number|cell)|lost my phone|broke my phone|phone (broke|died|got stolen)|my old (phone|number)|n[uú]mero nuevo|nuevo n[uú]mero|perd[ií] mi (tel[eé]fono|celular)/i,
    scamType: "family_emergency",
  },
  {
    id: "emergency_story",
    title: "Emergency involving police, jail or a hospital",
    detail: "Fake emergencies create panic so you pay first and think later.",
    weight: 1.2,
    pattern: /\b(bail|jail|arrested|in custody|hospital|car accident|accident|lawyer|public defender|stranded|kidnapped|c[aá]rcel|fianza|arrestad[oa]|accidente|abogado)\b/i,
    // "Grandpa's in the hospital, visiting hours are 2–6" is news, not a scam: needs an ask.
    requires: /\$\s?\d|\b(money|cash|bail|pay|send|wire|gift ?cards?|help me|need|don'?t tell|dinero|necesito|ayuda|fianza|env[ií]a)\b/i,
    scamType: "family_emergency",
    ask: "saying they're in trouble and need help",
  },
  {
    id: "grandparent_opener",
    title: "\"Grandma, it's me\" opener",
    detail: "Impostors open vaguely and let you supply the name.",
    weight: 1.0,
    pattern: /\b(grandma|grandpa|granny|nana|abuel[ao])\b[^.!?\n]{0,20}\b(it'?s me|its me|soy yo)\b|\bit'?s me,? your (grandson|granddaughter|nephew|niece)\b/i,
    scamType: "family_emergency",
  },

  // ── Bank / account ────────────────────────────────────────────────────────
  {
    id: "account_problem",
    title: "Says your account is locked or compromised",
    detail: "Fake fraud alerts scare you into \"verifying\" with the scammer.",
    weight: 1.2,
    pattern: /\b(account|card|debit card|tarjeta|cuenta)\b[^.!?\n]{0,30}\b(locked|suspended|frozen|restricted|compromised|blocked|on hold|disabled|bloquead[ao]|suspendid[ao]|congelad[ao])\b|\b(suspicious|unusual|unauthori[sz]ed) (activity|transaction|login|sign-?in|charge|purchase)\b|actividad sospechosa/i,
    scamType: "bank_impersonation",
  },
  {
    id: "verify_identity_request",
    title: "Asks you to \"verify\" your account",
    detail: "Banks don't ask you to verify your identity through a link or a reply.",
    weight: 1.0,
    pattern: /\b(verify|confirm|validate|update|unlock|restore|reactivate)\b[^.!?\n]{0,25}\b(your )?(account|identity|information|details|card|login|billing)\b|verifi(ca|que) (su|tu) (cuenta|identidad)/i,
    scamType: "bank_impersonation",
    unless: /\b(we|they) (will )?never ask/i,
  },
  {
    id: "personal_info_request",
    title: "Asks for personal or banking details",
    detail: "Nobody legitimate needs your SSN, PIN or password over text or a cold call.",
    weight: 1.4,
    pattern: /\b(ssn|social security (number|#)|account number|routing number|pin\b|password|login (details|credentials)|date of birth|mother'?s maiden|card number|cvv|security code on|n[uú]mero de seguro social|contrase[ñn]a)\b/i,
    requires: /\b(send|reply|provide|confirm|verify|enter|give|tell|read|share|need|env[ií]e|proporcione|confirme|d[ií]game)\b/i,
    unless: /\bnever (ask|share)|will never|nunca (le )?(pediremos|comparta)/i,
    ask: "asking for personal details",
  },

  // ── Government ────────────────────────────────────────────────────────────
  {
    id: "government_agency",
    title: "Claims to be a government agency",
    detail: "The IRS, Social Security and police don't demand payment by text or phone.",
    weight: 1.3,
    pattern: /\b(irs|internal revenue|social security administration|ssa\b|your social security number (has been|is) (suspended|compromised)|department of (justice|homeland)|immigration|uscis|ice agent|federal agent|sheriff|police department|tax (debt|owed|refund)|(back|unpaid|overdue|delinquent) taxes|(state|federal|county) (revenue|tax)|revenue (department|division|agency|service|recovery)|department of revenue|tax (bureau|authority|office|division)|hacienda|inmigraci[oó]n|seguro social)\b/i,
    scamType: "government_impersonation",
    requires: /\b(pay|payment|owe|debt|warrant|arrest|suspend|refund|fine|verify|call|deport|pagar|deuda|multa|arresto)\b/i,
  },

  // ── Delivery / toll smishing ──────────────────────────────────────────────
  {
    id: "delivery_problem",
    title: "Package \"on hold\" story",
    detail: "Fake delivery problems are one of the most common text scams.",
    weight: 1.6,
    pattern: /\b(package|parcel|shipment|delivery|paquete|env[ií]o)\b[^.!?\n]{0,40}\b(held|on hold|undeliverable|failed|unable to (be )?deliver|redeliver(y|ed)?|incomplete address|update (your )?address|address (is )?(incomplete|invalid)|customs fee|retenido|no (pudo|se pudo) entregar)\b|redelivery fee/i,
    scamType: "delivery_smishing",
  },
  {
    id: "unpaid_toll",
    title: "Unpaid toll bill",
    detail: "Toll-balance texts with a payment link are among the most common smishing lures.",
    weight: 1.8,
    pattern: /unpaid toll|toll (balance|violation|notice|bill|charges?|due)|outstanding toll|peaje (pendiente|impago|sin pagar)|saldo de peaje/i,
    scamType: "toll_smishing",
  },

  // ── One-time-code theft ───────────────────────────────────────────────────
  {
    id: "otp_request",
    title: "Asks for a one-time code",
    detail: "A code sent to your phone is a key to your account — nobody legitimate asks you to share it.",
    weight: 2.2,
    pattern:
      /\b(send|read|tell|share|give|forward|text|reply with|provide|repeat|env[ií]a(me)?|d[ií]me|comparte|reenv[ií]a)\b[^.!?\n]{0,40}\b(code|codes|otp|passcode|verification number|c[oó]digo)\b|\b(code|otp|c[oó]digo)\b[^.!?\n]{0,50}\b(send it|read it|tell me|back to me|send (it )?back|me lo (env[ií]as|dices))\b|\b(sent|texted) (my|a|the) (verification |security )?(code|c[oó]digo) to (your|this) (number|phone)/i,
    scamType: "account_takeover_otp",
    // "Never share this code" is the legit notice; gift-card "codes" are the gift-card rule's job.
    unless: /\b(don'?t|do not|never|no) (share|give|send|tell)\b|\bnunca (lo )?compartas?|no (lo )?compartas?|gift ?cards?|tarjetas? de regalo/i,
    ask: "asking for a verification code",
  },
  {
    id: "otp_safety_notice",
    title: "Warns you not to share the code",
    detail: "Legitimate code messages tell you never to share them — and don't ask for anything back.",
    weight: -1.0,
    pattern: /\b(don'?t|do not|never) share (this|the|your) (code|otp)|\bwe (will )?never (ask|call)|nunca compartas? (este|tu) c[oó]digo/i,
    unless: /\b(send|read|tell|give|reply with)\b[^.!?\n]{0,25}\b(it|the code|code) (to|back)/i,
  },

  // ── Carrier ───────────────────────────────────────────────────────────────
  {
    id: "carrier_account_threat",
    title: "Phone carrier \"account issue\"",
    detail: "Fake carrier support is how SIM-swap and port-out attacks start.",
    weight: 1.4,
    pattern: /\b(sim|esim) (swap|card|upgrade|activation|update|change)|\bport(-| )?out\b|number transfer pin|account pin|(wireless|mobile|phone|cell) (account|service|line|plan)\b[^.!?\n]{0,30}\b(suspended|disconnected|deactivated|interrupted|past due|cancel+ed)|\bcarrier (support|security)|\b(5g|network) upgrade\b/i,
    scamType: "carrier_impersonation",
  },

  // ── Tech support ──────────────────────────────────────────────────────────
  {
    id: "tech_support_lure",
    title: "Fake virus or hacked-account alert",
    detail: "Real tech companies don't text or call you about viruses.",
    weight: 1.6,
    pattern: /\b(virus|malware|trojan|spyware|hacked|hackers?)\b[^.!?\n]{0,40}\b(detected|found|on your|compromised|accessed)|\b(remote access|anydesk|teamviewer|ultraviewer|screen ?share)\b|call (microsoft|apple|windows|geek squad|tech) support|\brefund department\b|your (computer|device|pc|iphone) (is|has been) (infected|locked|compromised)/i,
    scamType: "tech_support",
  },

  // ── Job ───────────────────────────────────────────────────────────────────
  {
    id: "job_offer_lure",
    title: "Too-good-to-be-true job offer",
    detail: "Unsolicited remote jobs that pay per \"task\" are a top-reported scam.",
    weight: 1.3,
    pattern: /\b(remote (job|position|work|opportunity)|work from home|part-?time (job|position|work)|hiring|recruit(er|ing)|job offer|trabajo (desde casa|remoto)|empleo)\b[^]{0,120}\b(\$\s?\d+|per (day|hour|task)|a day|daily pay|tasks?|commission|telegram|whatsapp)\b|\$\s?\d{2,4}\s?(\/|per|a) ?(day|d[ií]a)\b/i,
    scamType: "job_offer",
  },

  // ── Investment / crypto ───────────────────────────────────────────────────
  {
    id: "investment_pitch",
    title: "Promises big, guaranteed returns",
    detail: "Guaranteed profits and secret trading platforms are hallmarks of investment fraud.",
    weight: 1.5,
    pattern: /\b(guaranteed (returns?|profits?|income)|investment opportunity|trading (platform|app|signals?)|double your (money|investment)|\d{2,4}% (returns?|profit|gains?)|crypto (mining|trading|investment)|my (uncle|aunt|mentor) (teaches|taught) me|ganancias garantizadas|inversi[oó]n segura)\b/i,
    scamType: "investment_crypto",
  },

  // ── Romance ───────────────────────────────────────────────────────────────
  {
    id: "romance_money",
    title: "Online sweetheart needs money",
    detail: "Romance scammers build trust for weeks, then invent a crisis that needs your money.",
    weight: 1.4,
    pattern: /\b(my love|my darling|sweetheart|my dear|babe|honey|mi amor|cari[ñn]o)\b[^]{0,160}\b(customs|stuck|stranded|oil rig|deployed|visa|plane ticket|flight|fee|send|transfer|gift ?cards?|bitcoin|dinero)\b/i,
    scamType: "romance",
    unless: /\b(it'?s mom|it'?s dad|your (mom|dad|mother|father))\b/i,
  },

  // ── Wrong-number opener ───────────────────────────────────────────────────
  {
    id: "wrong_number_opener",
    title: "\"Wrong number\" opener",
    detail: "A friendly wrong-number text is a common first step in long investment cons.",
    weight: 1.3,
    pattern: /\b(sorry,? (wrong number|i think i have the wrong)|is this (\w+)\?|are you (\w+)\?? we met|we met (at|on|last)|did we (meet|talk)|nice to meet you anyway|perd[oó]n,? n[uú]mero equivocado|me equivoqu[eé] de n[uú]mero)\b/i,
    scamType: "wrong_number",
  },

  // ── Prize / lottery ───────────────────────────────────────────────────────
  {
    id: "prize_claim",
    title: "You \"won\" something",
    detail: "You can't win a contest you didn't enter, and real prizes don't charge fees.",
    weight: 1.6,
    pattern: /\b(you('ve| have)? (won|been selected)|winner|claim your (prize|reward|gift)|lottery|sweepstakes|jackpot|ganaste|has ganado|ganador|premio)\b/i,
    scamType: "prize_lottery",
  },
  {
    id: "upfront_fee",
    title: "Pay a fee to get paid",
    detail: "Having to pay a \"processing\" or \"release\" fee first is always a scam.",
    weight: 1.0,
    pattern: /\b(processing|release|clearance|handling|activation|shipping|customs|delivery) fee\b|\bpay (a small|the) fee\b|cuota de (procesamiento|env[ií]o)/i,
  },

  // ── Marketplace ───────────────────────────────────────────────────────────
  {
    id: "marketplace_overpay",
    title: "Overpayment or fake-buyer trick",
    detail: "Buyers who overpay and ask for the difference back, or insist on odd payment steps, are scamming.",
    weight: 1.5,
    pattern: /\b(overpa(id|yment)|sent (you )?(too much|extra)|refund the (difference|extra)|send (back )?the (difference|extra)|cashier'?s check|certified check|zelle (business|premium) (account|upgrade)|my (mover|shipping agent|courier) will (pick|collect)|(still )?available\?[^]{0,80}(code|zelle|cash ?app|shipping))\b/i,
    scamType: "marketplace",
  },

  // ── Generic delivery mechanics ────────────────────────────────────────────
  {
    id: "callback_number",
    title: "Pushes you to call a number in the message",
    detail: "Scammers give their own \"support\" number. Use the one on the back of your card or the official site.",
    weight: 0.7,
    pattern: /\b(call|contact|dial|llame?|llama)\b[^.!?\n]{0,30}(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\[PHONE_\d+\])/i,
  },

  // ── Attacks on the AI itself ──────────────────────────────────────────────
  {
    id: "prompt_injection",
    title: "Tries to manipulate the AI",
    detail: "The message contains instructions aimed at an AI assistant — a strong sign of a crafted attack.",
    weight: 2.5,
    pattern:
      /ignore (all |any |the )?(previous|prior|above|earlier|your) (instructions|rules|prompts?)|disregard (all |any |the )?(previous|prior|above|your) (instructions|rules)|you are (now )?(an? )?(ai|assistant|chatbot|language model|llm)\b|\b(mark|classify|label|flag|rate|treat) (this|me|the message|this message|this text) as (safe|legit(imate)?|not (a )?scam|not spam|trusted|benign)|system prompt|<\/?(system|assistant|instructions?)>|\bas an ai\b|\b(ai|llm|assistant|bot)s? (reading|processing|scanning|analy[sz]ing) this|new instructions:|ignora (todas )?las instrucciones/i,
  },
];

/** Hidden/zero-width characters are used to smuggle instructions or break filters. */
export const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤﻿]/;
