import { describe, expect, it } from "vitest";
import { route, unwrapForward } from "../src/route.js";
import { request } from "./fixtures.js";

describe("route", () => {
  it("treats a message from a pending request's `to` handle as a verification reply (any phone format)", () => {
    const d = route({ senderId: "+15550100142", text: " No!! That's not me " }, [request()]);
    expect(d).toMatchObject({ kind: "verification-reply", requestId: "vr_1", text: "No!! That's not me" });
  });
  it("picks the most recent pending request for the same handle", () => {
    const d = route({ senderId: "5550100142", text: "no" }, [request(), request({ id: "vr_2", sentAt: "2026-11-08T11:00:00.000Z" })]);
    expect(d).toMatchObject({ requestId: "vr_2" });
  });
  it("other senders become photon events", () => {
    const d = route({ senderId: "+15559990000", text: "Hi mom it's me, new number" }, [request()]);
    expect(d.kind).toBe("new-event");
    if (d.kind === "new-event") {
      expect(d.event.source).toBe("photon");
      expect(d.event.body).toBe("Hi mom it's me, new number");
      expect(d.event.from.handle).toBe("+15559990000");
    }
  });
  it("forwards become source=forwarded with the wrapper stripped", () => {
    const d = route({ senderId: "+15551230000", text: "Fwd: Your USPS parcel is held. Pay fee now. Is this a scam?" }, []);
    expect(d.kind === "new-event" && d.event.source).toBe("forwarded");
    expect(d.kind === "new-event" && d.event.body).toBe("Your USPS parcel is held. Pay fee now.");
  });
});

describe("unwrapForward", () => {
  it("leaves ordinary text alone", () => {
    expect(unwrapForward("Dinner at 7?")).toEqual({ forwarded: false, body: "Dinner at 7?", originalSender: undefined });
  });
  it("extracts quoted lines", () => {
    const u = unwrapForward("is this legit?\n> Your account is locked\n> verify now");
    expect(u).toMatchObject({ forwarded: true, body: "Your account is locked verify now" });
  });
  it("unwraps quote marks around the message", () => {
    expect(unwrapForward('Is this a scam? "You won a prize, claim it"').body).toBe("You won a prize, claim it");
  });
  it("reads the original sender from a forward header", () => {
    const u = unwrapForward("---------- Forwarded message ---------\nFrom: +1 555 010 0199\n\nSend gift cards now");
    expect(u.forwarded).toBe(true);
    expect(u.originalSender).toBe("+1 555 010 0199");
    expect(u.body).toBe("Send gift cards now");
  });
  it("falls back to the original text if stripping empties it", () => {
    expect(unwrapForward("Is this a scam?").body).toBe("Is this a scam?");
  });
});
