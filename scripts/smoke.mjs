#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function waitFor(check, child, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited with code ${child.exitCode}`);
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await new Promise((done) => setTimeout(done, 120));
    }
  }
  throw lastError ?? new Error("timed out waiting for service");
}

const temp = await mkdtemp(join(tmpdir(), "forge-nsh-smoke-"));
const workspace = join(temp, "workspace");
const forgeHome = join(temp, "forge-home");
const runDir = join(temp, "run");
await mkdir(workspace, { recursive: true });
await mkdir(forgeHome, { recursive: true });
await mkdir(runDir, { recursive: true });
const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [
  join(root, "scripts", "forge-nsh.mjs"),
  "--host", "127.0.0.1",
  "--port", String(port),
  "--workspace", workspace,
  "--forge-home", forgeHome,
  "--run-dir", runDir,
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });

const results = [];
async function stop() {
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([
    new Promise((done) => child.once("exit", done)),
    new Promise((done) => setTimeout(done, 3500)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await rm(temp, { recursive: true, force: true });
}

try {
  await waitFor(async () => {
    const response = await fetch(`${url}/`, { cache: "no-store" });
    if (!response.ok) throw new Error(`index HTTP ${response.status}`);
    return response;
  }, child);

  const index = await fetch(`${url}/`, { cache: "no-store" });
  const html = await index.text();
  const csp = index.headers.get("content-security-policy") ?? "";
  if (!html.includes("id=\"nsh-app\"")) throw new Error("index does not contain the NSH app manifest");
  if (!csp.includes("script-src 'self' 'wasm-unsafe-eval'")) throw new Error("CSP lacks wasm script support");
  if (!csp.includes(`ws://127.0.0.1:${port}`)) throw new Error("CSP lacks WebSocket origin");
  results.push(`index ok (${html.length} bytes, CSP ok)`);

  const wasm = html.match(/"wasm":"([^"]+\.wasm)"/)?.[1];
  if (!wasm) throw new Error("wasm filename not found in index");
  const wasmResponse = await fetch(`${url}/${wasm}`);
  if (!wasmResponse.ok) throw new Error(`wasm HTTP ${wasmResponse.status}`);
  const wasmType = wasmResponse.headers.get("content-type");
  if (wasmType !== "application/wasm") throw new Error(`wasm MIME is ${wasmType}`);
  await wasmResponse.arrayBuffer();
  results.push(`wasm ok (${wasm}, ${wasmType})`);

  const connect = await fetch(`${url}/api/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url,
    },
    body: "{}",
  });
  if (!connect.ok) throw new Error(`/api/connect HTTP ${connect.status}: ${await connect.text()}`);
  const connected = await connect.json();
  if (!connected.clientId || !Number.isSafeInteger(connected.cursor)) {
    throw new Error("/api/connect returned no clientId/cursor");
  }
  results.push(`/api/connect ok (client ${connected.clientId.slice(0, 8)}, cursor ${connected.cursor})`);

  const rpc = await fetch(`${url}/api/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url,
      "X-Forge-Client": connected.clientId,
    },
    body: JSON.stringify({ id: crypto.randomUUID(), method: "listSessions" }),
  });
  if (!rpc.ok) throw new Error(`listSessions HTTP ${rpc.status}`);
  const listed = await rpc.json();
  if (!listed.ok || !Array.isArray(listed.result)) throw new Error("listSessions RPC failed");
  results.push(`proxied RPC listSessions ok (${listed.result.length} sessions)`);

  console.log("Forge NSH smoke test passed:");
  for (const line of results) console.log(`- ${line}`);
} catch (error) {
  console.error("Forge NSH smoke test failed:", error instanceof Error ? error.message : error);
  console.error("--- service output ---");
  console.error(output.split("\n").slice(-80).join("\n"));
  process.exitCode = 1;
} finally {
  await stop();
}
