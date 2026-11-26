#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, closeSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stateDir = join(root, ".forge-nsh");
const pidFile = join(stateDir, "forge-nsh.pid");
const metaFile = join(stateDir, "service.json");
const logFile = join(stateDir, "forge-nsh.log");
const webRoot = join(root, ".nsh", "out", "forge-nsh");
const coreServe = join(root, "vendor", "forge-core", "dist", "web", "serve.js");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json"],
  [".json", "application/json; charset=utf-8"],
  [".bin", "application/octet-stream"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function usage() {
  console.log(`forge-nsh service launcher

Commands:
  serve [--port 21888] [--workspace DIR] [--forge-home DIR]   run in foreground
  start [same options]                                        build if needed, then daemonize
  stop                                                        stop the daemon
  status                                                      print daemon and HTTP status
  restart [same options]                                      stop then start

Options:
  --port N         public port (0 asks the OS for one; default 21888)
  --workspace DIR  Forge workspace (default: current working directory)
  --forge-home DIR Forge state directory passed to Core as FORGE_HOME
  --core-port N    fixed loopback Core port (default: ephemeral)

Security: this is trusted-LAN HTTP. There is no pairing, authentication or transport encryption.
`);
}

function parseOptions(args) {
  const out = { port: 21888, workspace: process.cwd(), forgeHome: process.env.FORGE_HOME, corePort: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    index += 1;
    if (key === "--port") out.port = Number(value);
    else if (key === "--workspace") out.workspace = value;
    else if (key === "--forge-home") out.forgeHome = value;
    else if (key === "--core-port") out.corePort = Number(value);
    else throw new Error(`Unknown option: ${key}`);
  }
  return out;
}

function validateOptions(options, { allowPortZero = true } = {}) {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535 || (!allowPortZero && options.port === 0)) {
    throw new Error("--port must be an integer TCP port");
  }
  if (options.corePort !== undefined && (!Number.isInteger(options.corePort) || options.corePort < 1024 || options.corePort > 65535)) {
    throw new Error("--core-port must be an integer from 1024 through 65535");
  }
  options.workspace = realpathSync(resolve(options.workspace));
  if (!statSync(options.workspace).isDirectory()) throw new Error(`Workspace is not a directory: ${options.workspace}`);
  if (options.forgeHome) options.forgeHome = resolve(options.forgeHome);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

function wait(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function getJson(port, path, timeout = 1500) {
  return new Promise((resolvePromise, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path, timeout }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

async function waitForCore(port, child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Forge Core exited early with status ${child.exitCode}`);
    try {
      await getJson(port, "/api/version", 900);
      return;
    } catch {
      await wait(160);
    }
  }
  throw new Error("Forge Core did not become ready in time");
}

function forwardedHeaders(request, corePort) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "origin" || lower === "expect" || HOP_BY_HOP.has(lower)) continue;
    if (value !== undefined) headers[name] = value;
  }
  headers.Host = `127.0.0.1:${corePort}`;
  headers.Origin = `http://127.0.0.1:${corePort}`;
  return headers;
}

function responseHeaders(response) {
  const headers = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function proxyHttp(request, response, corePort) {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: corePort,
      method: request.method,
      path: request.url,
      headers: forwardedHeaders(request, corePort),
      agent: false,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse));
      upstreamResponse.pipe(response);
    },
  );
  upstream.setTimeout(130_000, () => upstream.destroy(new Error("Core request timeout")));
  upstream.on("error", () => {
    if (!response.headersSent) writeJson(response, 502, { error: "Forge Core is unavailable" });
    else response.destroy();
    request.resume();
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

function proxyUpgrade(request, socket, head, corePort) {
  const upstream = net.connect({ host: "127.0.0.1", port: corePort });
  upstream.setNoDelay(true);
  socket.setNoDelay(true);
  const destroyBoth = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.once("error", destroyBoth);
  socket.once("error", destroyBoth);
  upstream.on("connect", () => {
    const lines = [`GET ${request.url} HTTP/1.1`];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index];
      const lower = name.toLowerCase();
      if (lower === "host" || lower === "origin" || HOP_BY_HOP.has(lower)) continue;
      lines.push(`${name}: ${request.rawHeaders[index + 1] ?? ""}`);
    }
    lines.push(`Host: 127.0.0.1:${corePort}`);
    lines.push(`Origin: http://127.0.0.1:${corePort}`);
    lines.push("Connection: Upgrade");
    lines.push("Upgrade: websocket");
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
}

function contentType(file) {
  return MIME.get(extname(file).toLowerCase()) ?? "application/octet-stream";
}

function staticPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) return undefined;
  const relative = decoded === "/" ? "/index.html" : decoded;
  const file = resolve(webRoot, `.${relative}`);
  if (file !== webRoot && !file.startsWith(`${webRoot}${sep}`)) return undefined;
  return file;
}

function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    writeJson(response, 405, { error: "Method not allowed" });
    return;
  }
  let file = staticPath(pathname);
  if (!file || !existsSync(file)) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }

  const accept = String(request.headers["accept-encoding"] ?? "");
  let encoding;
  let encodedFile = file;
  if (accept.includes("br") && existsSync(`${file}.br`)) {
    encoding = "br";
    encodedFile = `${file}.br`;
  } else if (accept.includes("gzip") && existsSync(`${file}.gz`)) {
    encoding = "gzip";
    encodedFile = `${file}.gz`;
  }
  const size = statSync(encodedFile).size;
  const isIndex = file.endsWith(`${sep}index.html`) || file === join(webRoot, "index.html");
  const headers = {
    "Content-Type": contentType(file),
    "Content-Length": size,
    "Cache-Control": isIndex ? "no-cache" : "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss:; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
  if (encoding) headers["Content-Encoding"] = encoding;
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else createReadStream(encodedFile).pipe(response);
}

