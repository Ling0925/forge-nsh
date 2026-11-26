#!/usr/bin/env node
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runDir = process.env.FORGE_NSH_RUN_DIR ? resolve(process.env.FORGE_NSH_RUN_DIR) : join(root, ".forge-nsh");
const pidFile = join(runDir, "service.pid");

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function terminate(pid) {
  if (!pid || !alive(pid)) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
}
async function waitExit(pid, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((done) => setTimeout(done, 100));
  }
  return !alive(pid);
}

let info;
try {
  info = JSON.parse(readFileSync(pidFile, "utf8"));
} catch {
  console.log("Forge NSH is not running (no pid file).");
  process.exit(0);
}
terminate(info.servicePid);
const stopped = await waitExit(info.servicePid, 5000);
if (!stopped && info.servicePid) {
  try { process.kill(info.servicePid, "SIGKILL"); } catch {}
}
terminate(info.corePid);
await waitExit(info.corePid, 1500);
rmSync(pidFile, { force: true });
console.log("Forge NSH stopped.");
