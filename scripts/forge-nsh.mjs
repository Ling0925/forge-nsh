#!/usr/bin/env node
import { spawn } from "node:child_process";
import dgram from "node:dgram";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let spawnedCore;
process.on("exit", () => {
  if (spawnedCore && spawnedCore.exitCode === null) {
    try { spawnedCore.kill("SIGTERM"); } catch {}
  }
});

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127;
}

async function primaryLanIpv4() {
  const udp = await new Promise((resolvePromise) => {
    const socket = dgram.createSocket("udp4");
    const done = (value) => {
      try { socket.close(); } catch {}
      resolvePromise(value);
    };
    socket.once("error", () => done(undefined));
    socket.connect(80, "192.168.1.1", () => {
      const address = socket.address();
      done(address && typeof address === "object" ? address.address : undefined);
    });
  });
  if (udp && /^\d+\.\d+\.\d+\.\d+$/.test(udp)) return udp;
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateIpv4(entry.address)) return entry.address;
    }
  }
  return "127.0.0.1";
}

async function freePort() {
  const probe = createServer();
  await new Promise((done, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", done);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((done) => probe.close(done));
  if (!port) throw new Error("Could not allocate a loopback port for Forge Core");
  return port;
}

async function assertPortAvailable(host, port) {
  const probe = createServer();
  try {
    await new Promise((done, reject) => {
      probe.once("error", reject);
      probe.listen(port, host, done);
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EADDRINUSE") {
      throw new Error(`Port ${host}:${port} is already in use`);
    }
    throw error;
  } finally {
    if (probe.listening) await new Promise((done) => probe.close(done));
  }
}

function rawHeader(request, name) {
  let count = 0;
  let value;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() !== name) continue;
    count += 1;
    if (count === 1) value = request.rawHeaders[index + 1];
  }
  return { count, value };
}

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);
const STRIPPED = new Set([
  "expect", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
]);

function connectionTokens(value) {
  return new Set((value ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean));
}

function forwardedHeaders(request, core, includeUpgrade = false) {
  const tokens = connectionTokens(request.headers.connection);
  const headers = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "origin" || HOP_BY_HOP.has(lower) || STRIPPED.has(lower) || tokens.has(lower)) continue;
    headers.push(name, request.rawHeaders[index + 1] ?? "");
  }
  headers.push("Host", core.authority, "Origin", core.origin);
  if (includeUpgrade) headers.push("Connection", "Upgrade", "Upgrade", "websocket");
  return headers;
}

function responseHeaders(response) {
  const tokens = connectionTokens(response.headers.connection);
  const headers = [];
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    if (!name) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || tokens.has(lower)) continue;
    headers.push(name, response.rawHeaders[index + 1] ?? "");
  }
  return headers;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function cspFor(authority) {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ws://${authority} wss://${authority}`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src 'self' about:blank",
    "frame-src 'self' about:blank",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ");
}

function securityHeaders() {
  return {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function writeError(response, status, message, request) {
  if (response.headersSent) return response.destroy();
  const body = JSON.stringify({ error: message });
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(request?.method === "HEAD" ? undefined : body);
  request?.resume();
}

async function packagedAppDir() {
  const out = join(root, ".nsh", "out");
  const entries = await readdir(out, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(out, entry.name);
    if (await stat(join(candidate, "index.html")).then((info) => info.isFile(), () => false)) {
      candidates.push(candidate);
    }
  }
  if (!candidates.length) throw new Error("No packaged NSH web app found; run `npm run build` first");
  return candidates.find((candidate) => candidate.endsWith("Forge NSH")) ?? candidates[0];
}

async function serveStatic(request, response, pathname, appRoot, authority) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return writeError(response, 405, "Method not allowed", request);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return writeError(response, 400, "Invalid path", request);
  }
  if (!decoded.startsWith("/") || decoded.includes("\0") || decoded.includes("\\")) {
    return writeError(response, 400, "Invalid path", request);
  }
  const relative = decoded === "/" ? "/index.html" : decoded;
  const rootReal = await realpath(appRoot);
  const filePath = resolve(rootReal, `.${relative}`);
  if (filePath !== rootReal && !filePath.startsWith(rootReal + sep)) {
    return writeError(response, 403, "Invalid path", request);
  }
  const fileReal = await realpath(filePath).catch(() => undefined);
  if (!fileReal || (fileReal !== rootReal && !fileReal.startsWith(rootReal + sep))) {
    return writeError(response, 404, "Not found", request);
  }
  const info = await stat(fileReal).catch(() => undefined);
  if (!info?.isFile()) return writeError(response, 404, "Not found", request);

  const extension = extname(fileReal).toLowerCase();
  const type = MIME[extension] ?? "application/octet-stream";
  let bodyPath = fileReal;
  let bodySize = info.size;
  const headers = {
    ...securityHeaders(),
    "Content-Type": type,
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    Vary: "Accept-Encoding",
  };
  if (extension === ".html") headers["Content-Security-Policy"] = cspFor(authority);

  const accepted = request.headers["accept-encoding"] ?? "";
  if (accepted.includes("br") || accepted.includes("gzip")) {
    for (const [encoding, suffix] of [["br", ".br"], ["gzip", ".gz"]]) {
      if (!accepted.includes(encoding)) continue;
      const compressed = await stat(fileReal + suffix).catch(() => undefined);
      if (compressed?.isFile()) {
        bodyPath = fileReal + suffix;
        bodySize = compressed.size;
        headers["Content-Encoding"] = encoding;
        break;
      }
    }
  }
  headers["Content-Length"] = String(bodySize);
  response.writeHead(200, headers);
  if (request.method === "HEAD") return response.end();
  const { createReadStream } = await import("node:fs");
  createReadStream(bodyPath).on("error", () => response.destroy()).pipe(response);
}

