import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults to terminal and localhost:8787", () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ provider: "terminal", serverUrl: "http://localhost:8787", warnings: [] });
  });
  it("imessage without creds falls back with a warning", () => {
    const c = loadConfig({ CHANNELS_PROVIDER: "imessage" });
    expect(c.provider).toBe("terminal");
    expect(c.warnings[0]).toMatch(/SPECTRUM_PROJECT_ID/);
  });
  it("imessage with creds", () => {
    const c = loadConfig({ CHANNELS_PROVIDER: "imessage", SPECTRUM_PROJECT_ID: "p", SPECTRUM_PROJECT_SECRET: "s", BEACON_SERVER_URL: "http://x:1/" });
    expect(c).toMatchObject({ provider: "imessage", spectrum: { projectId: "p", projectSecret: "s" }, serverUrl: "http://x:1" });
  });
});
