#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const keep = process.argv.includes("--keep");
const coreRequire = createRequire(join(root, "vendor", "forge-core", "package.json"));
const { WebSocket } = coreRequire("ws");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited early with ${child.exitCode}\n${output.text}`);
    const line = output.text.split("\n").find((item) => item.startsWith('{"type":"ready"'));
    if (line) return JSON.parse(line);
    await wait(100);
  }
  throw new Error(`service did not report readiness\n${output.text}`);
}

async function waitForSocketMessage(socket, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for event batch")), timeoutMs);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "forge-nsh-smoke-workspace-"));
  const forgeHome = mkdtempSync(join(tmpdir(), "forge-nsh-smoke-home-"));
  writeFileSync(join(workspace, "smoke.txt"), "forge-nsh smoke fixture\n", "utf8");
  const output = { text: "" };
  const child = spawn(process.execPath, [
    join(root, "scripts", "forge-nsh.mjs"),
    "serve",
    "--port",
    "0",
    "--workspace",
    workspace,
    "--forge-home",
    forgeHome,
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output.text += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output.text += String(chunk);
  });

  let socket;
  try {
    const ready = await waitForReady(child, output);
    const port = ready.port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`[smoke] service ready on ${base}; core on 127.0.0.1:${ready.corePort}`);

    const health = await fetch(`${base}/healthz`);
    assert(health.status === 200, `/healthz returned ${health.status}`);
    const healthJson = await health.json();
    assert(healthJson.ok === true, "/healthz did not return ok:true");

    const index = await fetch(`${base}/`);
    assert(index.status === 200, `/ returned ${index.status}`);
    assert((index.headers.get("content-type") ?? "").includes("text/html"), "index content-type is not HTML");
    assert((index.headers.get("content-security-policy") ?? "").includes("wasm-unsafe-eval"), "CSP does not allow wasm eval");
    const html = await index.text();
    assert(html.includes("<script"), "index HTML does not contain a module script");

    const wasmName = readdirSync(join(root, ".nsh", "out", "forge-nsh")).find((name) => name.endsWith(".wasm"));
    assert(wasmName, "packaged .wasm asset not found");
    const wasm = await fetch(`${base}/${wasmName}`);
    assert(wasm.status === 200, `.wasm returned ${wasm.status}`);
    assert((wasm.headers.get("content-type") ?? "") === "application/wasm", `.wasm content-type is ${wasm.headers.get("content-type")}`);
    const wasmBytes = new Uint8Array(await wasm.arrayBuffer());
    assert(wasmBytes[0] === 0 && wasmBytes[1] === 0x61 && wasmBytes[2] === 0x73 && wasmBytes[3] === 0x6d, ".wasm magic bytes are invalid");

    const connect = await fetch(`${base}/api/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
      },
      body: JSON.stringify({ client: "forge-nsh-smoke" }),
    });
    if (connect.status !== 200) throw new Error(`/api/connect returned ${connect.status}: ${await connect.text()}`);
    const handshake = await connect.json();
    assert(typeof handshake.clientId === "string", "connect did not return clientId");
    assert(Number.isInteger(handshake.cursor), "connect did not return integer cursor");
    assert(handshake.workspace === workspace, "connect workspace mismatch");

    const rpcId = randomUUID();
    const rpc = await fetch(`${base}/api/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-Forge-Client": handshake.clientId,
      },
      body: JSON.stringify({ id: rpcId, method: "getHostState" }),
    });
    if (rpc.status !== 200) throw new Error(`/api/rpc returned ${rpc.status}: ${await rpc.text()}`);
    const rpcJson = await rpc.json();
    assert(rpcJson.id === rpcId && rpcJson.ok === true, "getHostState RPC did not succeed");
    assert(Array.isArray(rpcJson.result.runs), "getHostState result has no runs array");

    async function callRpc(method, fields = {}) {
      const id = randomUUID();
      const response = await fetch(`${base}/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          "X-Forge-Client": handshake.clientId,
        },
        body: JSON.stringify({ id, method, ...fields }),
      });
      if (response.status !== 200) throw new Error(`${method} HTTP ${response.status}: ${await response.text()}`);
      const body = await response.json();
      if (!body.ok) throw new Error(`${method} RPC failed: ${body.error?.message ?? "unknown error"}`);
      return body.result;
    }

    const updatedSettings = await callRpc("updateSettings", {
      input: { settings: { model: "smoke-model", baseUrl: "http://127.0.0.1:9" } },
    });
    assert(updatedSettings.model === "smoke-model", "updateSettings did not persist smoke model");
    const created = await callRpc("createSession", {
      input: { workspace, title: "forge-nsh smoke session" },
    });
    assert(typeof created.id === "string", "createSession did not return a session id");
    const snapshot = await callRpc("getSession", { sessionId: created.id });
    assert(snapshot.id === created.id && Array.isArray(snapshot.messages), "getSession snapshot mismatch");
    const listed = await callRpc("listSessions");
    assert(listed.some((session) => session.id === created.id), "listSessions did not include the created session");
    const settings = await callRpc("getSettings");
    assert(typeof settings.isConfigured === "boolean", "getSettings did not return isConfigured");
    const entries = await callRpc("listWorkspaceEntries", { sessionId: created.id });
    assert(entries.entries.some((entry) => entry.name === "smoke.txt"), "workspace listing did not include smoke.txt");
    const preview = await callRpc("readWorkspaceFile", { sessionId: created.id, path: "smoke.txt" });
    assert(typeof preview.content === "string" && preview.content.includes("smoke fixture"), "workspace file preview mismatch");

    socket = new WebSocket(`ws://127.0.0.1:${port}/api/events?clientId=${encodeURIComponent(handshake.clientId)}&cursor=${handshake.cursor}`, {
      origin: base,
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 5000);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const firstBatch = await waitForSocketMessage(socket);
    assert(Number.isInteger(firstBatch.cursor), "event batch has no integer cursor");
    assert(Array.isArray(firstBatch.events), "event batch has no events array");
    socket.send(JSON.stringify({ cursor: firstBatch.cursor }));

    console.log("[smoke] PASS");
    console.log(`[smoke] verified static HTML, application/wasm, CSP, /api/connect, proxied RPC and proxied WebSocket events`);
    if (keep) console.log(`[smoke] retained temp workspace ${workspace} and FORGE_HOME ${forgeHome}`);
  } finally {
    socket?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await wait(500);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    if (!keep) {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(forgeHome, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exitCode = 1;
});
