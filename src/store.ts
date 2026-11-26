import { UrlScheme, signal } from "nsh";
import type {
  AgentEvent,
  ApprovalRequest,
  ConnectHandshake,
  HostEvent,
  HostState,
  Message,
  PublicSettings,
  RpcEnvelope,
  RunState,
  SessionSnapshot,
  SessionStatus,
  SessionSummary,
  WorkspaceEntry,
  WorkspaceListing,
} from "./protocol";
import { isRunEvent } from "./protocol";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "failed";

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "danger" | "muted";
  timestamp: string;
}

export const connectionState = signal<ConnectionState>("connecting");
export const connectionDetail = signal("正在建立同源连接…");
export const workspace = signal("");
export const restrictWorkspace = signal(true);
export const sessions = signal<readonly SessionSummary[]>([]);
export const selectedSessionId = signal<string | undefined>(undefined);
export const snapshot = signal<SessionSnapshot | undefined>(undefined);
export const snapshotLoading = signal(false);
export const hostRuns = signal<readonly RunState[]>([]);
export const settings = signal<PublicSettings | undefined>(undefined);
export const streamingText = signal("");
export const streamingReasoning = signal("");
export const activities = signal<readonly ActivityItem[]>([]);
export const composer = signal("");
export const sending = signal(false);
export const creatingDraft = signal(false);
export const actionError = signal("");
export const workspaceEntries = signal<readonly WorkspaceEntry[]>([]);
export const workspaceListingTruncated = signal(false);

let clientId = "";
let cursor = 0;
let socket: WebSocket | undefined;
let reconnectTimer: number | undefined;
let booted = false;
let connectInFlight: Promise<void> | undefined;
let sessionRefreshTimer: number | undefined;
let hostRefreshTimer: number | undefined;
let sessionRefreshInFlight = false;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function pageOrigin(): string {
  const current = UrlScheme.url();
  if (current) {
    try {
      return new URL(current).origin;
    } catch {
      // Fall through to the development default.
    }
  }
  return "http://127.0.0.1:21888";
}

async function post(path: string, input: unknown, timeout = 125_000): Promise<unknown> {
  const url = new URL(path, pageOrigin());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientId) headers["X-Forge-Client"] = clientId;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    credentials: "same-origin",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error ? ` ${body.error}` : "";
    } catch {
      // Keep the status-only error.
    }
    if (response.status === 410) {
      connectionState.set("failed");
      connectionDetail.set("页面连接已过期，请刷新页面重新连接；后台任务仍会继续。");
    }
    throw new Error(`Web 请求失败（HTTP ${response.status}）。${detail}`);
  }
  return response.json();
}

async function rpc<T>(method: string, fields: Record<string, unknown> = {}): Promise<T> {
  const id = crypto.randomUUID();
  const envelope = (await post("/api/rpc", { id, method, ...fields })) as RpcEnvelope;
  if (envelope.id !== id || envelope.method !== method) {
    throw new Error("Core 返回了不匹配的 RPC 响应。");
  }
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? "Core RPC 执行失败。");
  }
  return envelope.result as T;
}

function rememberActivity(
  title: string,
  detail: string,
  tone: ActivityItem["tone"] = "info",
): void {
  const item: ActivityItem = {
    id: crypto.randomUUID(),
    title,
    detail: detail.trim().slice(0, 360),
    tone,
    timestamp: new Date().toISOString(),
  };
  activities.update((items) => [item, ...items].slice(0, 64));
}

function updateSessionStatus(sessionId: string, status: SessionStatus): void {
  sessions.update((items) =>
    items.map((session) => (session.id === sessionId ? { ...session, status } : session)),
  );
  const current = snapshot();
  if (current?.id === sessionId) snapshot.set({ ...current, status });
}

function scheduleHostRefresh(delay = 120): void {
  if (hostRefreshTimer !== undefined) clearTimeout(hostRefreshTimer);
  hostRefreshTimer = setTimeout(() => {
    hostRefreshTimer = undefined;
    void refreshHostState().catch(() => undefined);
  }, delay);
}

function scheduleSessionRefresh(sessionId: string, delay = 160): void {
  if (sessionRefreshTimer !== undefined) clearTimeout(sessionRefreshTimer);
  sessionRefreshTimer = setTimeout(() => {
    sessionRefreshTimer = undefined;
    if (selectedSessionId() === sessionId) {
      void refreshSession(sessionId).catch(() => undefined);
    }
  }, delay);
}

