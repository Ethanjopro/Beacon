#!/usr/bin/env node
/**
 * Beacon one-command setup. Works on macOS, Linux and Windows. Needs only Node.
 *
 *   node scripts/setup.mjs           first-time setup: checks, install, .env, sanity check
 *   node scripts/setup.mjs --check   checks only (no install) — safe to run any time
 *
 * Plain Node, no dependencies, so it runs before `pnpm install`.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const isWin = process.platform === "win32";

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const ok = (msg) => console.log(`  ${green("✓")} ${msg}`);
const warn = (msg) => console.log(`  ${yellow("!")} ${msg}`);
const fail = (msg) => console.log(`  ${red("✗")} ${msg}`);

function run(cmd, args, { quiet = false } = {}) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: quiet ? "pipe" : "inherit", shell: isWin, encoding: "utf8" });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

let problems = 0;
console.log(bold("\nBeacon setup\n"));

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node ${process.versions.node}`);
else {
  fail(`Node ${process.versions.node} — need 22+. Install from https://nodejs.org (or: nvm install 22)`);
  process.exit(1);
}

// 2. pnpm (via corepack if missing)
let pnpm = run("pnpm", ["--version"], { quiet: true });
if (!pnpm.ok && !checkOnly) {
  warn("pnpm not found — enabling it with corepack");
  run("corepack", ["enable"], { quiet: true });
  pnpm = run("pnpm", ["--version"], { quiet: true });
  if (!pnpm.ok) {
    run("npm", ["install", "-g", "pnpm@10"], { quiet: true });
    pnpm = run("pnpm", ["--version"], { quiet: true });
  }
}
if (pnpm.ok) ok(`pnpm ${pnpm.out}`);
else {
  fail("pnpm not available. Run `corepack enable` (macOS/Linux may need sudo) or `npm i -g pnpm@10`, then re-run this script.");
  process.exit(1);
}

// 3. Dependencies
if (checkOnly) {
  if (existsSync(join(root, "node_modules"))) ok("dependencies installed");
  else {
    warn("dependencies not installed — run: node scripts/setup.mjs");
    problems++;
  }
} else {
  console.log("\n  Installing dependencies…\n");
  if (!run("pnpm", ["install"]).ok) {
    fail("pnpm install failed — scroll up for the error");
    process.exit(1);
  }
  ok("dependencies installed");
}

// 4. .env
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  if (checkOnly) {
    warn(".env missing — fine for mock mode; run setup to create it");
  } else {
    copyFileSync(join(root, ".env.example"), envPath);
    ok("created .env from .env.example (mock mode — no keys needed)");
  }
} else ok(".env present");

const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};

// 5. Modes (informational — mock is a fully working default)
if (env.LLM_PROVIDER === "nvidia" && env.NVIDIA_API_KEY) ok("LLM: NVIDIA Nemotron (live)");
else if (env.LLM_PROVIDER === "nvidia") {
  warn("LLM_PROVIDER=nvidia but NVIDIA_API_KEY is empty — will run in mock mode. Get a key at build.nvidia.com");
} else ok("LLM: mock mode (offline). SWE 1: set LLM_PROVIDER=nvidia + NVIDIA_API_KEY in .env for real Nemotron");

if (env.SPECTRUM_PROJECT_ID && env.SPECTRUM_PROJECT_SECRET) ok("Photon: credentials present");
else ok("Photon: terminal mode (no credentials). CENG 1: add SPECTRUM_PROJECT_ID/SECRET from app.photon.codes for real iMessage");

const tm = join(root, "data", "tmobile", "mapping.json");
if (existsSync(tm)) ok("T-Mobile data: mapping.json found");
else ok("T-Mobile data: not added yet. CENG 2: see data/tmobile/README.md");

// 6. Sanity check
if (!checkOnly) {
  console.log("\n  Running typecheck + tests (about a minute)…\n");
  if (run("pnpm", ["check"]).ok) ok("typecheck + tests pass");
  else {
    warn("typecheck/tests failed — someone may have pushed a break. Your agent can help: tell it to run `pnpm check` and fix it.");
    problems++;
  }
}

console.log(`
${bold(problems ? yellow("Setup finished with warnings (see above).") : green("You're set up."))}

${bold("Next:")}
  1. ${bold("pnpm dev")}                                  start server + phone UI
  2. open ${bold("http://localhost:5173")}
  3. ${bold("pnpm scenario mom-new-number-giftcards")}    (second terminal) fire a scam and watch Beacon catch it

${bold("Then open your AI coding agent in this folder and say:")}  "onboard me"
  (Claude Code users can also type ${bold("/onboard")})
`);
