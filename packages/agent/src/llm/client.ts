/**
 * Minimal OpenAI-compatible chat-completions client over fetch (NVIDIA NIM),
 * with per-call timeout, one retry, an overall deadline, and a tool loop.
 * No SDK dependency — keeps the agent a pure library.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: readonly unknown[];
  /** "none" forces a final answer while keeping tool definitions (some backends need them with tool messages). */
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
  /** Provider-specific fields merged into the request body (e.g. NIM `chat_template_kwargs`). */
  extraBody?: Record<string, unknown>;
}

export interface LlmClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch: typeof fetch;
  /** Per request. */
  timeoutMs: number;
  /** Whole conversation (all rounds + retries). */
  deadlineMs: number;
  /** Called right before each request leaves the device (privacy ledger). */
  onDispatch?: (model: string) => void;
}

export class LlmError extends Error {}

/**
 * NVIDIA's free tier allows roughly 10 requests a minute per key, and one screened call needs
 * 6–12. NVIDIA_API_KEY may hold several comma-separated keys: requests use one key until it's
 * throttled (429), then move to the next. The position is shared by every client in the process.
 */
const keyCursor = new Map<string, number>();
const keysOf = (raw: string) => raw.split(",").map((k) => k.trim()).filter(Boolean);
function currentKey(raw: string): string {
  const keys = keysOf(raw);
  return keys[(keyCursor.get(raw) ?? 0) % keys.length] ?? raw;
}
/** Moves to the next key; false when there's only one (nothing to rotate to). */
function rotateKey(raw: string): boolean {
  const keys = keysOf(raw);
  if (keys.length < 2) return false;
  keyCursor.set(raw, ((keyCursor.get(raw) ?? 0) + 1) % keys.length);
  return true;
}

export class LlmClient {
  private readonly deadline: number;

  constructor(private readonly opts: LlmClientOptions) {
    this.deadline = Date.now() + opts.deadlineMs;
  }

  /** One completion, with one retry on timeout / network error / 5xx / 429 / empty reply. */
  async chat(req: ChatRequest): Promise<Extract<ChatMessage, { role: "assistant" }>> {
    let lastError: unknown;
    // Up to 2 tries normally; rate limits (429) get up to 5 tries with growing waits (1 s, 2 s, 4 s, 8 s).
    for (let attempt = 0; attempt < 5; attempt++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) break;
      try {
        return await this.once(req, Math.min(this.opts.timeoutMs, remaining));
      } catch (err) {
        lastError = err;
        const rateLimited = err instanceof LlmError && /HTTP 429\b/.test(err.message);
        // Several keys ("k1,k2,k3"): a throttled key hands over to the next one right away.
        if (rateLimited && this.opts.apiKey) rotateKey(this.opts.apiKey);
        if (err instanceof LlmError && /HTTP 4(0[0-9]|1[0-9])\b/.test(err.message) && !/HTTP 408/.test(err.message)) break; // client errors won't fix themselves
        if (!rateLimited && attempt >= 1) break;
        if (rateLimited) {
          const wait = Math.min(1000 * 2 ** attempt, Math.max(0, this.deadline - Date.now() - 1000));
          if (wait <= 0) break;
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new LlmError("LLM deadline exceeded");
  }

  private async once(req: ChatRequest, timeoutMs: number): Promise<Extract<ChatMessage, { role: "assistant" }>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LlmError(`LLM timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });
    const body = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048, // reasoning models spend tokens in <think> before the JSON
      ...(req.tools?.length ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
      ...req.extraBody,
    };
    this.opts.onDispatch?.(req.model);
    try {
      const res = await Promise.race([
        this.opts.fetch(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(this.opts.apiKey ? { authorization: `Bearer ${currentKey(this.opts.apiKey)}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (!res.ok) throw new LlmError(`HTTP ${res.status} from model API`);
      const json = (await Promise.race([res.json(), timeout])) as { choices?: { message?: Extract<ChatMessage, { role: "assistant" }> }[] };
      const message = json.choices?.[0]?.message;
      if (!message || (!message.content && !message.tool_calls?.length)) throw new LlmError("empty reply from model API");
      return { role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** May be async: the screener's callback tool waits for a real person to answer. */
export type ToolExecutor = (name: string, args: Record<string, unknown>) => unknown;

/**
 * Runs the tool-calling loop: up to `maxRounds` completions; tool calls are
 * executed locally and fed back. The last round sets tool_choice "none" to
 * force a final answer. Returns the final text content.
 */
export async function runToolLoop(
  client: LlmClient,
  req: ChatRequest,
  execute: ToolExecutor,
  maxRounds = 4,
  /** Force a tool call in the first round (models that skip tools without hidden reasoning). */
  firstRound: "auto" | "required" = "auto",
): Promise<{ content: string; messages: ChatMessage[] }> {
  const messages = [...req.messages];
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1;
    const reply = await client.chat({ ...req, messages, toolChoice: last ? "none" : round === 0 ? firstRound : "auto" });
    messages.push(reply);
    if (!reply.tool_calls?.length) return { content: reply.content ?? "", messages };
    for (const call of reply.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        // Malformed tool arguments: run with none; the tool reports what's missing.
      }
      const result = await execute(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new LlmError("model kept calling tools without answering");
}
