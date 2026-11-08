import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Award,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Lock,
  MessageSquare,
  Phone,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ScamTrick {
  id: string;
  category: "voice" | "bank" | "smishing" | "carrier";
  title: string;
  badge: string;
  severity: "CRITICAL" | "HIGH" | "ELEVATED";
  scenario: string;
  giveaway: string[];
  magentaDefense: string;
}

const SCAM_TRICKS: ScamTrick[] = [
  {
    id: "voice-cloning",
    category: "voice",
    title: "AI Voice Cloning & Family Emergency Lures",
    badge: "AI Deepfake Threat",
    severity: "CRITICAL",
    scenario:
      "A fraudster scrapes 3–5 seconds of a family member's voice from Instagram or TikTok, clones their tone and inflection, and calls late at night claiming they were arrested or in a hospital crash: 'Grandma, it's me! Please don't call Mom, I need bail money right now!'",
    giveaway: [
      "Extreme emotional panic and forced secrecy ('Don't tell Mom and Dad').",
      "Demands non-reversible payments: Zelle, Bitcoin ATMs, or Apple Gift Cards.",
      "Dodges questions about shared personal memories or childhood pets.",
    ],
    magentaDefense:
      "Magenta-Guard announces it is an AI, demands your pre-agreed secret family code word, and places an independent outbound call to the contact's real saved number before connecting.",
  },
  {
    id: "bank-otp",
    category: "bank",
    title: "Fake Bank Fraud Dept & Reverse 2FA Intercept",
    badge: "Account Takeover",
    severity: "CRITICAL",
    scenario:
      "Caller ID is spoofed to look like your bank, card issuer or phone carrier. The agent claims: 'A suspicious $2,400 wire was just attempted. We just sent a 6-digit authorization code to your phone—read it back to freeze the transfer.'",
    giveaway: [
      "The code sent to your phone is actually a real password reset or wire authorization code the scammer triggered!",
      "Real banks explicitly state: 'First Lone Star Bank will NEVER ask for this code over the phone.'",
      "They pressure you with a tight deadline ('The charge will post in two minutes').",
    ],
    magentaDefense:
      "Magenta-Guard actively listens for OTP read-back lures, alerts you with live risk meters, and flags credential theft before you can speak the code.",
  },
  {
    id: "tollway-smish",
    category: "smishing",
    title: "Tollway & Delivery Phishing (fake toll and parcel notices)",
    badge: "Smishing Attack",
    severity: "HIGH",
    scenario:
      "An SMS arrives: 'Parcel Notice: Your package is held at the sorting depot due to an incomplete address. Update your street address and pay the $1.99 redelivery fee within 12 hours at parcel-redeliver-hub.top.'",
    giveaway: [
      "Sent from a random 10-digit mobile number instead of an official 5-digit carrier shortcode.",
      "Lookalike domain names with unusual extensions (.top, .info, .xyz).",
      "Creates artificial urgency over tiny monetary amounts ($1.99) to lower your defense.",
    ],
    magentaDefense:
      "Never tap a link in an unexpected text. Open the company's official app, or type its address yourself.",
  },
  {
    id: "sim-swap",
    category: "carrier",
    title: "Carrier Tech Support & Account PIN Extraction",
    badge: "Identity Theft",
    severity: "HIGH",
    scenario:
      "A caller claiming to be your carrier's 'Tier 2 Network Support' offers an urgent '5G Ultra Capacity SIM upgrade' or warns that your line will be suspended unless you verbally confirm your 6-digit carrier account PIN.",
    giveaway: [
      "Legitimate carrier representatives will NEVER cold-call you asking for your account password or transfer PIN.",
      "Claims of instantaneous line disconnection if you hang up and call back.",
    ],
    magentaDefense:
      "Magenta-Guard treats all incoming carrier claims with zero trust, isolating the caller until verified through independent out-of-band channels.",
  },
];

