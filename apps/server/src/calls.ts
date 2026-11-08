/**
 * Live call sessions: the host side of `ScreenerDeps.listen`. Caller speech
 * arrives from three places and lands in the same queue:
 *   - a sim scenario's script (one line each time the screener listens),
 *   - POST /api/calls/:id/say (a judge typing, or live speech-to-text),
 *   - the normalized Photon event's first words.
 * Nothing here is stored beyond the life of the call.
 */
import { normalizeHandle } from "./normalize.js";

interface Session {
  handle?: string;
  queue: string[];
  script: string[];
  /** A sim caller with a script: once the script is used up, they've hung up. */
  scripted: boolean;
  waiter?: { resolve: (words: string | null) => void; timer: ReturnType<typeof setTimeout> };
  scriptTimer?: ReturnType<typeof setTimeout>;
  closed: boolean;
}

export interface CallSessionOptions {
  /** Pause before a scripted caller line is "spoken" (sim realism). Tests use ~0. */
  scriptDelayMs?: number;
}

export class CallSessions {
  private sessions = new Map<string, Session>();

  constructor(private readonly options: CallSessionOptions = {}) {}

  open(callId: string, init: { handle?: string; firstWords?: string; script?: string[] } = {}): void {
    const queue = init.firstWords?.trim() ? [init.firstWords.trim()] : [];
    this.sessions.set(callId, { handle: init.handle, queue, script: [...(init.script ?? [])], scripted: (init.script?.length ?? 0) > 0, closed: false });
  }

  has(callId: string): boolean {
    const s = this.sessions.get(callId);
    return Boolean(s && !s.closed);
  }

  /** Finds a live session by caller handle (e.g. to route incoming webhook messages to an active call). */
  findByHandle(handle: string): string | undefined {
    const norm = normalizeHandle(handle);
    for (const [id, s] of this.sessions) {
      if (!s.closed && s.handle && normalizeHandle(s.handle) === norm) {
        return id;
      }
    }
    return undefined;
  }

  /** The caller says something. Returns false if the call is unknown or over. */
  say(callId: string, text: string): boolean {
    const s = this.sessions.get(callId);
    if (!s || s.closed || !text.trim()) return false;
    if (s.waiter) {
      const { resolve, timer } = s.waiter;
      s.waiter = undefined;
      clearTimeout(timer);
      resolve(text.trim());
    } else {
      s.queue.push(text.trim());
    }
    return true;
  }

  /** Pass as `ScreenerDeps.listen`. Always resolves: words, or null on silence / hang-up. */
  listen = (callId: string, timeoutMs: number): Promise<string | null> =>
    new Promise((resolve) => {
      const s = this.sessions.get(callId);
      if (!s || s.closed) return resolve(null);
      const queued = s.queue.shift();
      if (queued !== undefined) return resolve(queued);
      if (s.scripted && s.script.length === 0) return resolve(null); // the scripted caller has nothing left to say
      if (s.waiter) {
        // Only one listener at a time; the older one gives up.
        clearTimeout(s.waiter.timer);
        s.waiter.resolve(null);
      }
      s.waiter = {
        resolve,
        timer: setTimeout(() => {
          if (s.waiter?.resolve === resolve) s.waiter = undefined;
          resolve(null);
        }, timeoutMs),
      };
      const next = s.script.shift();
      if (next !== undefined) s.scriptTimer = setTimeout(() => this.say(callId, next), this.options.scriptDelayMs ?? 1_400);
    });

  /** The call ended: wake any listener with null and forget the session. */
  close(callId: string): void {
    const s = this.sessions.get(callId);
    if (!s) return;
    s.closed = true;
    if (s.scriptTimer) clearTimeout(s.scriptTimer);
    if (s.waiter) {
      clearTimeout(s.waiter.timer);
      s.waiter.resolve(null);
      s.waiter = undefined;
    }
    this.sessions.delete(callId);
  }

  clear(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