function processAgentEvent(runId: string, event: AgentEvent): void {
  const selected = selectedSessionId();
  const isSelected = event.sessionId === selected;
  const touchesList = [
    "run_started",
    "run_finished",
    "state_changed",
    "title_changed",
    "approval_requested",
    "approval_resolved",
  ].includes(event.type);
  if (touchesList) {
    scheduleHostRefresh();
    setTimeout(() => {
      void refreshSessions().catch(() => undefined);
    }, 120);
  }

  if (event.type === "state_changed" && event.status) {
    updateSessionStatus(event.sessionId, event.status as SessionStatus);
  }
  if (event.type === "title_changed" && event.title) {
    sessions.update((items) =>
      items.map((session) =>
        session.id === event.sessionId ? { ...session, title: event.title ?? session.title } : session,
      ),
    );
    const current = snapshot();
    if (current?.id === event.sessionId) snapshot.set({ ...current, title: event.title });
  }

  if (!isSelected) return;

  switch (event.type) {
    case "generation_started":
      streamingText.set("");
      streamingReasoning.set("");
      rememberActivity("开始生成", `run ${runId.slice(0, 8)} · generation ${event.generationId?.slice(0, 8) ?? ""}`, "muted");
      break;
    case "text_delta":
      if (event.text) {
        streamingText.update((text) => `${text}${event.text}`.slice(-131072));
      }
      break;
    case "reasoning_delta":
      if (event.text) {
        streamingReasoning.update((text) => `${text}${event.text}`.slice(-131072));
      }
      break;
    case "retry_reset":
      streamingText.set("");
      streamingReasoning.set("");
      rememberActivity("重试请求", "上一轮流式输出已清理，Core 正在重新尝试。", "warning");
      break;
    case "provider_retry":
      rememberActivity(
        "Provider 重试",
        `第 ${event.attempt ?? "?"} / ${event.maxAttempts ?? "?"} 次 · ${event.reason ?? "upstream"}`,
        "warning",
      );
      break;
    case "tool_call_preview":
      rememberActivity(
        "准备工具调用",
        `${event.name ?? "tool"} · ${event.argumentsChars ?? 0} chars`,
        "muted",
      );
      break;
    case "tool_started": {
      const name = event.call?.function.name ?? "tool";
      const args = event.call?.function.arguments ?? "";
      streamingText.set("");
      streamingReasoning.set("");
      rememberActivity("工具开始", `${name}${args ? ` · ${args.slice(0, 180)}` : ""}`, "info");
      scheduleSessionRefresh(event.sessionId);
      break;
    }
    case "tool_finished":
      rememberActivity(
        event.result?.isError ? "工具失败" : "工具完成",
        event.result?.content ?? event.toolCallId ?? "",
        event.result?.isError ? "danger" : "success",
      );
      scheduleSessionRefresh(event.sessionId);
      break;
    case "approval_requested":
      rememberActivity(
        "等待审批",
        `${event.request?.toolName ?? "tool"} · ${event.request?.description ?? ""}`,
        "warning",
      );
      break;
    case "approval_resolved":
      rememberActivity("审批已处理", event.approved ? "已批准" : "已拒绝", event.approved ? "success" : "danger");
      scheduleSessionRefresh(event.sessionId);
      break;
    case "run_started":
      updateSessionStatus(event.sessionId, "running");
      rememberActivity("运行开始", `${event.model ?? snapshot()?.model ?? ""} · ${event.permission ?? "default"}`, "info");
      scheduleSessionRefresh(event.sessionId);
      break;
    case "generation_finished":
      scheduleSessionRefresh(event.sessionId);
      break;
    case "run_finished":
      streamingText.set("");
      streamingReasoning.set("");
      if (event.status) updateSessionStatus(event.sessionId, event.status as SessionStatus);
      rememberActivity("运行结束", event.status ?? "completed", event.status === "completed" ? "success" : "warning");
      scheduleSessionRefresh(event.sessionId, 40);
      break;
    case "error":
      rememberActivity("运行错误", event.error?.message ?? "未知错误", "danger");
      scheduleSessionRefresh(event.sessionId);
      break;
    default:
      break;
  }
}

function processHostEvent(raw: HostEvent): void {
  if (!isRunEvent(raw)) return;
  processAgentEvent(raw.runId, raw.event);
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}

