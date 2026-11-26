#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
await mkdir(join(root, "tmp"), { recursive: true });
const tmp = await mkdtemp(join(root, "tmp", "smoke-"));
const workspace = join(tmp, "workspace");
const forgeHome = join(tmp, "forge-home");
const pidFile = join(tmp, "forge-nsh.pid");
await writeFile(join(tmp, "marker"), "smoke\n");

let child;
let output = "";
function cleanup() {
  if (child && child.exitCode === null) child.kill("SIGTERM");
}
process.on("exit", cleanup);

async function waitForReady(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const match = output.match(/\[forge-nsh\] ready: (http:\/\/\S+)/);
    if (match) return match[1];
    if (child.exitCode !== null) throw new Error(`launcher exited early\n${output}`);
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`launcher did not become ready\n${output}`);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parseError: text };
  }
  return { response, body };
}

try {
  child = spawn(process.execPath, [
    join(root, "scripts", "forge-nsh.mjs"),
    "--host",
    "127.0.0.1",
    "--port",
    "0",
    "--workspace",
    workspace,
    "--forge-home",
    forgeHome,
    "--pid-file",
    pidFile,
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });

  const base = await waitForReady();
  const index = await fetch(`${base}/`, { cache: "no-store" });
  const html = await index.text();
  if (!index.ok) throw new Error(`index returned ${index.status}`);
  if (!html.includes('<div id="app">')) throw new Error("index is not the packaged NSH page");
  const csp = index.headers.get("content-security-policy") ?? "";
  for (const part of ["script-src 'self' 'wasm-unsafe-eval'", "connect-src 'self' ws: wss:", "img-src 'self' blob: data:"]) {
    if (!csp.includes(part)) throw new Error(`CSP is missing ${part}: ${csp}`);
  }
  console.log(`smoke: index ok (${html.length} bytes)`);

  const wasmMatch = html.match(/["']([^"']+\.wasm)["']/);
  if (!wasmMatch) throw new Error("index does not name a wasm asset");
  const wasm = await fetch(`${base}/${wasmMatch[1]}`);
  if (!wasm.ok) throw new Error(`wasm returned ${wasm.status}`);
  const wasmType = wasm.headers.get("content-type") ?? "";
  if (!wasmType.startsWith("application/wasm")) throw new Error(`wasm MIME is ${wasmType}`);
  console.log(`smoke: wasm MIME ok (${wasmType})`);

  const connect = await fetchJson(`${base}/api/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
    },
    body: "{}",
  });
  if (!connect.response.ok) throw new Error(`connect returned ${connect.response.status}: ${JSON.stringify(connect.body)}`);
  if (!connect.body.clientId || !Number.isInteger(connect.body.cursor) || connect.body.workspace !== workspace) {
    throw new Error(`unexpected connect payload: ${JSON.stringify(connect.body)}`);
  }
  console.log(`smoke: /api/connect ok (client ${connect.body.clientId})`);

  const rpc = await fetchJson(`${base}/api/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "X-Forge-Client": connect.body.clientId,
    },
    body: JSON.stringify({ id: randomUUID(), method: "listSessions" }),
  });
  if (!rpc.response.ok || rpc.body.ok !== true || !Array.isArray(rpc.body.result)) {
    throw new Error(`listSessions through proxy failed: ${JSON.stringify(rpc.body)}`);
  }
  console.log("smoke: /api/rpc listSessions ok");
  console.log("smoke: PASS");
} finally {
  cleanup();
  await new Promise((done) => setTimeout(done, 300));
  await rm(tmp, { recursive: true, force: true });
}
