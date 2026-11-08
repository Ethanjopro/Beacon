/** What the bridge needs from a messaging backend. Spectrum and stdin both implement it. */
export interface InboundMessage {
  senderId: string;
  displayName?: string;
  text: string;
  /** Reply in the same chat. */
  reply(text: string): Promise<void>;
}

export interface Transport {
  readonly name: string;
  messages(): AsyncIterable<InboundMessage>;
  /** Start a conversation with a handle that has not messaged us (outbound verification). */
  sendTo(handle: string, text: string): Promise<void>;
  stop(): Promise<void>;
}