function scheduleSocketReconnect(): void {
  if (connectionState() === "failed" || reconnectTimer !== undefined) return;
  connectionState.set("reconnecting");
  connectionDetail.set("事件连接中断，正在自动重连；后台任务不受影响。");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void resumeEvents();
  }, 1600);
}

function openEventSocket(): void {
  const previous = socket;
  socket = undefined;
  previous?.close();

  const url = new URL("/api/events", pageOrigin());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("cursor", String(cursor));
  const next = new WebSocket(url);
  socket = next;

  next.onopen = () => {
    if (socket !== next) return;
    connectionState.set("connected");
    connectionDetail.set("实时事件通道已连接");
  };
  next.onmessage = (message) => {
    if (socket !== next || typeof message.data !== "string") return;
    try {
      const batch = JSON.parse(message.data) as { cursor?: unknown; events?: unknown };
      const events = Array.isArray(batch.events) ? (batch.events as HostEvent[]) : undefined;
      if (typeof batch.cursor !== "number" || !events) throw new Error("bad event batch");
      if (batch.cursor !== cursor + events.length) throw new Error("event sequence gap");
      for (const event of events) {
        processHostEvent(event);
        cursor += 1;
      }
      next.send(JSON.stringify({ cursor }));
    } catch {
      next.close();
    }
  };
  next.onerror = () => {
    if (socket === next) next.close();
  };
  next.onclose = () => {
    if (socket !== next) return;
    socket = undefined;
    scheduleSocketReconnect();
  };
}

async function resumeEvents(): Promise<void> {
  if (!clientId || connectionState() === "failed") return;
  try {
    const state = (await post("/api/connection", { cursor }, 10_000)) as { resumable?: boolean };
    if (!state.resumable) {
      connectionState.set("failed");
      connectionDetail.set("事件历史已过期，请刷新页面恢复完整状态；后台任务仍会继续。");
      return;
    }
    openEventSocket();
  } catch (error) {
    connectionDetail.set(`重连失败：${errorText(error)}`);
    scheduleSocketReconnect();
  }
}

export async function refreshHostState(): Promise<void> {
  const state = await rpc<HostState>("getHostState");
  hostRuns.set(state.runs);
}

export async function refreshSessions(): Promise<void> {
  const list = await rpc<readonly SessionSummary[]>("listSessions");
  sessions.set(
    Array.from(list).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  );
}

export async function refreshSettings(): Promise<void> {
  const value = await rpc<PublicSettings>("getSettings");
  settings.set(value);
}

export async function refreshSession(sessionId: string): Promise<void> {
  if (sessionRefreshInFlight) return;
  sessionRefreshInFlight = true;
  snapshotLoading.set(true);
  try {
    const value = await rpc<SessionSnapshot>("getSession", { sessionId });
    if (selectedSessionId() === sessionId) snapshot.set(value);
  } finally {
    sessionRefreshInFlight = false;
    snapshotLoading.set(false);
  }
}

export async function refreshWorkspaceEntries(sessionId: string): Promise<void> {
  try {
    const listing = await rpc<WorkspaceListing>("listWorkspaceEntries", { sessionId });
    if (selectedSessionId() === sessionId) {
      workspaceEntries.set(listing.entries);
      workspaceListingTruncated.set(listing.truncated);
    }
  } catch {
    if (selectedSessionId() === sessionId) {
      workspaceEntries.set([]);
      workspaceListingTruncated.set(false);
    }
  }
}

