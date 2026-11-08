/**
 * The agent's tools, shared by the Nemotron tool loop and the mock brain so
 * both produce identical `tool` traces. Tools only ever see redacted text and
 * contact projections.
 */
import { addSignal, type RunContext } from "../pipeline/context.js";
import { lookupContact } from "./contacts.js";
import { checkLink, parseLink } from "./links.js";
import { libraryWeight, searchScamLibrary } from "./library.js";

/** OpenAI-style tool schemas sent to Nemotron. */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "lookup_contact",
      description:
        "Look up one of the user's trusted contacts by reference (e.g. CONTACT_2) or role word (e.g. 'mom', 'your bank'). Returns relationship, whether the sender is one of their saved handles, and official domains for organizations.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "CONTACT_n reference or a role word" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_link",
      description: "Inspect a URL from the message offline (look-alike domains, punycode, risky TLDs, shorteners, not the claimed org's domain). Never visits the link.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          claimed_contact: { type: "string", description: "Optional CONTACT_n the message claims to be from" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_scam_library",
      description: "Find known scam (and known legitimate) message patterns similar to the given text.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["function"]["name"];

/** Executes a tool, emits `tool` called/result traces, and returns a JSON-able result for the model. */
export function runTool(ctx: RunContext, name: string, args: Record<string, unknown>): unknown {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  switch (name) {
    case "lookup_contact": {
      const query = str("query");
      ctx.emit({ type: "tool", name, status: "called", summary: `Who is "${query.slice(0, 40)}"?` });
      const found = lookupContact(query, ctx.contacts, ctx.event.from.handle);
      ctx.emit({
        type: "tool",
        name,
        status: "result",
        summary: found
          ? `${found.isOrganization ? "Trusted organization" : `Trusted ${found.relationship} contact`} — sender ${found.senderIsKnownHandle ? "IS" : "is NOT"} one of their saved numbers`
          : "Not in your trusted contacts",
      });
      return found ?? { found: false };
    }
    case "check_link": {
      const url = str("url");
      const link = parseLink(url);
      ctx.emit({ type: "tool", name, status: "called", summary: `Inspecting ${link?.host ?? "a link"} (offline — never opened)` });
      if (!link) {
        ctx.emit({ type: "tool", name, status: "error", summary: "Couldn't parse that link" });
        return { error: "unparseable url" };
      }
      const claimRef = /contact_(\d+)/i.exec(str("claimed_contact"));
      const claimedOrg = claimRef ? ctx.contacts[Number(claimRef[1]) - 1] : ctx.claim?.contact;
      const findings = checkLink(link, ctx.contacts, claimedOrg);
      const red = findings.filter((f) => f.weight > 0);
      ctx.emit({
        type: "tool",
        name,
        status: "result",
        summary: red.length ? `${link.registrable}: ${red.map((f) => f.title.toLowerCase()).join("; ")}` : findings.length ? findings[0]!.title : `${link.registrable}: no red flags`,
      });
      return { domain: link.registrable, findings: findings.map(({ id, title, weight }) => ({ id, title, weight })) };
    }
    case "search_scam_library": {
      const text = str("text") || ctx.redacted.text;
      ctx.emit({ type: "tool", name, status: "called", summary: "Comparing with known scam patterns" });
      const matches = searchScamLibrary(text);
      const top = matches[0];
      const weight = top ? libraryWeight(top) : 0;
      ctx.emit({
        type: "tool",
        name,
        status: "result",
        summary: top ? `Closest match: ${top.pattern.title} (${Math.round(top.similarity * 100)}% of telltale phrases)` : "No close match in the library",
      });
      if (top && weight !== 0) {
        const legit = top.pattern.scamType === "none";
        addSignal(ctx, {
          id: legit ? "library_legit_match" : "library_match",
          title: legit ? `Looks like a known legit message: ${top.pattern.title.toLowerCase()}` : `Matches a known scam: ${top.pattern.title.toLowerCase()}`,
          detail: `Shares ${top.matchedCues.length} of ${top.pattern.cues.length} telltale phrases with this pattern.`,
          weight,
          source: "tool",
        });
      }
      return matches.map((m) => ({ id: m.pattern.id, scamType: m.pattern.scamType, title: m.pattern.title, similarity: Math.round(m.similarity * 100) / 100 }));
    }
    default:
      ctx.emit({ type: "tool", name, status: "error", summary: `Unknown tool ${name}` });
      return { error: `unknown tool ${name}` };
  }
}
