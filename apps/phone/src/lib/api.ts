import {
  API,
  CreatedCall,
  CreatedEvent,
  EventDetail,
  HealthResponse,
  PublicContact,
  ScenarioSummary,
  VerificationOutcome,
  VerificationRequest,
  type NewCall,
  type ReplyBody,
} from "@beacon/shared";
import { z } from "zod";

/**
 * Typed fetch helpers over the shared `API` routes. Every response is parsed
 * with the shared zod schema, so a contract drift shows up as a clear error
 * instead of a half-rendered screen.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function request<T>(fetchImpl: FetchLike, url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Can't reach the Magenta-Guard server.");
  }
  if (!res.ok) throw new ApiError(`${init?.method ?? "GET"} ${url} failed (${res.status})`, res.status);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError(`Unexpected response from ${url}`);
  return parsed.data;
}

const Ok = z.object({ ok: z.literal(true) });

export function createApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
  const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  return {
    health: () => request(fetchImpl, API.health, HealthResponse),
    event: (id: string) => request(fetchImpl, API.event(id), EventDetail),
    contacts: () => request(fetchImpl, API.contacts, z.array(PublicContact)),
    scenarios: () => request(fetchImpl, API.scenarios, z.array(ScenarioSummary)),
    fireScenario: (id: string) => request(fetchImpl, API.fireScenario(id), CreatedEvent, post()),
    pendingVerifications: () => request(fetchImpl, API.pendingVerifications, z.array(VerificationRequest)),
    replyToVerification: (id: string, body: ReplyBody) =>
      request(fetchImpl, API.verificationReply(id), VerificationOutcome, post(body)),
    reset: () => request(fetchImpl, API.reset, Ok, post()),
    startCall: (body: NewCall) => request(fetchImpl, API.calls, CreatedCall, post(body)),
    say: (callId: string, text: string) => request(fetchImpl, API.callSay(callId), Ok, post({ text })),
  };
}

export type BeaconApi = ReturnType<typeof createApi>;
