import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset, type DatasetName } from "./datasets.js";
import { compareBaseline, computeMetrics } from "./metrics.js";
import { buildReport, renderConsole, writeReport } from "./report.js";
import { runEval } from "./run.js";

/** Repo root, resolved from this file (packages/scenarios/src/eval → ../../../..). */
export const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

export interface EvalArgs {
  dataset: DatasetName;
  provider: "mock" | "nvidia";
  limit?: number;
}

export function parseEvalArgs(argv: string[]): EvalArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dataset = get("--dataset") ?? "library";
  const provider = get("--provider") ?? "mock";
  if (dataset !== "library" && dataset !== "tmobile") throw new Error(`--dataset must be library or tmobile (got ${dataset})`);
  if (provider !== "mock" && provider !== "nvidia") throw new Error(`--provider must be mock or nvidia (got ${provider})`);
  const limitRaw = get("--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && !(limit! > 0)) throw new Error("--limit must be a positive number");
  return { dataset, provider, limit };
}

/** Run an eval end to end: load, score, print, write reports. Missing dataset → message, exit 0. */
export async function evalCommand(argv: string[]): Promise<void> {
  const args = parseEvalArgs(argv);
  const data = loadDataset(args.dataset, resolve(REPO_ROOT, "data/tmobile"));
  if (!data.ok) {
    console.log(data.message);
    return;
  }
  const items = args.limit ? data.items.slice(0, args.limit) : data.items;
  console.log(`Evaluating ${items.length} items from "${args.dataset}" with provider=${args.provider}...`);
  const preds = await runEval(items, { provider: args.provider });
  const baselineMap = new Map(items.filter((i) => i.baseline !== undefined).map((i) => [i.id, i.baseline!]));
  const report = buildReport(args.dataset, args.provider, preds, computeMetrics(preds), compareBaseline(preds, baselineMap));
  const paths = writeReport(resolve(REPO_ROOT, "reports"), report);
  console.log(renderConsole(report));
  console.log(`\nWrote ${paths.md}\n      ${paths.json}`);
}
