#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDir = join(root, "vendor", "forge-core");
const args = new Set(process.argv.slice(2));
const coreOnly = args.has("--core-only");
const webOnly = args.has("--web-only");
const force = args.has("--force");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}`);
  }
}

function have(command, versionArg = "--version") {
  const result = spawnSync(command, [versionArg], { stdio: "ignore" });
  return result.status === 0;
}

if (!have("node")) throw new Error("Node.js is required (>=22.23.1 <23).");
if (!have("pnpm")) throw new Error("pnpm 11 is required. Enable it with corepack or install pnpm.");

if (!webOnly) {
  if (!existsSync(join(coreDir, "package.json"))) {
    console.log("[build] initializing vendor/forge-core submodule");
    run("git", ["submodule", "update", "--init", "--recursive", "vendor/forge-core"]);
  }
  const coreDist = join(coreDir, "dist", "web", "serve.js");
  const coreModules = join(coreDir, "node_modules");
  if (force || !existsSync(coreModules)) {
    console.log("[build] installing Forge Core dependencies");
    run("pnpm", ["install", "--frozen-lockfile"], { cwd: coreDir });
  }
  if (force || !existsSync(coreDist)) {
    console.log("[build] building Forge Core");
    run("pnpm", ["build"], { cwd: coreDir });
  } else {
    console.log("[build] Forge Core dist present; skipping (use --force to rebuild)");
  }
}

if (!coreOnly) {
  if (!have("nsh")) {
    throw new Error("nsh is required on PATH. Install NSH 0.7.1 first: https://nsh.dev/docs/installation");
  }
  console.log("[build] type-checking NSH app");
  run("nsh", ["check", "App.tsx"]);
  console.log("[build] packaging NSH web app");
  run("nsh", ["package", "App.tsx", "--target", "web"]);
}

console.log("[build] complete");
