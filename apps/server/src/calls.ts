/**
 * Live call sessions: the host side of `ScreenerDeps.listen`. Caller speech
 * arrives from three places and lands in the same queue:
 *   - a sim scenario's script (one line each time the screener listens),
 *   - POST /api/calls/:id/say (a judge typing, or live speech-to-text),
 *   - the normalized Photon event's first words.
 * Nothing here is stored beyond the life of the call.
 */
interface Session {
  queue: string[];
  script: string[];
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

  open(callId: string, init: { firstWords?: string; script?: string[] } = {}): void {
    const queue = init.firstWords?.trim() ? [init.firstWords.trim()] : [];
    this.sessions.set(callId, { queue, script: [...(init.script ?? [])], closed: false });
  }

  has(callId: string): boolean {
    const s = this.sessions.get(callId);
    return Boolean(s && !s.closed);
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
