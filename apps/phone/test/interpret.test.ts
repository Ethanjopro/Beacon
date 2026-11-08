import { describe, expect, it } from "vitest";
import { interpretReply } from "../src/mock/interpret";

describe("interpretReply (mock)", () => {
  it.each([
    ["No?? That's not me!", "denied"],
    ["No, I'm in class. That's not me!", "denied"],
    ["nope", "denied"],
    ["Yes that was me", "confirmed"],
    ["yeah it's me, sorry", "confirmed"],
    ["who is this?", "unclear"],
  ] as const)("%s → %s", (text, expected) => {
    expect(interpretReply(text)).toBe(expected);
  });
});
