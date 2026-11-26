import { batch, computed, signal } from "nsh";
import { clampText, errorText, formatNumber } from "./format";
import {
  type AgentEvent,
  type ApprovalRequest,
  type ConnectResponse,
  ForgeApiClient,
  type HostEvent,
  type RunHandle,
  type SessionSnapshot,
  type SessionStatus,
  type SessionSummary,
} from "./protocol";

export type ConnectionState = "connecting" | "online" | "offline";
export type SocketState = "connecting" | "live" | "offline";

export interface RunUiState {
  runId?: string;
  status?: SessionStatus;
  streamingText: string;
  streamingReasoning: string;
  pendingApproval?: ApprovalRequest;
  currentTool?: string;
  activity?: string;
  error?: string;
  model?: string;
  permission?: string;
  usageLabel?: string;
  contextLabel?: string;
}

export interface TranscriptRow {
  id: string;
  kind: "user" | "assistant" | "tool" | "live" | "reasoning";
  text: string;
  detail?: string;
  live?: boolean;
}

const EMPTY_RUN: RunUiState = {
  streamingText: "",
  streamingReasoning: "",
};

export const client = new ForgeApiClient();
export const connectionState = signal<ConnectionState>("connecting");
export const socketState = signal<SocketState>("connecting");
export const connectInfo = signal<ConnectResponse | undefined>();
export const workspace = signal("");
export const sessions = signal<readonly SessionSummary[]>([]);
export const snapshots = signal<Record<string, SessionSnapshot>>({});
export const activeSessionId = signal<string | undefined>();
export const runStates = signal<Record<string, RunUiState>>({});
export const composerText = signal("");
export const busyAction = signal<string | undefined>();
export const lastError = signal<string | undefined>();
export const lastCursor = signal(0);

export interface CoreSettings {
  baseUrl?: string;
  model?: string;
  hasApiKey?: boolean;
  isConfigured?: boolean;
}

export const coreSettings = signal<CoreSettings | undefined>();
export const availableModels = signal<readonly string[]>([]);

export const activeSnapshot = computed<SessionSnapshot | undefined>(() => {
  const id = activeSessionId();
  return id ? snapshots()[id] : undefined;
});

export const activeRun = computed<RunUiState>(() => {
  const id = activeSessionId();
  return (id ? runStates()[id] : undefined) ?? EMPTY_RUN;
});

