import { describe, expect, it } from "vitest";
import { SseParser } from "../src/sse.js";

describe("SseParser", () => {
  it("parses a whole message", () => {
    const p = new SseParser();
    expect(p.push('event: trace\ndata: {"a":1}\n\n')).toEqual([{ event: "trace", data: '{"a":1}', id: undefined }]);
  });
  it("handles arbitrary chunk boundaries, including mid-line and mid-CRLF", () => {
    const wire = 'id: 7\r\nevent: trace\r\ndata: {"seq":7}\r\n\r\n: keepalive\n\nevent: trace\ndata: two\n\n';
    for (let size = 1; size <= wire.length; size += 3) {
      const p = new SseParser();
      const out = [];
      for (let i = 0; i < wire.length; i += size) out.push(...p.push(wire.slice(i, i + size)));
      expect(out.map((m) => m.data)).toEqual(['{"seq":7}', "two"]);
      expect(out[0]!.id).toBe("7");
    }
  });
  it("joins multi-line data and defaults the event name", () => {
    const p = new SseParser();
    expect(p.push("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb", id: undefined }]);
  });
  it("ignores comment-only blocks", () => {
    expect(new SseParser().push(": ping\n\n")).toEqual([]);
  });
});
