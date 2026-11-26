#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { createSocket } from "node:dgram";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "vendor", "forge-core");
const coreServe = join(coreDir, "dist", "web", "serve.js");
const nshRoot = join(root, "dist", "web", "forge-nsh");
const defaultPidFile = join(root, "pids", "forge-nsh.pid");
const CSP = "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ws: wss:; img-src 'self' blob: data:";
let spawnedCore;

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
const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".wasm", "application/wasm"],
  [".bin", "application/octet-stream"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}
const hasFlag = (name) => process.argv.includes(name);

async function stop() {
  const pidFile = resolve(arg("--pid-file", defaultPidFile));
  let pid;
  try {
    pid = Number((await readFile(pidFile, "utf8")).trim());
  } catch {
    console.error(`No pid file at ${pidFile}`);
    process.exitCode = 1;
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid pid in ${pidFile}`);
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to forge-nsh pid ${pid}`);
  } catch (error) {
    if (error?.code === "ESRCH") console.log(`forge-nsh pid ${pid} is not running`);
    else throw error;
  }
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

async function ensureCore() {
  if (await exists(coreServe)) return;
  if (!(await exists(join(coreDir, "node_modules")))) {
    throw new Error("Forge Core dependencies are missing. Run `pnpm run setup` first.");
  }
  console.log("[forge-nsh] building Forge Core");
  run("pnpm", ["-C", coreDir, "build"]);
  if (!(await exists(coreServe))) throw new Error("Forge Core build did not produce dist/web/serve.js");
}

async function ensureNsh() {
  if (await exists(join(nshRoot, "index.html"))) return;
  console.log("[forge-nsh] packaging NSH web app");
  run("nsh", ["package", "App.tsx", "--target", "web", "--out", join("dist", "web")]);
  if (!(await exists(join(nshRoot, "index.html")))) {
    throw new Error(`NSH package did not produce ${join(nshRoot, "index.html")}`);
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address()?.port;
      server.close(() => {
        if (port) resolvePort(port);
        else reject(new Error("Could not allocate a loopback port"));
      });
    });
  });
}

function primaryLanIPv4() {
  return new Promise((resolveIp) => {
    const socket = createSocket("udp4");
    socket.once("error", () => resolveIp(undefined));
    socket.connect(80, "192.0.2.1", () => {
      const address = socket.address()?.address;
      socket.close();
      resolveIp(typeof address === "string" && address.includes(".") ? address : undefined);
    });
    setTimeout(() => {
      try {
        socket.close();
      } catch {}
      resolveIp(undefined);
    }, 400).unref();
  });
}

function waitForCore(origin, child, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolveReady, reject) => {
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`Forge Core exited with code ${child.exitCode}`));
        return;
      }
      try {
        const response = await fetch(`${origin}/api/version`, { cache: "no-store" });
        if (response.ok) {
          clearInterval(timer);
          resolveReady();
          return;
        }
      } catch {}
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Forge Core did not become ready in time"));
      }
    }, 120);
    timer.unref();
  });
}

function copyRequestHeaders(request, coreAuthority, coreOrigin, websocket = false) {
  const headers = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1] ?? "";
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "origin" || HOP_BY_HOP.has(lower)) continue;
    if (lower === "forwarded" || lower.startsWith("x-forwarded-") || lower === "x-real-ip") continue;
    headers.push(name, value);
  }
  headers.push("Host", coreAuthority, "Origin", coreOrigin);
  if (websocket) headers.push("Connection", "Upgrade", "Upgrade", "websocket");
  return headers;
}

function copyResponseHeaders(response) {
  const headers = [];
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    if (!name || HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers.push(name, response.rawHeaders[index + 1] ?? "");
  }
  return headers;
}

function writeError(response, status, message, request) {
  if (response.headersSent) return response.destroy();
  const body = JSON.stringify({ error: message });
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
  request?.resume();
}