interface QuizQuestion {
  id: number;
  prompt: string;
  options: { text: string; correct: boolean; explanation: string }[];
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    prompt:
      "A 'fraud officer' from First Lone Star Bank calls saying: 'We sent a 6-digit passcode to cancel an unauthorized $1,800 charge. Please read it to me now.' What is the safest action?",
    options: [
      {
        text: "Read the code immediately so the $1,800 charge doesn't post.",
        correct: false,
        explanation: "Never read 2FA codes! The scammer triggered that code to log into your account.",
      },
      {
        text: "Hang up immediately and call the official phone number on the back of your card.",
        correct: true,
        explanation: "Correct! Real banks never ask for one-time codes over the phone.",
      },
      {
        text: "Ask for the agent's badge ID and supervisor number, then give the code.",
        correct: false,
        explanation: "Scammers fabricate convincing badge IDs and fake supervisor extensions in seconds.",
      },
    ],
  },
  {
    id: 2,
    prompt:
      "Your grandson calls from an unknown number crying: 'Grandma, I'm at the police station and need bail money right now!' How should you verify?",
    options: [
      {
        text: "Ask for your secret family code word, or hang up and call his saved number.",
        correct: true,
        explanation: "Correct! AI voice clones can mimic anyone's voice, but they can't know your pre-agreed code word.",
      },
      {
        text: "Hurry to the nearest store to buy gift cards before the police transfer him.",
        correct: false,
        explanation: "Police and courts never accept gift cards, Zelle, or Bitcoin for bail.",
      },
      {
        text: "Ask him what his name and birthday are to verify identity.",
        correct: false,
        explanation: "Names, birthdays, and family trees are easily scraped from public social media profiles.",
      },
    ],
  },
];

