#!/usr/bin/env node
import { spawn } from "node:child_process";
import { openSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runDir = process.env.FORGE_NSH_RUN_DIR ? resolve(process.env.FORGE_NSH_RUN_DIR) : join(root, ".forge-nsh");
const pidFile = join(runDir, "service.pid");
const logFile = join(runDir, "service.log");

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function readPid() {
  try {
    const value = JSON.parse(readFileSync(pidFile, "utf8"));
    return typeof value.servicePid === "number" ? value : undefined;
  } catch { return undefined; }
}

const existing = readPid();
if (existing && alive(existing.servicePid)) {
  console.log(`Forge NSH is already running at ${existing.url ?? "unknown URL"} (pid ${existing.servicePid})`);
  process.exit(0);
}
mkdirSync(runDir, { recursive: true });
const out = openSync(logFile, "a");
const child = spawn(process.execPath, [join(root, "scripts", "forge-nsh.mjs"), ...process.argv.slice(2)], {
  cwd: root,
  detached: true,
  env: process.env,
  stdio: ["ignore", out, out],
});
child.unref();

const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  if (child.exitCode !== null) {
    console.error(`Forge NSH exited during startup with code ${child.exitCode}; see ${logFile}`);
    process.exit(child.exitCode ?? 1);
  }
  if (existsSync(pidFile)) {
    const info = readPid();
    if (info?.servicePid === child.pid) {
      console.log(`Forge NSH started: ${info.url} (pid ${child.pid}, core pid ${info.corePid})`);
      console.log(`Log: ${logFile}`);
      process.exit(0);
    }
  }
  await new Promise((done) => setTimeout(done, 120));
}
console.error(`Forge NSH did not report readiness; see ${logFile}`);
process.exit(1);
