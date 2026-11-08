/** Minimal Server-Sent Events parser: feed it arbitrary text chunks, get whole messages back. */
export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];
  private id: string | undefined;

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    // Lines end with \n, \r\n or \r. A trailing lone \r may be half of \r\n, so hold it back.
    const lines = this.buffer.split(/\r\n|\n|\r(?!$)/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        if (this.data.length > 0) {
          out.push({ event: this.event || "message", data: this.data.join("\n"), id: this.id });
        }
        this.event = "";
        this.data = [];
        this.id = undefined;
      } else if (line.startsWith(":")) {
        // comment / keep-alive
      } else {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") this.event = value;
        else if (field === "data") this.data.push(value);
        else if (field === "id") this.id = value;
      }
    }
    return out;
  }
}
