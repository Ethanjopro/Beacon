import { describe, expect, it } from "vitest";
import { SCAM_TYPES, Scenario, TrustedContact } from "@beacon/shared";
import { demoScenarios, getScenario, listScenarios, scenarioToEvent, scenarios, trustedContacts } from "../src/index.js";

describe("library", () => {
  it("every scenario is schema-valid with unique ids", () => {
    for (const s of scenarios) expect(() => Scenario.parse(s)).not.toThrow();
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(scenarios.length).toBeGreaterThanOrEqual(20);
  });

  it("covers every ScamType except none/other", () => {
    const covered = new Set(scenarios.map((s) => s.expected.scamType));
    for (const t of SCAM_TYPES) if (t !== "none" && t !== "other") expect(covered.has(t), t).toBe(true);
  });

  it("has the required mix of controls, calls, injection, forwarded, Spanish", () => {
    const tagged = (t: string) => scenarios.filter((s) => s.tags.includes(t));
    expect(tagged("control").length).toBeGreaterThanOrEqual(5);
    expect(tagged("control").every((s) => s.expected.label === "safe" && s.expected.scamType === "none")).toBe(true);
    const calls = scenarios.filter((s) => s.event.kind === "call" && (s.event.transcript?.length ?? 0) > 2);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(tagged("injection").length).toBeGreaterThanOrEqual(1);
    expect(tagged("forwarded").length).toBeGreaterThanOrEqual(1);
    expect(tagged("es").length).toBeGreaterThanOrEqual(1);
    expect(scenarios.find((s) => s.expected.verification === "confirmed")?.expected.label).toBe("safe");
  });

  it("call transcripts have increasing timestamps", () => {
    for (const s of scenarios) {
      const t = s.event.transcript ?? [];
      for (let i = 1; i < t.length; i++) expect(t[i]!.atMs).toBeGreaterThanOrEqual(t[i - 1]!.atMs);
    }
  });

  it("trustedContactReply points at a real contact", () => {
    const ids = new Set(trustedContacts.map((c) => c.id));
    for (const s of scenarios) if (s.trustedContactReply) expect(ids.has(s.trustedContactReply.contactId), s.id).toBe(true);
  });

  it("keeps the demo run-sheet and legacy ids", () => {
    expect(demoScenarios.map((s) => s.id)).toEqual(["toll-smish", "mom-new-number-giftcards", "mom-new-number-confirmed", "grandson-bail-call"]);
    expect(getScenario("mom-dinner-legit")?.expected.label).toBe("safe"); // pre-flight check in docs/DEMO.md
    for (const s of demoScenarios) expect(s.tags).toContain("demo");
    expect(getScenario("mom-new-number-giftcards")?.expected).toEqual({ label: "scam", scamType: "family_emergency", verification: "denied" });
    expect(getScenario("toll-smish")?.expected.scamType).toBe("toll_smishing");
    expect(getScenario("mom-dinner-legit")?.expected.label).toBe("safe");
    expect(listScenarios().length).toBe(scenarios.length);
  });

  it("never uses T-Mobile or real carrier names, and uses fictional contact numbers", () => {
    const text = JSON.stringify(scenarios).toLowerCase();
    for (const bad of ["t-mobile", "tmobile", "verizon", "at&t", "wells fargo", "paypal", "venmo", "zelle"]) expect(text).not.toContain(bad);
    expect(text).not.toMatch(/\bchase\b/);
    for (const c of trustedContacts) {
      TrustedContact.parse(c);
      for (const h of c.handles) if (h.startsWith("+")) expect(h).toMatch(/^\+1555010\d{4}$/);
    }
  });

  it("scenarioToEvent maps forwarded scenarios to the forwarded source", () => {
    expect(scenarioToEvent(getScenario("forwarded-irs-style-notice")!).source).toBe("forwarded");
    expect(scenarioToEvent(getScenario("toll-smish")!).source).toBe("scenario");
  });
});