function proxyHttp(request, response, target, core) {
  const upstream = httpRequest({
    agent: false,
    host: core.host,
    port: core.port,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers: forwardedHeaders(request, core),
  });
  let answered = false;
  upstream.on("response", (upstreamResponse) => {
    answered = true;
    request.unpipe(upstream);
    if (!upstream.writableEnded) upstream.end();
    request.resume();
    response.writeHead(
      upstreamResponse.statusCode ?? 502,
      upstreamResponse.statusMessage,
      responseHeaders(upstreamResponse),
    );
    upstreamResponse.on("error", () => response.destroy());
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (answered || response.headersSent) response.destroy();
    else writeError(response, 502, "Forge Core unavailable", request);
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

function rejectUpgrade(socket, status, message) {
  if (socket.destroyed) return;
  const body = JSON.stringify({ error: message });
  socket.end(
    `HTTP/1.1 ${status} Error\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

function proxyUpgrade(request, socket, head, target, core) {
  const upstream = httpRequest({
    agent: false,
    host: core.host,
    port: core.port,
    method: "GET",
    path: `${target.pathname}${target.search}`,
    headers: forwardedHeaders(request, core, true),
  });
  let upgraded = false;
  upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    upgraded = true;
    const lines = [`HTTP/1.1 ${upstreamResponse.statusCode ?? 101} ${upstreamResponse.statusMessage ?? "Switching Protocols"}`];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      lines.push(`${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1] ?? ""}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
    const teardown = () => {
      socket.destroy();
      upstreamSocket.destroy();
    };
    socket.once("close", teardown);
    upstreamSocket.once("close", teardown);
    socket.once("error", teardown);
    upstreamSocket.once("error", teardown);
  });
  upstream.on("response", (upstreamResponse) => {
    const lines = [`HTTP/1.1 ${upstreamResponse.statusCode ?? 502} ${upstreamResponse.statusMessage ?? "Error"}`];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      const lower = upstreamResponse.rawHeaders[index]?.toLowerCase();
      if (!HOP_BY_HOP.has(lower)) lines.push(`${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1] ?? ""}`);
    }
    lines.push("Connection: close");
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    upstreamResponse.pipe(socket);
  });
  upstream.on("error", () => {
    if (!upgraded) rejectUpgrade(socket, 502, "Forge Core unavailable");
    else socket.destroy();
  });
  socket.on("close", () => { if (!upgraded) upstream.destroy(); });
  upstream.end();
}

function validUpgrade(request, authority, origin) {
  const host = rawHeader(request, "host");
  const requestOrigin = rawHeader(request, "origin");
  const key = rawHeader(request, "sec-websocket-key");
  const version = rawHeader(request, "sec-websocket-version");
  return host.count === 1 && host.value === authority &&
    requestOrigin.count === 1 && requestOrigin.value === origin &&
    key.count === 1 && key.value && version.count === 1 && version.value &&
    (request.headers.upgrade ?? "").toLowerCase() === "websocket" &&
    connectionTokens(request.headers.connection).has("upgrade");
}