function proxyHttp(request, response, target, core) {
  const upstream = httpRequest({
    agent: false,
    host: "127.0.0.1",
    port: core.port,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers: copyRequestHeaders(request, core.authority, core.origin),
  });
  let responded = false;
  upstream.on("response", (upstreamResponse) => {
    responded = true;
    const status = upstreamResponse.statusCode ?? 502;
    response.writeHead(status, upstreamResponse.statusMessage, copyResponseHeaders(upstreamResponse));
    upstreamResponse.on("error", () => response.destroy());
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (responded) response.destroy();
    else writeError(response, 502, "Forge Core unavailable", request);
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

function writeUpgradeError(socket, status, message) {
  if (socket.destroyed) return;
  const body = JSON.stringify({ error: message });
  socket.end(
    `HTTP/1.1 ${status} Error\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

function proxyUpgrade(request, socket, head, target, core) {
  const upstream = httpRequest({
    agent: false,
    host: "127.0.0.1",
    port: core.port,
    method: "GET",
    path: `${target.pathname}${target.search}`,
    headers: copyRequestHeaders(request, core.authority, core.origin, true),
  });
  upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    if ((upstreamResponse.statusCode ?? 500) !== 101) {
      upstreamSocket.destroy();
      writeUpgradeError(socket, 502, "Forge Core rejected the WebSocket upgrade");
      return;
    }
    const lines = ["HTTP/1.1 101 Switching Protocols"];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      lines.push(`${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1] ?? ""}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });
  upstream.on("response", (upstreamResponse) => {
    writeUpgradeError(socket, upstreamResponse.statusCode ?? 502, "Forge Core rejected the WebSocket upgrade");
    upstreamResponse.resume();
  });
  upstream.on("error", () => writeUpgradeError(socket, 502, "Forge Core unavailable"));
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.end();
}

function staticHeaders(file, compressed, size) {
  const type = MIME.get(extname(file).toLowerCase()) ?? "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Content-Length": size,
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    Vary: "Accept-Encoding",
  };
  if (compressed) headers["Content-Encoding"] = compressed;
  headers["Cache-Control"] = file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable";
  return headers;
}

async function serveStatic(request, response, target) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return writeError(response, 405, "GET required", request);
  }
  let pathname;
  try {
    pathname = decodeURIComponent(target.pathname);
  } catch {
    return writeError(response, 400, "Invalid path", request);
  }
  if (pathname.includes("\0")) return writeError(response, 400, "Invalid path", request);
  const clean = normalize(pathname).replace(/^([/\\])+/, "");
  if (clean === ".." || clean.startsWith(`..${sep}`)) return writeError(response, 403, "Forbidden", request);
  let file = resolve(nshRoot, clean === "." ? "index.html" : clean);
  if (!(file === nshRoot || file.startsWith(`${nshRoot}${sep}`))) {
    return writeError(response, 403, "Forbidden", request);
  }
  let info = await stat(file).catch(() => undefined);
  if (info?.isDirectory()) {
    file = join(file, "index.html");
    info = await stat(file).catch(() => undefined);
  }
  if (!info?.isFile() && extname(file) === "") {
    file = join(nshRoot, "index.html");
    info = await stat(file).catch(() => undefined);
  }
  if (!info?.isFile()) return writeError(response, 404, "Not found", request);

  const accepts = String(request.headers["accept-encoding"] ?? "");
  let encoding;
  let disk = file;
  let diskInfo = info;
  for (const candidate of ["br", "gzip"]) {
    if (!accepts.includes(candidate)) continue;
    const compressedPath = `${file}.${candidate === "gzip" ? "gz" : "br"}`;
    const compressedInfo = await stat(compressedPath).catch(() => undefined);
    if (compressedInfo?.isFile()) {
      encoding = candidate;
      disk = compressedPath;
      diskInfo = compressedInfo;
      break;
    }
  }
  response.writeHead(200, staticHeaders(file, encoding, diskInfo.size));
  if (request.method === "HEAD") response.end();
  else createReadStream(disk).pipe(response);
}

