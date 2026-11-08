/**
 * The privacy ledger: an honest record of what left the device, rendered as
 * Verdict.privacy and streamed as `privacy` traces.
 */
import type { PrivacyReport } from "@beacon/shared";
import type { RedactionResult } from "./redact.js";

export class PrivacyLedger {
  private sent = false;
  private readonly models = new Set<string>();
  private readonly notes: string[] = [];

  constructor(private readonly redactions: RedactionResult["counts"]) {}

  /** Call BEFORE dispatching any request: if it was dispatched, data left the device even if it failed. */
  recordCloudCall(model: string): void {
    this.sent = true;
    this.models.add(model);
  }

  get sentToCloud(): boolean {
    return this.sent;
  }

  note(text: string): void {
    if (!this.notes.includes(text)) this.notes.push(text);
  }

  report(): PrivacyReport {
    const redactions: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.redactions)) if (v) redactions[k] = v;
    return {
      sentToCloud: this.sent,
      model: this.sent ? [...this.models].join(", ") : undefined,
      redactions,
      notes: [...this.notes],
    };
  }
}