async function waitForCore(core, child, log) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Forge Core exited during startup with code ${child.exitCode}`);
    try {
      const response = await fetch(`${core.origin}/api/version`, { cache: "no-store" });
      response.body?.cancel();
      if (response.status < 500) {
        log(`Forge Core ready at ${core.origin}`);
        return;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 120));
  }
  throw new Error("Forge Core did not become ready within 10 seconds");
}

async function main() {
  const host = option("--host") ?? process.env.FORGE_NSH_HOST ?? await primaryLanIpv4();
  const port = Number(option("--port") ?? process.env.FORGE_NSH_PORT ?? "21888");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be 1024..65535");
  await assertPortAvailable(host, port);
  const workspace = resolve(option("--workspace") ?? process.env.FORGE_NSH_WORKSPACE ?? root);
  const runDir = resolve(option("--run-dir") ?? process.env.FORGE_NSH_RUN_DIR ?? join(root, ".forge-nsh"));
  const forgeHome = resolve(option("--forge-home") ?? process.env.FORGE_HOME ?? join(runDir, "home"));
  const corePort = await freePort();
  const core = {
    host: "127.0.0.1",
    port: corePort,
    authority: `127.0.0.1:${corePort}`,
    origin: `http://127.0.0.1:${corePort}`,
  };
  const authority = `${host}:${port}`;
  const origin = `http://${authority}`;
  const appRoot = await packagedAppDir();
  const serveJs = join(root, "vendor", "forge-core", "dist", "web", "serve.js");
  if (!await stat(serveJs).then((info) => info.isFile(), () => false)) {
    throw new Error("Forge Core is not built; run `npm run setup` or `npm run build`");
  }
  await mkdir(workspace, { recursive: true });
  await mkdir(forgeHome, { recursive: true, mode: 0o700 });
  await chmod(forgeHome, 0o700);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const logStream = createWriteStream(join(runDir, "service.log"), { flags: "a" });
  const log = (line) => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    logStream.write(`${stamped}\n`);
    console.log(stamped);
  };
  log(`Starting Forge NSH: ui=${origin} workspace=${workspace} forgeHome=${forgeHome}`);

  const coreChild = spawn(process.execPath, [
    serveJs,
    "--host", "127.0.0.1",
    "--port", String(corePort),
    "--workspace", workspace,
  ], {
    cwd: root,
    env: { ...process.env, FORGE_HOME: forgeHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedCore = coreChild;
  for (const [stream, name] of [[coreChild.stdout, "stdout"], [coreChild.stderr, "stderr"]]) {
    let rest = "";
    stream.on("data", (chunk) => {
      const text = rest + chunk.toString("utf8");
      const lines = text.split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) if (line) log(`core ${name}: ${line}`);
    });
  }

  const server = createServer((request, response) => {
    void (async () => {
      const hostHeader = rawHeader(request, "host");
      if (hostHeader.count !== 1 || hostHeader.value !== authority) {
        return writeError(response, 403, "Unexpected host", request);
      }
      if (!request.url || request.url.includes("#")) return writeError(response, 400, "Invalid request target", request);
      let target;
      try {
        target = new URL(request.url, origin);
      } catch {
        return writeError(response, 400, "Invalid request target", request);
      }
      if (target.origin !== origin) return writeError(response, 403, "Unexpected origin", request);
      if (target.pathname.startsWith("/api/")) {
        const requestOrigin = rawHeader(request, "origin");
        const readOnlyVersion = target.pathname === "/api/version" && request.method === "GET";
        const originAllowed = readOnlyVersion
          ? requestOrigin.count === 0 || (requestOrigin.count === 1 && requestOrigin.value === origin)
          : requestOrigin.count === 1 && requestOrigin.value === origin;
        if (!originAllowed) return writeError(response, 403, "Same-origin request required", request);
        return proxyHttp(request, response, target, core);
      }
      await serveStatic(request, response, target.pathname, appRoot, authority);
    })().catch((error) => {
      if (!response.headersSent) writeError(response, 500, error instanceof Error ? error.message : "Gateway error", request);
      else response.destroy();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      if (!validUpgrade(request, authority, origin)) return rejectUpgrade(socket, 403, "Invalid WebSocket upgrade");
      const target = new URL(request.url ?? "/", origin);
      if (target.origin !== origin || target.pathname !== "/api/events") return rejectUpgrade(socket, 404, "Not found");
      proxyUpgrade(request, socket, head, target, core);
    } catch {
      socket.destroy();
    }
  });

  await waitForCore(core, coreChild, log);
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      done();
    });
  });
  const pidInfo = {
    servicePid: process.pid,
    corePid: coreChild.pid,
    host,
    port,
    url: origin,
    workspace,
    forgeHome,
    startedAt: new Date().toISOString(),
  };
  await writeFile(join(runDir, "service.pid"), `${JSON.stringify(pidInfo, null, 2)}\n`);
  log(`Forge NSH ready: ${origin}`);
  log("Trusted LAN only: HTTP is not encrypted and there is no device pairing.");

  let closing = false;
  const shutdown = async (exitCode = 0) => {
    if (closing) return;
    closing = true;
    log("Stopping Forge NSH");
    server.closeAllConnections();
    await new Promise((done) => server.close(() => done()));
    if (coreChild.exitCode === null) coreChild.kill("SIGTERM");
    const exited = await Promise.race([
      new Promise((done) => coreChild.once("exit", () => done(true))),
      new Promise((done) => setTimeout(() => done(false), 2500)),
    ]);
    if (!exited && coreChild.exitCode === null) coreChild.kill("SIGKILL");
    logStream.end();
    process.exit(exitCode);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  coreChild.on("exit", (code, signal) => {
    if (!closing) {
      log(`Forge Core exited unexpectedly (${signal ?? code}); stopping gateway`);
      void shutdown(1);
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
