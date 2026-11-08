import { describe, expect, it } from "vitest";
import { formatVerdictReply, formatVerificationQuestion, MAX_REPLY_CHARS, stripLinks } from "../src/format.js";
import { request, verdict } from "./fixtures.js";

describe("formatVerdictReply", () => {
  it("has label, confidence, top 2 reasons and first step", () => {
    const t = formatVerdictReply(verdict());
    expect(t).toContain("Likely a SCAM (96% confident)");
    expect(t).toContain("Why: Real Mom denied sending it; Asks for gift cards.");
    expect(t).toContain("First step: Do not send any gift card codes");
    expect(t).not.toContain("Known number");
  });
  it("uses safe-direction signals for safe verdicts", () => {
    const t = formatVerdictReply(verdict({ label: "safe", confidence: 0.9 }));
    expect(t).toContain("Looks safe");
    expect(t).toContain("Known number");
  });
  it("stays within the limit and never echoes links", () => {
    const long = "x".repeat(300);
    const t = formatVerdictReply(
      verdict({
        signals: [{ id: "a", title: "Links to http://evil.example/pay", detail: "d", weight: 2, source: "heuristic" }],
        recovery: [{ id: "r", title: "Step", detail: long + " https://evil.example", urgency: "now" }, ],
      }),
    );
    expect(t.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(t).not.toMatch(/evil\.example|https?:/);
  });
});

describe("formatVerificationQuestion", () => {
  it("adds a reply hint and strips links", () => {
    const t = formatVerificationQuestion(request({ question: "Did you text Sam? see http://bad.example/x" }));
    expect(t).toContain("Reply yes or no.");
    expect(t).not.toContain("bad.example");
  });
  it("does not double the hint", () => {
    expect(formatVerificationQuestion({ question: "Did you just text Sam? Reply yes or no." })).toBe("Did you just text Sam? Reply yes or no.");
  });
});

describe("stripLinks", () => {
  it("removes urls and bare domains", () => {
    expect(stripLinks("go to www.x.com or bit.ly/abc and usps-fee.top now")).not.toMatch(/www|bit\.ly|usps-fee/);
  });
});