export function ScamAcademyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"tricks" | "quiz">("tricks");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "voice" | "bank" | "smishing">("all");
  const [expandedTrick, setExpandedTrick] = useState<string>("voice-cloning");

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTricks =
    selectedCategory === "all"
      ? SCAM_TRICKS
      : SCAM_TRICKS.filter((t) => t.category === selectedCategory);

  const currentQuestion = QUIZ_QUESTIONS[quizIndex];

  const handleSelectOption = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    if (currentQuestion?.options[index]?.correct) {
      setScore((s) => s + 1);
    }
  };

  const handleNextQuestion = () => {
    if (quizIndex + 1 < QUIZ_QUESTIONS.length) {
      setQuizIndex((i) => i + 1);
      setSelectedAnswer(null);
    } else {
      setQuizFinished(true);
    }
  };

  const handleRestartQuiz = () => {
    setQuizIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setQuizFinished(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative flex h-[90vh] max-h-[820px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#1c1824] via-[#121118] to-[#0a0a0e] text-[#f4f2f5] shadow-2xl"
      >
        {/* Header */}
        <header className="relative flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#E0247D]/20 text-[#E0247D] shadow-[0_0_20px_rgba(224,36,125,0.3)]">
              <GraduationCap size={24} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Magenta-Guard Scam Academy
                </h2>
                <span className="hidden rounded-full bg-[#34C759]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#34C759] sm:inline-flex">
                  2026 Threat Trends
                </span>
              </div>
              <p className="text-xs text-[#bcb8c2] sm:text-sm">
                Get to know emerging AI voice cloning and social engineering tricks before they reach you.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("tricks")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                activeTab === "tricks"
                  ? "bg-[#E0247D] text-white shadow-lg shadow-[#E0247D]/30"
                  : "bg-white/5 text-[#bcb8c2] hover:bg-white/10 hover:text-white"
              }`}
            >
              📚 Phishing & Fraud Tricks ({SCAM_TRICKS.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("quiz")}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                activeTab === "quiz"
                  ? "bg-[#E0247D] text-white shadow-lg shadow-[#E0247D]/30"
                  : "bg-white/5 text-[#bcb8c2] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Award size={15} /> Spot the Scam Quiz
            </button>
          </div>

          {activeTab === "tricks" && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {(["all", "voice", "bank", "smishing"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    selectedCategory === cat
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {cat === "all" ? "All" : cat === "voice" ? "AI Voice" : cat === "bank" ? "Banking" : "Texts"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="scroll-quiet flex-1 overflow-y-auto p-6">
          {activeTab === "tricks" && (
            <div className="space-y-4">
              {filteredTricks.map((trick) => {
                const isExpanded = expandedTrick === trick.id;
                return (
                  <div
                    key={trick.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all hover:border-white/20"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTrick(isExpanded ? "" : trick.id)}
                      className="flex w-full items-center justify-between p-4 text-left sm:p-5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-xl font-bold ${
                            trick.severity === "CRITICAL"
                              ? "bg-[#FF3B30]/20 text-[#FF3B30]"
                              : "bg-[#FF9500]/20 text-[#FF9500]"
                          }`}
                        >
                          <ShieldAlert size={20} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-white sm:text-lg">
                              {trick.title}
                            </h3>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                              {trick.badge}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-[#aaa4b0]">
                            {trick.scenario}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className={`text-white/40 transition-transform duration-200 ${
                          isExpanded ? "rotate-90 text-white" : ""
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-white/10 bg-black/20 p-4 sm:p-5"
                        >
                          <div className="grid gap-4 md:grid-cols-3">
                            {/* The Hook */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#FF9500]">
                                <AlertTriangle size={14} /> The Scammer's Script
                              </span>
                              <p className="mt-2 text-xs leading-relaxed text-[#bcb8c2]">
                                "{trick.scenario}"
                              </p>
                            </div>

                            {/* What Gives It Away */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#FF3B30]">
                                <ShieldAlert size={14} /> What Gives It Away
                              </span>
                              <ul className="mt-2 space-y-1.5 text-xs text-[#bcb8c2]">
                                {trick.giveaway.map((g, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="mt-1 text-[#FF3B30]">✕</span>
                                    <span>{g}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Magenta-Guard Intercept */}
                            <div className="rounded-xl border border-[#34C759]/30 bg-[#34C759]/10 p-3.5">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#34C759]">
                                <ShieldCheck size={14} /> How Magenta-Guard Protects You
                              </span>
                              <p className="mt-2 text-xs leading-relaxed text-white/90">
                                {trick.magentaDefense}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Interactive Quiz */}
          {activeTab === "quiz" && (
            <div className="mx-auto max-w-xl py-4">
              {!quizFinished ? (
                currentQuestion && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#bcb8c2]">
                      <span>Question {quizIndex + 1} of {QUIZ_QUESTIONS.length}</span>
                      <span>Score: {score}</span>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-5 shadow-lg">
                      <p className="text-base font-semibold leading-snug text-white sm:text-lg">
                        {currentQuestion.prompt}
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {currentQuestion.options.map((opt, idx) => {
                        const isChosen = selectedAnswer === idx;
                        const isRevealed = selectedAnswer !== null;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectOption(idx)}
                            disabled={isRevealed}
                            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                              isRevealed
                                ? opt.correct
                                  ? "border-[#34C759] bg-[#34C759]/15 text-white"
                                  : isChosen
                                    ? "border-[#FF3B30] bg-[#FF3B30]/15 text-white"
                                    : "border-white/10 bg-white/[0.02] opacity-50"
                                : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] text-white"
                            }`}
                          >
                            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-white/30 text-xs font-bold">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{opt.text}</p>
                              {isRevealed && isChosen && (
                                <p
                                  className={`mt-2 text-xs font-semibold ${
                                    opt.correct ? "text-[#34C759]" : "text-[#FF8A83]"
                                  }`}
                                >
                                  {opt.explanation}
                                </p>
                              )}
                            </div>
                            {isRevealed && opt.correct && (
                              <CheckCircle2 size={18} className="text-[#34C759]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {selectedAnswer !== null && (
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleNextQuestion}
                          className="flex items-center gap-2 rounded-xl bg-[#E0247D] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
                        >
                          {quizIndex + 1 < QUIZ_QUESTIONS.length ? "Next Question" : "See Results"}
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#34C759]/20 text-[#34C759]">
                    <Award size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">Quiz Completed!</h3>
                  <p className="mt-1 text-sm text-[#bcb8c2]">
                    You scored {score} out of {QUIZ_QUESTIONS.length}!
                  </p>
                  <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-[#aaa4b0]">
                    {score === QUIZ_QUESTIONS.length
                      ? "You're scam-proof! You recognized the emotional urgency, OTP intercept traps, and identity verification best practices."
                      : "Good practice! Remember: Never read 2FA codes aloud, and always demand a family code word or place an independent callback."}
                  </p>
                  <button
                    type="button"
                    onClick={handleRestartQuiz}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    <RotateCcw size={14} /> Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-white/10 bg-white/[0.02] px-6 py-3.5 text-xs text-[#aaa4b0]">
          <span>Powered by NVIDIA Nemotron · a concept for carrier customers</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-4 py-1.5 font-semibold text-white transition-colors hover:bg-white/20"
          >
            Done
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
