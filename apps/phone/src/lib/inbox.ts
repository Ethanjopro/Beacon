import type { PublicContact } from "@beacon/shared";
import { threadKeyOf, type EventView, type PhoneState } from "../state/reducer";
import { contactForHandle, formatHandle } from "./format";

/**
 * The Messages list: live conversations (from Beacon events) on top of a few
 * seeded, synthetic threads so the phone looks lived-in on stage.
 */

export interface SeedMessage {
  fromMe: boolean;
  text: string;
  time: string;
}

export interface SeedThread {
  handle: string;
  name: string;
  messages: SeedMessage[];
}

export const SEED_THREADS: SeedThread[] = [
  {
    handle: "+15550100001",
    name: "Mom",
    messages: [
      { fromMe: false, text: "Did you get home ok?", time: "Yesterday" },
      { fromMe: true, text: "Yep! Thanks for dinner ❤️", time: "Yesterday" },
    ],
  },
  {
    handle: "+15550100031",
    name: "Jordan",
    messages: [{ fromMe: false, text: "Running 10 min late, save me a seat", time: "Tuesday" }],
  },
  {
    handle: "+15550100077",
    name: "Oakridge Pharmacy",
    messages: [{ fromMe: false, text: "Your prescription is ready for pickup.", time: "Monday" }],
  },
];

export interface Conversation {
  key: string;
  handle: string;
  name: string;
  saved: boolean;
  preview: string;
  time?: string;
  /** Newest Beacon-checked event in this conversation. */
  latest?: EventView;
  seed?: SeedThread;
}

export function buildConversations(state: PhoneState, contacts: PublicContact[]): Conversation[] {
  const deleted = new Set(state.deletedKeys ?? []);
  const live = new Map<string, Conversation>();
  for (const id of state.order) {
    const view = state.byId[id];
    if (!view?.event) continue;
    const key = threadKeyOf(view.event);
    if (deleted.has(key) || deleted.has(view.event.from.handle)) continue;
    if (live.has(key)) continue; // order is newest first
    const handle = view.event.from.handle;
    const seed = SEED_THREADS.find((s) => s.handle === handle);
    const contact = contactForHandle(contacts, handle);
    live.set(key, {
      key,
      handle,
      name: contact?.name ?? seed?.name ?? formatHandle(handle),
      saved: Boolean(contact ?? seed),
      preview: view.event.kind === "call" ? "Phone call" : view.event.body,
      time: view.event.receivedAt,
      latest: view,
      seed,
    });
  }
  const seeds = SEED_THREADS.filter((s) => !live.has(s.handle) && !deleted.has(s.handle)).map<Conversation>((s) => ({
    key: s.handle,
    handle: s.handle,
    name: s.name,
    saved: true,
    preview: s.messages[s.messages.length - 1]?.text ?? "",
    seed: s,
  }));
  return [...live.values(), ...seeds];
}

export function seedFor(handle: string): SeedThread | undefined {
  return SEED_THREADS.find((s) => s.handle === handle);
}