export const sortedSessions = computed<readonly SessionSummary[]>(() =>
  [...sessions()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);

export const sessionCount = computed(() => sortedSessions().length);

export function runFor(sessionId: string | undefined): RunUiState {
  return (sessionId ? runStates()[sessionId] : undefined) ?? EMPTY_RUN;
}

function updateRun(sessionId: string, patch: Partial<RunUiState>): void {
  const current = runStates();
  runStates.set({
    ...current,
    [sessionId]: { ...(current[sessionId] ?? EMPTY_RUN), ...patch },
  });
}

function updateSummary(sessionId: string, patch: Partial<SessionSummary>): void {
  sessions.set(sessions().map((session) =>
    session.id === sessionId ? { ...session, ...patch } : session,
  ));
}

function putSnapshot(snapshot: SessionSnapshot): void {
  snapshots.set({ ...snapshots(), [snapshot.id]: snapshot });
}

function sortSessions(list: readonly SessionSummary[]): readonly SessionSummary[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function visibleSession(list: readonly SessionSummary[]): SessionSummary | undefined {
  return list.find((session) => !session.archived) ?? list[0];
}

export async function refreshSession(sessionId: string): Promise<void> {
  try {
    const snapshot = await client.rpc<SessionSnapshot>("getSession", { sessionId });
    putSnapshot(snapshot);
    updateSummary(sessionId, {
      title: snapshot.title,
      status: snapshot.status,
      updatedAt: snapshot.updatedAt,
      model: snapshot.model,
    });
  } catch (error) {
    lastError.set(errorText(error));
  }
}

export async function refreshSessions(): Promise<void> {
  const list = sortSessions(await client.rpc<readonly SessionSummary[]>("listSessions"));
  sessions.set(list);
  const current = activeSessionId();
  const selected = current && list.some((session) => session.id === current)
    ? current
    : visibleSession(list)?.id;
  if (selected !== current) activeSessionId.set(selected);
  if (selected) await refreshSession(selected);
}

export async function selectSession(sessionId: string): Promise<void> {
  activeSessionId.set(sessionId);
  if (!snapshots()[sessionId]) await refreshSession(sessionId);
  else void refreshSession(sessionId);
}

export async function refreshCoreConfig(): Promise<void> {
  try {
    const settings = await client.rpc<CoreSettings>("getSettings");
    coreSettings.set(settings);
    const models = await client.rpc<readonly string[]>("listModels").catch(() => []);
    availableModels.set(models);
  } catch {
    coreSettings.set(undefined);
    availableModels.set([]);
  }
}

export async function createSession(): Promise<void> {
  const root = workspace() || connectInfo()?.workspace;
  if (!root || busyAction()) return;
  busyAction.set("create");
  lastError.set(undefined);
  try {
    const configuredModel = coreSettings()?.model?.trim() || availableModels()[0];
    const snapshot = await client.rpc<SessionSnapshot>("createSession", {
      input: {
        workspace: root,
        ...(configuredModel ? { model: configuredModel } : {}),
      },
    });
    batch(() => {
      putSnapshot(snapshot);
      activeSessionId.set(snapshot.id);
    });
    await refreshSessions();
    activeSessionId.set(snapshot.id);
    if (!snapshots()[snapshot.id]) putSnapshot(snapshot);
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    busyAction.set(undefined);
  }
}

export async function sendPrompt(): Promise<void> {
  const sessionId = activeSessionId();
  const prompt = composerText().trim();
  if (!sessionId || !prompt || busyAction() === "send") return;
  composerText.set("");
  busyAction.set("send");
  lastError.set(undefined);
  updateRun(sessionId, {
    status: "running",
    error: undefined,
    activity: "Starting run",
    streamingText: "",
    streamingReasoning: "",
  });
  try {
    const handle = await client.rpc<RunHandle>("startRun", {
      input: { sessionId, prompt },
    });
    updateRun(sessionId, {
      runId: handle.runId,
      status: "running",
      activity: "Run accepted",
    });
  } catch (error) {
    composerText.set(prompt);
    const message = errorText(error);
    updateRun(sessionId, { status: "failed", error: message, activity: undefined });
    lastError.set(message);
  } finally {
    busyAction.set(undefined);
  }
}

export async function cancelActive(): Promise<void> {
  const sessionId = activeSessionId();
  if (!sessionId || busyAction() === "cancel") return;
  const run = runFor(sessionId);
  busyAction.set("cancel");
  try {
    if (run.runId) {
      await client.rpc<null>("cancelRun", { runId: run.runId });
    } else {
      await client.rpc<boolean>("cancelSession", { sessionId });
    }
    updateRun(sessionId, { status: "cancelled", activity: "Cancellation requested" });
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    busyAction.set(undefined);
  }
}

export async function answerApproval(approved: boolean): Promise<void> {
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const run = runFor(sessionId);
  const approval = run.pendingApproval;
  if (!run.runId || !approval || busyAction() === "approval") return;
  busyAction.set("approval");
  try {
    await client.rpc<null>("answerApproval", {
      runId: run.runId,
      approvalId: approval.id,
      approved,
    });
    updateRun(sessionId, {
      pendingApproval: undefined,
      status: "running",
      activity: approved ? "Approval granted" : "Approval denied",
    });
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    busyAction.set(undefined);
  }
}

function appendLimited(text: string, delta: string, limit: number): string {
  if (!delta) return text;
  const room = Math.max(0, limit - text.length);
  return text + delta.slice(0, room);
}

function usageLabel(event: AgentEvent): string | undefined {
  const usage = event.usage;
  if (!usage) return undefined;
  if ("totalTokens" in usage && typeof usage.totalTokens === "number") {
    return `${formatNumber(usage.totalTokens)} tokens`;
  }
  return undefined;
}

function contextLabel(event: AgentEvent): string | undefined {
  const usage = event.usage;
  if (!usage || !("usedTokens" in usage) || typeof usage.usedTokens !== "number") return undefined;
  const used = formatNumber(usage.usedTokens);
  const windowTokens = "windowTokens" in usage && typeof usage.windowTokens === "number"
    ? formatNumber(usage.windowTokens)
    : undefined;
  return windowTokens ? `${used} / ${windowTokens}` : used;
}

function refreshSoon(sessionId: string, includeList = false): void {
  void refreshSession(sessionId);
  if (includeList) void refreshSessions().catch((error) => lastError.set(errorText(error)));
}

function handleHostEvent(host: HostEvent): void {
  const event = host.event;
  const sessionId = event.sessionId;
  if (!sessionId) return;
  updateSummary(sessionId, { updatedAt: event.timestamp });

  if (event.type === "run_started") {
    updateRun(sessionId, {
      runId: host.runId,
      status: "running",
      streamingText: "",
      streamingReasoning: "",
      pendingApproval: undefined,
      currentTool: undefined,
      activity: "Run started",
      error: undefined,
      model: event.model,
      permission: event.permission,
      usageLabel: undefined,
    });
    updateSummary(sessionId, {
      status: "running",
      ...(event.title ? { title: event.title } : {}),
      ...(event.model ? { model: event.model } : {}),
    });
    refreshSoon(sessionId, true);
    return;
  }

  if (event.type === "generation_finished" || event.type === "retry_reset") {
    updateRun(sessionId, {
      streamingText: "",
      streamingReasoning: "",
      currentTool: undefined,
    });
    if (event.type === "generation_finished") refreshSoon(sessionId);
    return;
  }

  if (event.type === "text_delta" && event.text) {
    const current = runFor(sessionId);
    updateRun(sessionId, {
      status: current.status === "awaiting_approval" ? current.status : "running",
      streamingText: appendLimited(current.streamingText, event.text, 131072),
      activity: undefined,
    });
    return;
  }

  if (event.type === "reasoning_delta" && event.text) {
    const current = runFor(sessionId);
    updateRun(sessionId, {
      streamingReasoning: appendLimited(current.streamingReasoning, event.text, 32768),
    });
    return;
  }

  if (event.type === "tool_call_preview") {
    updateRun(sessionId, {
      currentTool: event.name || "tool",
      activity: `Preparing ${event.name || "tool"}`,
    });
    return;
  }

  if (event.type === "tool_preview_reset") {
    updateRun(sessionId, { currentTool: undefined, activity: undefined });
    return;
  }

  if (event.type === "tool_started") {
    updateRun(sessionId, {
      streamingText: "",
      streamingReasoning: "",
      currentTool: event.call?.function.name ?? "tool",
      activity: event.call ? `Running ${event.call.function.name}` : "Running tool",
    });
    refreshSoon(sessionId);
    return;
  }

  if (event.type === "tool_finished") {
    updateRun(sessionId, {
      currentTool: undefined,
      activity: event.result?.isError ? "Tool failed" : "Tool finished",
    });
    refreshSoon(sessionId);
    return;
  }

  if (event.type === "approval_requested" && event.request) {
    updateRun(sessionId, {
      status: "awaiting_approval",
      pendingApproval: event.request,
      activity: "Approval required",
    });
    updateSummary(sessionId, { status: "awaiting_approval" });
    refreshSoon(sessionId);
    return;
  }

  if (event.type === "approval_resolved") {
    const current = runFor(sessionId);
    if (!current.pendingApproval || current.pendingApproval.id === event.approvalId) {
      updateRun(sessionId, {
        pendingApproval: undefined,
        status: "running",
        activity: event.approved ? "Approval granted" : "Approval denied",
      });
    }
    return;
  }

  if (event.type === "provider_retry") {
    updateRun(sessionId, {
      activity: `Retrying provider request (${event.attempt ?? 1}/${event.maxAttempts ?? 5})`,
    });
    return;
  }

  if (event.type === "context_usage") {
    updateRun(sessionId, { contextLabel: contextLabel(event) });
    return;
  }

  if (event.type === "state_changed" && event.status && event.status !== "superseded") {
    const current = runFor(sessionId);
    const status = current.pendingApproval ? "awaiting_approval" : event.status;
    updateRun(sessionId, { status });
    updateSummary(sessionId, { status });
    return;
  }

  if (event.type === "title_changed" && event.title) {
    updateSummary(sessionId, { title: event.title });
    const snapshot = snapshots()[sessionId];
    if (snapshot) putSnapshot({ ...snapshot, title: event.title });
    return;
  }

  if (event.type === "error" && event.error) {
    updateRun(sessionId, {
      error: event.error.message,
      activity: undefined,
    });
    return;
  }

  if (event.type === "run_finished" && event.status && event.status !== "superseded") {
    updateRun(sessionId, {
      status: event.status,
      streamingText: "",
      streamingReasoning: "",
      pendingApproval: undefined,
      currentTool: undefined,
      activity: undefined,
      usageLabel: usageLabel(event),
    });
    updateSummary(sessionId, { status: event.status });
    refreshSoon(sessionId, true);
  }
}

let reconnectTimer: number | undefined;
let bootStarted = false;

function openEventStream(cursor: number): void {
  socketState.set("connecting");
  client.openEvents(cursor, {
    onOpen: () => socketState.set("live"),
    onEvents: (events, nextCursor) => {
      lastCursor.set(nextCursor);
      for (const hostEvent of events) handleHostEvent(hostEvent);
    },
    onClose: () => {
      socketState.set("offline");
      scheduleReconnect();
    },
    onError: () => socketState.set("offline"),
  });
}

async function reconnect(): Promise<void> {
  connectionState.set("connecting");
  try {
    // A fresh page connection is also the recovery path for an expired replay cursor.
    const info = await client.connect();
    batch(() => {
      connectInfo.set(info);
      workspace.set(info.workspace);
      connectionState.set("online");
      lastCursor.set(info.cursor);
    });
    openEventStream(info.cursor);
    await refreshSessions();
    await refreshCoreConfig();
  } catch (error) {
    connectionState.set("offline");
    lastError.set(errorText(error));
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void reconnect();
  }, 1800);
}

export async function boot(): Promise<void> {
  if (bootStarted) return;
  bootStarted = true;
  connectionState.set("connecting");
  try {
    const info = await client.connect();
    batch(() => {
      connectInfo.set(info);
      workspace.set(info.workspace);
      connectionState.set("online");
      lastCursor.set(info.cursor);
    });
    openEventStream(info.cursor);
    await refreshSessions();
    await refreshCoreConfig();
  } catch (error) {
    connectionState.set("offline");
    lastError.set(errorText(error));
    scheduleReconnect();
  }
}

export const transcriptRows = computed<readonly TranscriptRow[]>(() => {
  const snapshot = activeSnapshot();
  const run = activeRun();
  const rows: TranscriptRow[] = [];
  if (snapshot) {
    for (const [index, message] of snapshot.messages.entries()) {
      if (message.role === "system") continue;
      if (message.role === "user") {
        rows.push({
          id: `user-${index}`,
          kind: "user",
          text: message.content,
          detail: message.images?.length ? `${message.images.length} image attachment(s)` : undefined,
        });
        continue;
      }
      if (message.role === "assistant") {
        if (message.reasoning?.trim()) {
          rows.push({
            id: `reasoning-${index}`,
            kind: "reasoning",
            text: clampText(message.reasoning, 1600),
          });
        }
        if (message.content?.trim()) {
          rows.push({ id: `assistant-${index}`, kind: "assistant", text: message.content });
        }
        if (message.tool_calls?.length) {
          rows.push({
            id: `calls-${index}`,
            kind: "tool",
            text: `Requested ${message.tool_calls.map((call) => call.function.name).join(", ")}`,
            detail: "Tool call arguments are summarized by the PoC renderer.",
          });
        }
        continue;
      }
      rows.push({
        id: `tool-${index}`,
        kind: "tool",
        text: clampText(message.content, 1400),
        detail: `Tool result ${message.tool_call_id.slice(0, 8)}`,
      });
    }
  }
  if (run.streamingReasoning.trim()) {
    rows.push({
      id: "live-reasoning",
      kind: "reasoning",
      text: clampText(run.streamingReasoning, 1600),
      live: true,
    });
  }
  if (run.streamingText.trim()) {
    rows.push({ id: "live-assistant", kind: "live", text: run.streamingText, live: true });
  }
  return rows;
});
