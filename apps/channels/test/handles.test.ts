import { describe, expect, it } from "vitest";
import { normalizeHandle, sameHandle } from "../src/handles.js";

describe("normalizeHandle", () => {
  it("normalizes US phone formats to E.164", () => {
    for (const raw of ["(555) 010-0142", "555-010-0142", "5550100142", "1 555 010 0142", "+1 (555) 010-0142", "+15550100142"]) {
      expect(normalizeHandle(raw)).toBe("+15550100142");
    }
  });
  it("keeps other country codes", () => {
    expect(normalizeHandle("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("lowercases emails", () => {
    expect(normalizeHandle(" Mom@Example.com ")).toBe("mom@example.com");
  });
  it("compares across formats", () => {
    expect(sameHandle("+1 555-010-0142", "(555) 010 0142")).toBe(true);
    expect(sameHandle("+15550100142", "+15550100143")).toBe(false);
  });
});
