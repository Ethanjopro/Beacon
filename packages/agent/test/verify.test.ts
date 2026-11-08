import { describe, expect, it } from "vitest";
import type { VerificationRequest } from "@beacon/shared";
import { interpretReply } from "../src/index.js";
import { contacts, harness, makeEvent, stageTrace } from "./helpers.js";

const request: VerificationRequest = {
  id: "ver_1",
  eventId: "evt_1",
  contactId: "mom",
  contactName: "Mom",
  channel: "simulator",
  to: "+15550100001",
  question: "Was that you?",
  claim: "Says it's Mom.",
  sentAt: "2026-11-08T12:00:00.000Z",
  timeoutMs: 1000,
};
const at = new Date("2026-11-08T12:00:05.000Z");
const reply = (text: string) => interpretReply(request, { status: "replied", reply: { requestId: "ver_1", text, receivedAt: at.toISOString() } }, at).status;

describe("interpretReply", () => {
  it.each([
    ["No?? I'm at home, my phone is fine. That's not me!", "denied"],
    ["nope", "denied"],
    ["I didn't text anyone, that's a scam", "denied"],
    ["Yes that was me, new phone!", "confirmed"],
    ["yep", "confirmed"],
    ["No worries, it's me — I got a new number", "confirmed"],
    ["No, no fui yo. ¡Es una estafa!", "denied"],
    ["No, yo no envié nada", "denied"],
    ["Sí, soy yo", "confirmed"],
    ["Sí, es mi nuevo número", "confirmed"],
    ["wait what, I'm at work, haven't texted you. Someone's pretending to be me", "denied"],
    ["We will never call and ask you to read back a one-time code. That call was not us.", "denied"],
    ["who is this?", "unclear"],
    ["call me", "unclear"],
  ])("%s → %s", (text, expected) => {
    expect(reply(text)).toBe(expected);
  });

  it("reports timeouts and unreachable contacts without a reply", () => {
    expect(interpretReply(request, { status: "timeout" }, at)).toMatchObject({ status: "timeout", summary: "Mom didn't answer in time." });
    expect(interpretReply(request, { status: "unreachable" }, at).status).toBe("unreachable");
  });
});

describe("challenge + verify", () => {
  const scam = "Hi honey it's Mom, I broke my phone so this is my new number. Need you to grab 3 gift cards ($200 each) right now and text me the codes. Call me at (555) 010-7777 or see https://mom-help.top";

  it("asks the REAL contact at the registry handle, with no links or numbers from the message", async () => {
    const h = harness({ reply: "No, that's not me!" });
    const v = await h.run(makeEvent(scam, "+15550109999"));
    expect(h.requests).toHaveLength(1);
    const req = h.requests[0]!;
    expect(req.to).toBe(contacts[0]!.verifyVia.handle);
    expect(req.to).not.toBe("+15550109999");
    expect(req.question).not.toMatch(/https?:|\.top|\d{3}/);
    expect(req.question).toContain("gift cards");
    expect(v.label).toBe("scam");
    expect(v.verification).toMatchObject({ status: "denied", contactName: "Mom" });
    expect(v.headline).toBe("Someone is pretending to be Mom — the real Mom denied sending it.");
    expect(v.signals[0]).toMatchObject({ id: "verification_denied", weight: 4, source: "verification" });
    const types = h.trace.map((t) => t.type);
    expect(types.indexOf("verification.requested")).toBeLessThan(types.indexOf("verification.resolved"));
  });

  it("a confirmed 'new number' from Mom ends up safe", async () => {
    const h = harness({ reply: "Yes it's me! Got a new phone" });
    const v = await h.run(makeEvent("Hi sweetie it's Mom! New phone, this is my new number. Can you Venmo me $40 for groceries? Need it right now", "+15550107777"));
    expect(v.verification?.status).toBe("confirmed");
    expect(v.label).toBe("safe");
    expect(v.headline).toContain("confirmed");
  });

  it("no answer keeps it cautious with a wider band and 'call her' advice", async () => {
    const v = await harness().run(makeEvent("Hi it's Mom, this is my new number. Save it!", "+15550107777"));
    expect(v.verification?.status).toBe("timeout");
    expect(v.label).not.toBe("safe");
    expect(v.band[1] - v.band[0]).toBeGreaterThan(0.2);
    expect(v.recovery.some((s) => s.id === "call_saved_contact" && s.action?.target === "+15550100001")).toBe(true);
  });

  it("never challenges when the sender IS the contact's saved number", async () => {
    const h = harness({ reply: "yes" });
    await h.run(makeEvent("It's Mom, can you call me back?", "+15550100001"));
    expect(h.requests).toHaveLength(0);
    expect(stageTrace(h.trace, "challenge")).toEqual(["skipped"]);
  });

  it("generic phrases like 'call your bank' don't count as claiming to be the bank", async () => {
    const h = harness();
    await h.run(makeEvent("Reminder: if your card is lost, call your bank right away.", "+15550104000"));
    expect(h.requests).toHaveLength(0);
  });

  it("merely mentioning the bank doesn't ping the bank", async () => {
    const h = harness();
    const v = await h.run(makeEvent("I just opened a savings account at First Lone Star Bank, so happy!", "+15550104001"));
    expect(h.requests).toHaveLength(0);
    expect(v.label).toBe("safe");
  });

  it("the bank speaking as itself from an unknown number IS checked with the bank", async () => {
    const h = harness({ reply: "No, we did not send that. It's a scam." });
    const v = await h.run(makeEvent("First Lone Star Bank: your card is locked. Verify at https://fls-secure.xyz", "+15550104002"));
    expect(h.requests[0]?.contactId).toBe("bank");
    expect(v.verification?.status).toBe("denied");
    expect(v.scamType).toBe("bank_impersonation");
  });

  it("a near-certain scam with no answer still gets a scam headline", async () => {
    const v = await harness().run(makeEvent("First Lone Star Bank ALERT: your debit card has been locked due to suspicious activity. Verify your account now at https://firstlonestar-secure.xyz/login", "+15559990000"));
    expect(v.label).toBe("scam");
    expect(v.headline.startsWith("This is a fake bank alert")).toBe(true);
  });

  it("detects a grandparent scam on a call and asks the real grandson", async () => {
    const h = harness({ reply: "Wasn't me, I'm at school" });
    const v = await h.run(
      makeEvent("", "+15550106666", {
        kind: "call",
        transcript: [
          { speaker: "caller", text: "Grandma? It's me, your grandson. I was in an accident and I'm in jail.", atMs: 0 },
          { speaker: "caller", text: "I need $3,000 for bail. Please don't tell mom.", atMs: 4000 },
        ],
      }),
    );
    expect(h.requests[0]?.contactId).toBe("sam");
    expect(h.requests[0]?.question).toContain("calling");
    expect(v.headline).toBe("Someone is pretending to be Sam — the real Sam denied sending it.");
  });

  it("a host verify() that rejects becomes 'unreachable' instead of crashing", async () => {
    const h = harness({ verify: async () => Promise.reject(new Error("socket closed")) });
    const v = await h.run(makeEvent("It's Mom, new number, send $300 right now please", "+15550107777"));
    expect(v.verification?.status).toBe("unreachable");
  });
});
