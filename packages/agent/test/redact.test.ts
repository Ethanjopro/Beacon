import { describe, expect, it } from "vitest";
import { describeRedactions, luhnValid, redact, scrubSafeWords } from "../src/privacy/redact.js";
import { contacts } from "./helpers.js";

describe("redact", () => {
  it("replaces phones, emails and SSNs with numbered placeholders", () => {
    const r = redact("Call me at (555) 010-1234 or +15550109999, email jo@mail.example, SSN 123-45-6789", contacts);
    expect(r.text).toBe("Call me at [PHONE_1] or [PHONE_2], email [EMAIL_1], SSN [SSN_1]");
    expect(r.counts).toEqual({ phone: 2, email: 1, ssn: 1 });
  });

  it("redacts real card numbers (Luhn) but keeps order numbers", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    const r = redact("Card 4111 1111 1111 1111 ref 4111111111111112", contacts);
    expect(r.text).toContain("[CARD_1]");
    expect(r.text).not.toContain("4111 1111 1111 1111");
    expect(r.counts.card).toBe(1);
  });

  it("redacts one-time codes but not money amounts", () => {
    const r = redact("Your verification code is 482913. Send $200 by 2026.", contacts);
    expect(r.text).toContain("[CODE_1]");
    expect(r.text).toContain("$200");
    expect(r.text).not.toContain("482913");
  });

  it("redacts street addresses best-effort", () => {
    const r = redact("Deliver to 1234 Elm Street, Apt 5 by noon", contacts);
    expect(r.text).toContain("[ADDRESS_1]");
    expect(r.text).not.toContain("Elm");
  });

  it("replaces contact NAMES with relationships but keeps role words", () => {
    const r = redact("It's Linda, your mom. Sammy says hi. First Lone Star Bank called.", contacts);
    expect(r.text).not.toMatch(/Linda|Sammy|Lone Star/);
    expect(r.text).toContain("[CONTACT_1 (family)]");
    expect(r.text).toContain("[CONTACT_2 (family)]");
    expect(r.text).toContain("[CONTACT_3 (bank)]");
    expect(r.text).toContain("your mom");
  });

  it("keeps link hosts but drops query strings", () => {
    const r = redact("Pay at https://txtag-billing.top/pay?email=jo@mail.example&id=99881234", contacts);
    expect(r.text).toBe("Pay at https://txtag-billing.top/pay?[QUERY]");
  });

  it("scrubs safe words everywhere, case-insensitively", () => {
    const s = scrubSafeWords("Mom here. BLUE  Heron! blue heron", contacts);
    expect(s.count).toBe(2);
    expect(s.text.toLowerCase()).not.toContain("heron");
    expect(redact("blue heron", contacts).text).not.toContain("heron");
  });

  it("describes what it hid in plain words", () => {
    expect(describeRedactions({ phone: 2, code: 1 })).toBe("2 phone numbers and 1 code");
    expect(describeRedactions({})).toBe("nothing personal");
  });
});
