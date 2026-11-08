import { describe, expect, it } from "vitest";
import { SCAM_TYPES } from "@beacon/shared";
import { buildRecovery } from "../src/pipeline/recover.js";
import { contacts } from "./helpers.js";

/** The only targets recovery may ever use (plus registry handles). */
const TRUSTED_TARGETS = new Set([
  "7726",
  "https://reportfraud.ftc.gov",
  "https://www.ic3.gov",
  "https://www.identitytheft.gov",
  "https://consumer.ftc.gov/articles/what-know-about-credit-freezes-fraud-alerts",
  ...contacts.flatMap((c) => [...c.handles, c.verifyVia.handle]),
]);

const ALL_EXPOSED = { clickedLink: true, repliedToSender: true, sharedCode: true, sentMoney: true, sharedPersonalInfo: true };

describe("recovery playbooks", () => {
  for (const scamType of SCAM_TYPES.filter((t) => t !== "none")) {
    it(`${scamType}: has steps and only trusted targets, for every exposure`, () => {
      for (const exposure of [undefined, { clickedLink: true }, { sentMoney: true }, { sharedCode: true }, { sharedPersonalInfo: true }, { repliedToSender: true }, ALL_EXPOSED]) {
        const steps = buildRecovery({ label: "scam", scamType, exposure, claimedContact: contacts[0] });
        expect(steps.length).toBeGreaterThanOrEqual(3);
        expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
        for (const s of steps) if (s.action?.target) expect(TRUSTED_TARGETS, s.id).toContain(s.action.target);
      }
    });
  }

  it("puts urgent exposure steps first", () => {
    const steps = buildRecovery({ label: "scam", scamType: "family_emergency", exposure: { sentMoney: true } });
    expect(steps[0]!.id).toBe("money_call_bank");
    expect(steps[0]!.urgency).toBe("now");
  });

  it("covers each exposure flag", () => {
    const ids = (exposure: object) => buildRecovery({ label: "scam", scamType: "other", exposure }).map((s) => s.id);
    expect(ids({ clickedLink: true })).toContain("clicked_passwords");
    expect(ids({ sharedCode: true })).toContain("code_secure_account");
    expect(ids({ sharedPersonalInfo: true })).toEqual(expect.arrayContaining(["info_identity_theft", "info_credit_freeze"]));
    expect(ids({ repliedToSender: true })).toContain("replied_expect_more");
    expect(ids({ sentMoney: true })).toContain("money_report_ic3");
  });

  it("offers 'call Mom at the number saved in your phone' using the registry handle", () => {
    const step = buildRecovery({ label: "scam", scamType: "family_emergency", claimedContact: contacts[0] }).find((s) => s.id === "call_saved_contact");
    expect(step?.title).toBe("Call Mom at the number saved in your phone");
    expect(step?.action).toMatchObject({ kind: "call", target: "+15550100001" });
  });

  it("is empty for safe messages and starts with 'check before you act' for suspicious ones", () => {
    expect(buildRecovery({ label: "safe", scamType: "none" })).toEqual([]);
    expect(buildRecovery({ label: "suspicious", scamType: "wrong_number" })[0]!.id).toBe("verify_before_acting");
  });
});