async function refreshAll(): Promise<void> {
  const results = await Promise.allSettled([refreshHostState(), refreshSessions(), refreshSettings()]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw new Error("初始状态加载失败。");
}

async function connectWorkbench(): Promise<void> {
  if (connectInFlight) return connectInFlight;
  connectInFlight = (async () => {
    connectionState.set("connecting");
    connectionDetail.set("正在执行 /api/connect 握手…");
    actionError.set("");
    try {
      clientId = "";
      const handshake = (await post("/api/connect", {}, 15_000)) as ConnectHandshake;
      clientId = handshake.clientId;
      cursor = handshake.cursor;
      workspace.set(handshake.workspace);
      restrictWorkspace.set(handshake.restrictWorkspace !== false);
      for (const event of handshake.recovery ?? []) processHostEvent(event);
      await refreshAll();
      const first = sessions()[0];
      if (!selectedSessionId() && first) {
        selectedSessionId.set(first.id);
        await refreshSession(first.id);
        void refreshWorkspaceEntries(first.id);
      }
      openEventSocket();
    } catch (error) {
      connectionState.set("failed");
      connectionDetail.set(errorText(error));
    } finally {
      connectInFlight = undefined;
    }
  })();
  return connectInFlight;
}

export function bootstrapWorkbench(): void {
  if (booted) return;
  booted = true;
  void connectWorkbench();
}

export function retryConnection(): void {
  clearReconnectTimer();
  const old = socket;
  socket = undefined;
  old?.close();
  void connectWorkbench();
}

export function startDraft(): void {
  selectedSessionId.set(undefined);
  snapshot.set(undefined);
  streamingText.set("");
  streamingReasoning.set("");
  activities.set([]);
  workspaceEntries.set([]);
  workspaceListingTruncated.set(false);
  actionError.set("");
  creatingDraft.set(true);
}

export function selectSession(sessionId: string): void {
  if (selectedSessionId() === sessionId) return;
  selectedSessionId.set(sessionId);
  creatingDraft.set(false);
  snapshot.set(undefined);
  streamingText.set("");
  streamingReasoning.set("");
  activities.set([]);
  actionError.set("");
  void refreshSession(sessionId).catch((error) => {
    actionError.set(errorText(error));
  });
  void refreshWorkspaceEntries(sessionId);
}

function draftTitle(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact || "新的会话";
}

export async function sendPrompt(): Promise<void> {
  const prompt = composer().trim();
  if (!prompt || sending()) return;
  if (!workspace()) {
    actionError.set("尚未连接 Core 工作区。等待连接完成后再发送。");
    return;
  }
  sending.set(true);
  actionError.set("");
  try {
    let sessionId = selectedSessionId();
    if (!sessionId) {
      const created = await rpc<SessionSnapshot>("createSession", {
        input: {
          workspace: workspace(),
          title: draftTitle(prompt),
        },
      });
      sessionId = created.id;
      selectedSessionId.set(sessionId);
      creatingDraft.set(false);
      snapshot.set(created);
      void refreshSessions().catch(() => undefined);
      void refreshWorkspaceEntries(sessionId);
    }
    await rpc<{ runId: string; sessionId: string }>("startRun", {
      input: {
        sessionId,
        prompt,
      },
    });
    composer.set("");
    streamingText.set("");
    streamingReasoning.set("");
    rememberActivity("已发送", prompt, "muted");
    updateSessionStatus(sessionId, "running");
    scheduleHostRefresh(20);
    scheduleSessionRefresh(sessionId, 120);
  } catch (error) {
    actionError.set(errorText(error));
  } finally {
    sending.set(false);
  }
}

export function activeRunForSelected(): RunState | undefined {
  const selected = selectedSessionId();
  if (!selected) return undefined;
  return hostRuns().find(
    (run) =>
      run.sessionId === selected &&
      ["running", "awaiting_approval"].includes(run.status),
  );
}

export async function cancelSelectedRun(): Promise<void> {
  const run = activeRunForSelected();
  if (!run) return;
  try {
    actionError.set("");
    await rpc<null>("cancelRun", { runId: run.runId });
    rememberActivity("取消请求已发送", `run ${run.runId.slice(0, 8)}`, "warning");
    scheduleHostRefresh(20);
  } catch (error) {
    actionError.set(errorText(error));
  }
}

export async function answerApproval(approval: ApprovalRequest, approved: boolean): Promise<void> {
  const run = hostRuns().find(
    (candidate) =>
      candidate.sessionId === approval.sessionId &&
      candidate.pendingApprovals.some((item) => item.id === approval.id),
  );
  if (!run) {
    actionError.set("找不到该审批所属的运行；请刷新状态。 ");
    return;
  }
  try {
    actionError.set("");
    await rpc<null>("answerApproval", {
      runId: run.runId,
      approvalId: approval.id,
      approved,
    });
    rememberApprovalDecision(approval, approved);
    scheduleHostRefresh(20);
  } catch (error) {
    actionError.set(errorText(error));
  }
}

function rememberApprovalDecision(approval: ApprovalRequest, approved: boolean): void {
  rememberActivity(
    approved ? "已批准工具" : "已拒绝工具",
    `${approval.toolName} · ${approval.description}`,
    approved ? "success" : "danger",
  );
}

export function visibleMessages(): readonly Message[] {
  return snapshot()?.messages ?? [];
}

export function selectedSummary(): SessionSummary | undefined {
  const selected = selectedSessionId();
  return sessions().find((session) => session.id === selected);
}
