import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadTmobile, mapTmobileCategory, parseCsv, tmobileItemToEvent } from "../src/tmobile/index.js";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("csv parser", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines, CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n"l1\nl2",z\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["l1\nl2", "z"]]);
  });
  it("handles BOM, no trailing newline, empty fields", () => {
    expect(parseCsv("﻿a,b\n1,")).toEqual([["a", "b"], ["1", ""]]);
  });
});

describe("taxonomy mapping", () => {
  it("maps by keyword with other as fallback", () => {
    expect(mapTmobileCategory("Toll Notice")).toBe("toll_smishing");
    expect(mapTmobileCategory("Package Delivery Scam")).toBe("delivery_smishing");
    expect(mapTmobileCategory("Bank Fraud Alert")).toBe("bank_impersonation");
    expect(mapTmobileCategory("Crypto Investment")).toBe("investment_crypto");
    expect(mapTmobileCategory("legit")).toBe("none");
    expect(mapTmobileCategory("Zebra")).toBe("other");
    expect(mapTmobileCategory("")).toBe("other");
  });
});

describe("tmobile adapter", () => {
  it("loads the synthetic fixture", () => {
    const res = loadTmobile(fixtures);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(4); // empty-text row skipped
    const [toll, legit, family, unknown] = res.items;
    expect(toll).toMatchObject({ isScam: true, type: "toll_smishing", baseline: true });
    expect(legit).toMatchObject({ isScam: false, type: "none", baseline: false });
    expect(legit!.text).toBe("Lunch at noon?\nBring the notes, ok");
    expect(family).toMatchObject({ isScam: true, type: "family_emergency", baseline: false });
    expect(family!.text).toContain('"call me"');
    expect(unknown!.type).toBe("other");
    const ev = tmobileItemToEvent(toll!);
    expect(ev.body).toContain("toll balance");
  });

  it("returns a clear message for a missing directory", () => {
    const res = loadTmobile("/nonexistent/beacon/tmobile");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("No T-Mobile data directory");
  });
});