function lanUrls(port) {
  const urls = [`http://127.0.0.1:${port}`];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

async function serve(rawOptions) {
  const options = { ...rawOptions };
  validateOptions(options);
  if (!existsSync(coreServe)) throw new Error("Forge Core is not built. Run: pnpm build");
  if (!existsSync(join(webRoot, "index.html"))) throw new Error("NSH web app is not packaged. Run: pnpm build");

  const corePort = options.corePort ?? (await freePort());
  const coreEnv = { ...process.env };
  if (options.forgeHome) coreEnv.FORGE_HOME = options.forgeHome;
  const core = spawn(process.execPath, [
    coreServe,
    "--host",
    "127.0.0.1",
    "--port",
    String(corePort),
    "--workspace",
    options.workspace,
  ], {
    cwd: root,
    env: coreEnv,
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForCore(corePort, core);

  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://forge-nsh.local");
    if (url.pathname === "/healthz") {
      writeJson(response, 200, { ok: true, service: "forge-nsh", corePort, workspace: options.workspace });
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "public, max-age=3600" });
      response.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      proxyHttp(request, response, corePort);
      return;
    }
    serveStatic(request, response, url.pathname);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const url = new URL(request.url ?? "/", "http://forge-nsh.local");
    if (url.pathname !== "/api/events") {
      socket.destroy();
      return;
    }
    proxyUpgrade(request, socket, head, corePort);
  });

  let stopping = false;
  const shutdown = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections?.();
    server.close(() => undefined);
    if (core.exitCode === null) core.kill("SIGTERM");
    setTimeout(() => {
      if (core.exitCode === null) core.kill("SIGKILL");
      process.exit(code);
    }, 1800).unref();
  };
  process.once("SIGINT", () => shutdown(0));
  process.once("SIGTERM", () => shutdown(0));
  core.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[forge-nsh] Forge Core exited unexpectedly (${signal ?? code}); stopping public server`);
      shutdown(1);
    }
  });

  try {
    await new Promise((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(options.port, "0.0.0.0", () => {
        server.off("error", reject);
        resolveListen();
      });
    });
  } catch (error) {
    if (core.exitCode === null) core.kill("SIGTERM");
    throw error;
  }
  const address = server.address();
  const publicPort = typeof address === "object" && address ? address.port : options.port;
  const urls = lanUrls(publicPort);
  console.log(`[forge-nsh] workspace: ${options.workspace}`);
  console.log(`[forge-nsh] core: http://127.0.0.1:${corePort}`);
  for (const url of urls) console.log(`[forge-nsh] listening: ${url}`);
  console.log("[forge-nsh] WARNING trusted-LAN HTTP only: no pairing, authentication or encryption.");
  console.log(JSON.stringify({ type: "ready", port: publicPort, corePort, workspace: options.workspace, urls }));
}

