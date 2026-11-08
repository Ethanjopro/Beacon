import { DEFAULT_SERVER_PORT } from "@beacon/shared";

export type ProviderName = "terminal" | "imessage";

export interface ChannelsConfig {
  provider: ProviderName;
  serverUrl: string;
  spectrum?: { projectId: string; projectSecret: string };
  /** Handle used for lines typed in terminal mode. */
  terminalSender: string;
  /** Human-readable notes (e.g. "fell back to terminal because …") to print at startup. */
  warnings: string[];
}

/** Pure: env → config. Missing iMessage credentials fall back to terminal with a warning. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ChannelsConfig {
  const warnings: string[] = [];
  const serverUrl = (env.BEACON_SERVER_URL?.trim() || `http://localhost:${DEFAULT_SERVER_PORT}`).replace(/\/+$/, "");
  const requested = (env.CHANNELS_PROVIDER?.trim().toLowerCase() || "terminal") as string;
  const projectId = env.SPECTRUM_PROJECT_ID?.trim();
  const projectSecret = env.SPECTRUM_PROJECT_SECRET?.trim();

  let provider: ProviderName = "terminal";
  let spectrum: ChannelsConfig["spectrum"];
  if (requested === "imessage") {
    if (projectId && projectSecret) {
      provider = "imessage";
      spectrum = { projectId, projectSecret };
    } else {
      warnings.push(
        "CHANNELS_PROVIDER=imessage needs SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET " +
          "(get them at app.photon.codes). Falling back to the terminal provider.",
      );
    }
  } else if (requested !== "terminal") {
    warnings.push(`Unknown CHANNELS_PROVIDER "${requested}" (use terminal or imessage). Using terminal.`);
  }

  return {
    provider,
    serverUrl,
    spectrum,
    terminalSender: env.CHANNELS_TERMINAL_SENDER?.trim() || "+15550100001",
    warnings,
  };
}