async function main() {
  if (hasFlag("--stop")) return stop();

  const requestedPort = Number(arg("--port", "21888"));
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error("--port must be an integer from 0 to 65535");
  }
  const detectedHost = await primaryLanIPv4();
  const host = arg("--host", detectedHost ?? "127.0.0.1");
  if (host === "0.0.0.0" || host === "::") throw new Error("Wildcard listen addresses are refused; use a concrete LAN IPv4 address");
  const workspace = resolve(arg("--workspace", root));
  const forgeHome = resolve(arg("--forge-home", join(homedir(), ".local", "share", "forge-nsh")));
  const pidFile = resolve(arg("--pid-file", defaultPidFile));

  await mkdir(workspace, { recursive: true });
  // Forge Core creates and chmods FORGE_HOME itself; pre-creating it with a
  // permissive umask would violate its private-directory contract.
  await mkdir(dirname(pidFile), { recursive: true });
  if (!hasFlag("--no-build")) {
    await ensureCore();
    await ensureNsh();
  }

  const corePort = await freePort();
  const coreAuthority = `127.0.0.1:${corePort}`;
  const coreOrigin = `http://${coreAuthority}`;
  const core = { port: corePort, authority: coreAuthority, origin: coreOrigin };
  const child = spawn(process.execPath, [
    coreServe,
    "--host",
    "127.0.0.1",
    "--port",
    String(corePort),
    "--workspace",
    workspace,
  ], {
    cwd: coreDir,
    env: { ...process.env, FORGE_HOME: forgeHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedCore = child;
  child.stdout.on("data", (chunk) => process.stdout.write(`[core] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[core] ${chunk}`));

  let stopping = false;
  const shutdown = (code = 0) => {
    if (stopping) return;
    stopping = true;
    try {
      child.kill("SIGTERM");
    } catch {}
    void rm(pidFile, { force: true }).catch(() => {});
    setTimeout(() => process.exit(code), 500).unref();
  };
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[forge-nsh] Forge Core exited (${signal ?? code}); stopping`);
      shutdown(1);
    }
  });
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("exit", () => {
    try {
      if (!child.killed) child.kill("SIGTERM");
    } catch {}
  });

  await waitForCore(coreOrigin, child);

  const server = createHttpServer();
  server.on("request", (request, response) => {
    void (async () => {
      const authority = server.address()?.address?.includes(":")
        ? `[${server.address().address}]:${server.address().port}`
        : `${server.address().address}:${server.address().port}`;
      if (request.headers.host !== authority) {
        return writeError(response, 403, "Unexpected host", request);
      }
      const target = new URL(request.url ?? "/", `http://${authority}`);
      if (target.pathname.startsWith("/api/")) return proxyHttp(request, response, target, core);
      await serveStatic(request, response, target);
    })().catch((error) => {
      console.error(error);
      if (!response.headersSent) writeError(response, 500, "forge-nsh unavailable", request);
      else response.destroy();
    });
  });
  server.on("upgrade", (request, socket, head) => {
    try {
      const authority = server.address()?.address?.includes(":")
        ? `[${server.address().address}]:${server.address().port}`
        : `${server.address().address}:${server.address().port}`;
      const target = new URL(request.url ?? "/", `http://${authority}`);
      if (request.headers.host !== authority || target.pathname !== "/api/events") {
        return writeUpgradeError(socket, 404, "Not found");
      }
      proxyUpgrade(request, socket, head, target, core);
    } catch {
      writeUpgradeError(socket, 400, "Invalid WebSocket request");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(requestedPort, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  const port = address.port;
  const shownHost = address.address;
  const url = `http://${shownHost}:${port}`;
  await writeFile(pidFile, `${process.pid}\n`, "utf8");
  console.log(`[forge-nsh] core: ${coreOrigin}`);
  console.log(`[forge-nsh] workspace: ${workspace}`);
  console.log(`[forge-nsh] FORGE_HOME: ${forgeHome}`);
  console.log(`[forge-nsh] pid: ${process.pid} (${pidFile})`);
  console.log(`[forge-nsh] ready: ${url}`);
  console.log("[forge-nsh] trusted LAN mode: HTTP is not encrypted; expose only on trusted networks");
}

main().catch(async (error) => {
  console.error(`[forge-nsh] ${error?.stack ?? error}`);
  if (spawnedCore && spawnedCore.exitCode === null) {
    try {
      spawnedCore.kill("SIGTERM");
    } catch {}
  }
  process.exitCode = 1;
});