function ensureBuilt() {
  if (existsSync(coreServe) && existsSync(join(webRoot, "index.html"))) return;
  const result = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("build failed");
}

function readPid() {
  try {
    const pid = Number(readFileSync(pidFile, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start(rawOptions) {
  const options = { ...rawOptions };
  validateOptions(options, { allowPortZero: false });
  ensureBuilt();
  mkdirSync(stateDir, { recursive: true });
  const existing = readPid();
  if (existing && processAlive(existing)) {
    throw new Error(`forge-nsh already appears to be running with PID ${existing}; use pnpm status or pnpm stop`);
  }
  closeSync(openSync(logFile, "a"));
  const out = openSync(logFile, "a");
  const args = [join(root, "scripts", "forge-nsh.mjs"), "serve", "--port", String(options.port), "--workspace", options.workspace];
  if (options.forgeHome) args.push("--forge-home", options.forgeHome);
  if (options.corePort) args.push("--core-port", String(options.corePort));
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    env: process.env,
    stdio: ["ignore", out, out],
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);
  writeFileSync(metaFile, `${JSON.stringify({ pid: child.pid, port: options.port, workspace: options.workspace, logFile, startedAt: new Date().toISOString() }, null, 2)}\n`);

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (!processAlive(child.pid)) throw new Error(`service exited during startup; inspect ${logFile}`);
    try {
      const health = await getJson(options.port, "/healthz", 900);
      if (health.ok) {
        console.log(`forge-nsh started`);
        console.log(`PID: ${child.pid}`);
        console.log(`URL: ${lanUrls(options.port).join("  ")}`);
        console.log(`log: ${logFile}`);
        return;
      }
    } catch {
      await wait(180);
    }
  }
  throw new Error(`service did not become ready; inspect ${logFile}`);
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log("forge-nsh is not running (no pid file)");
    return;
  }
  if (!processAlive(pid)) {
    rmSync(pidFile, { force: true });
    console.log(`removed stale pid file for ${pid}`);
    return;
  }
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      rmSync(pidFile, { force: true });
      console.log(`forge-nsh stopped (PID ${pid})`);
      return;
    }
    await wait(150);
  }
  process.kill(pid, "SIGKILL");
  rmSync(pidFile, { force: true });
  console.log(`forge-nsh killed (PID ${pid})`);
}

async function status() {
  const pid = readPid();
  let meta = {};
  try {
    meta = JSON.parse(readFileSync(metaFile, "utf8"));
  } catch {
    // Optional metadata only.
  }
  const alive = pid ? processAlive(pid) : false;
  console.log(`pid: ${pid ?? "—"} (${alive ? "alive" : "not running"})`);
  if (meta.port) {
    try {
      const health = await getJson(meta.port, "/healthz", 900);
      console.log(`http: healthy on port ${meta.port}`);
      console.log(`urls: ${lanUrls(meta.port).join("  ")}`);
      console.log(`workspace: ${health.workspace}`);
    } catch (error) {
      console.log(`http: unavailable (${error.message})`);
    }
  }
  console.log(`log: ${logFile}`);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === "serve") await serve(options);
  else if (command === "start") await start(options);
  else if (command === "stop") await stop();
  else if (command === "status") await status();
  else if (command === "restart") {
    await stop();
    await start(options);
  } else usage();
}

main().catch((error) => {
  console.error(`forge-nsh: ${error.message}`);
  process.exitCode = 1;
});
