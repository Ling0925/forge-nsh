import { batch, computed, setColorScheme, signal } from "nsh";
import { clampText, errorText, formatNumber } from "./format";
import {
  type AgentEvent,
  type ApprovalRequest,
  type ConfigureInput,
  type ConnectResponse,
  ForgeApiClient,
  type HostEvent,
  type ModelAccessResult,
  type PublicProviderPreset,
  type PublicSettings,
  type RunHandle,
  type SessionSnapshot,
  type SessionStatus,
  type SessionSummary,
  type ThemePreference,
} from "./protocol";
import {
  type AssistantTranscriptItem,
  buildTranscriptItems,
  type ReasoningTranscriptItem,
  type TranscriptItem,
} from "./transcript";

export type { TranscriptItem };

export type ConnectionState = "connecting" | "online" | "offline";
export type SocketState = "connecting" | "live" | "offline";
export type BusyAction = "create" | "send" | "cancel" | "approval" | "refresh";

export interface RunUiState {
  runId?: string;
  status?: SessionStatus;
  streamingText: string;
  streamingReasoning: string;
  pendingApproval?: ApprovalRequest;
  currentTool?: string;
  toolPreviewStats?: {
    argsChars?: number;
    linesAdded?: number;
    linesRemoved?: number;
  };
  activity?: string;
  error?: string;
  model?: string;
  permission?: string;
  usageLabel?: string;
  contextLabel?: string;
  lastEventAt?: string;
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
const busyActions = signal<ReadonlySet<BusyAction>>(new Set());
export const sidebarOpen = signal(false);
export const scrollToBottomTick = signal(0);
export const lastError = signal<string | undefined>();
export const lastCursor = signal(0);

export function isBusy(action: BusyAction): boolean {
  return busyActions().has(action);
}

function setBusy(action: BusyAction, active: boolean): void {
  const next = new Set(busyActions());
  if (active) next.add(action);
  else next.delete(action);
  busyActions.set(next);
}

export function isWorkingStatus(status: string | undefined): boolean {
  return status === "running" || status === "awaiting_approval";
}

export type SettingsLoadState = "idle" | "loading" | "ready" | "error";

export const coreSettings = signal<PublicSettings | undefined>();
export const availableModels = signal<readonly string[]>([]);
export const settingsOpen = signal(false);
export type SettingsSection = "provider" | "general";
export const settingsSection = signal<SettingsSection>("provider");
export const settingsLoadState = signal<SettingsLoadState>("idle");
export const settingsLoadError = signal<string | undefined>();

/** Settings writes require both a live Core and a fresh authoritative read. */
export const settingsWritable = computed(() =>
  connectionState() === "online" &&
  settingsLoadState() === "ready" &&
  coreSettings() !== undefined
);

export const activeSnapshot = computed<SessionSnapshot | undefined>(() => {
  const id = activeSessionId();
  return id ? snapshots()[id] : undefined;
});

export const activeRun = computed<RunUiState>(() => {
  const id = activeSessionId();
  return (id ? runStates()[id] : undefined) ?? EMPTY_RUN;
});

export const activeStatus = computed<SessionStatus | undefined>(() =>
  activeRun().status ?? activeSnapshot()?.status
);

export const activeWorking = computed(() => isWorkingStatus(activeStatus()));

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

const sessionRefreshSeq = new Map<string, number>();

export async function refreshSession(sessionId: string): Promise<void> {
  const seq = (sessionRefreshSeq.get(sessionId) ?? 0) + 1;
  sessionRefreshSeq.set(sessionId, seq);
  try {
    const snapshot = await client.rpc<SessionSnapshot>("getSession", { sessionId });
    if (sessionRefreshSeq.get(sessionId) !== seq) return;
    putSnapshot(snapshot);
    updateSummary(sessionId, {
      title: snapshot.title,
      status: snapshot.status,
      updatedAt: snapshot.updatedAt,
      model: snapshot.model,
    });
  } catch (error) {
    if (sessionRefreshSeq.get(sessionId) === seq) lastError.set(errorText(error));
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

export async function manualRefresh(): Promise<void> {
  if (isBusy("refresh") || connectionState() !== "online") return;
  setBusy("refresh", true);
  lastError.set(undefined);
  try {
    await refreshSessions();
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    setBusy("refresh", false);
  }
}

export async function selectSession(sessionId: string): Promise<void> {
  batch(() => {
    sidebarOpen.set(false);
    activeSessionId.set(sessionId);
    scrollToBottomTick.update((n) => n + 1);
  });
  if (!snapshots()[sessionId]) await refreshSession(sessionId);
  else void refreshSession(sessionId);
}

function adoptCoreSettings(settings: PublicSettings): void {
  coreSettings.set(settings);
  // Forge and the CLI share this preference. NSH can honor it directly,
  // including the light/dark token pair already defined by the app theme.
  setColorScheme(settings.theme ?? "system");
}

export async function listProviderModels(
  sourceId?: string,
  refresh = false,
): Promise<readonly string[]> {
  return client.rpc<readonly string[]>("listModels", {
    ...(sourceId ? { sourceId } : {}),
    ...(refresh ? { refresh: true } : {}),
  });
}

/** Rich host catalog read: includes models hidden from runtime selection and
 * returns stale-cache metadata instead of discarding a previously good list.
 */
export async function listProviderCatalog(
  sourceId: string,
  refresh = false,
): Promise<Extract<ModelAccessResult, { type: "catalog" }>> {
  const result = await client.rpc<ModelAccessResult>("modelAccess", {
    input: {
      type: "catalog",
      sourceId,
      includeUnselected: true,
      ...(refresh ? { refresh: true } : {}),
    },
  });
  if (result.type !== "catalog") throw new Error("Forge Core returned the wrong catalog response.");
  return result;
}

export async function listProviderPresets(): Promise<readonly PublicProviderPreset[]> {
  const result = await client.rpc<ModelAccessResult>("modelAccess", {
    input: { type: "presets" },
  });
  if (result.type !== "presets") throw new Error("Forge Core returned the wrong preset response.");
  return result.presets;
}

let coreConfigRequest = 0;
let settingsSaveTail: Promise<void> = Promise.resolve();

/** Returns true only when this request installed a fresh authoritative snapshot. */
export async function refreshCoreConfig(): Promise<boolean> {
  const request = ++coreConfigRequest;
  settingsLoadState.set("loading");
  settingsLoadError.set(undefined);
  try {
    const settings = await client.rpc<PublicSettings>("getSettings");
    if (request !== coreConfigRequest) return false;
    adoptCoreSettings(settings);
    settingsLoadState.set("ready");
    const models = await listProviderModels().catch(() => []);
    if (request === coreConfigRequest) availableModels.set(models);
    return true;
  } catch (error) {
    if (request !== coreConfigRequest) return false;
    // Keep the last good snapshot visible while offline; the editor is disabled
    // until the connection and a fresh read are both available.
    settingsLoadState.set("error");
    settingsLoadError.set(errorText(error));
    if (!coreSettings()) availableModels.set([]);
    return false;
  }
}

/** Persist updates sequentially and adopt the authoritative public projection.
 * Serialization prevents an earlier transaction's response from overwriting a
 * newer one when the provider and general editors are used together.
 */
export function saveSettings(input: ConfigureInput): Promise<PublicSettings> {
  const operation = settingsSaveTail.then(async () => {
    const settings = await client.rpc<PublicSettings>("updateSettings", { input });
    // A refresh that started before this write can land after it with a stale
    // projection. Invalidate it only once the write is known to have succeeded.
    coreConfigRequest += 1;
    batch(() => {
      adoptCoreSettings(settings);
      settingsLoadState.set("ready");
      settingsLoadError.set(undefined);
    });
    return settings;
  });
  settingsSaveTail = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function openSettings(section?: SettingsSection): void {
  batch(() => {
    if (section) settingsSection.set(section);
    sidebarOpen.set(false);
    settingsOpen.set(true);
  });
}

export async function applyThemePreference(theme: ThemePreference): Promise<void> {
  setColorScheme(theme);
  if (!settingsWritable()) return;
  try {
    await saveSettings({ settings: { theme } });
  } catch (error) {
    lastError.set(errorText(error));
  }
}

export function closeSettings(): void {
  settingsOpen.set(false);
}

export async function createSession(): Promise<void> {
  const root = workspace() || connectInfo()?.workspace;
  if (!root || isBusy("create") || connectionState() !== "online") return;
  setBusy("create", true);
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
      sidebarOpen.set(false);
      putSnapshot(snapshot);
      activeSessionId.set(snapshot.id);
      scrollToBottomTick.update((n) => n + 1);
    });
    await refreshSessions();
    activeSessionId.set(snapshot.id);
    if (!snapshots()[snapshot.id]) putSnapshot(snapshot);
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    setBusy("create", false);
  }
}

export async function sendPrompt(): Promise<void> {
  const sessionId = activeSessionId();
  const prompt = composerText().trim();
  if (!sessionId || !prompt || isBusy("send") || connectionState() !== "online") return;
  const currentStatus = runFor(sessionId).status ?? snapshots()[sessionId]?.status;
  if (isWorkingStatus(currentStatus)) return;
  batch(() => {
    composerText.set("");
    setBusy("send", true);
    lastError.set(undefined);
    scrollToBottomTick.update((n) => n + 1);
    updateRun(sessionId, {
      status: "running",
      error: undefined,
      activity: "Starting run",
      streamingText: "",
      streamingReasoning: "",
    });
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
    if (activeSessionId() === sessionId && composerText().trim().length === 0) {
      composerText.set(prompt);
    }
    const message = errorText(error);
    updateRun(sessionId, { status: "failed", error: message, activity: undefined });
    lastError.set(message);
  } finally {
    setBusy("send", false);
  }
}

export async function cancelActive(): Promise<void> {
  const sessionId = activeSessionId();
  if (!sessionId || isBusy("cancel")) return;
  const run = runFor(sessionId);
  setBusy("cancel", true);
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
    setBusy("cancel", false);
  }
}

export async function answerApproval(approved: boolean): Promise<void> {
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const run = runFor(sessionId);
  const approval = run.pendingApproval;
  if (!run.runId || !approval || isBusy("approval")) return;
  setBusy("approval", true);
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
    setBusy("approval", false);
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

interface PendingRefresh {
  sessionIds: Set<string>;
  includeList: boolean;
}

function queueRefresh(pending: PendingRefresh, sessionId: string, includeList = false): void {
  pending.sessionIds.add(sessionId);
  if (includeList) pending.includeList = true;
}

function flushPendingRefresh(pending: PendingRefresh): void {
  if (pending.includeList) {
    const active = activeSessionId();
    void refreshSessions().catch((error) => lastError.set(errorText(error)));
    for (const id of pending.sessionIds) {
      if (id !== active) void refreshSession(id);
    }
    return;
  }
  for (const id of pending.sessionIds) {
    void refreshSession(id);
  }
}

function handleHostEvent(host: HostEvent, pending: PendingRefresh): void {
  const event = host.event;
  const sessionId = event.sessionId;
  if (!sessionId) return;
  const isDelta = event.type === "text_delta" || event.type === "reasoning_delta";
  if (!isDelta) updateSummary(sessionId, { updatedAt: event.timestamp });

  if (event.type === "run_started") {
    updateRun(sessionId, {
      runId: host.runId,
      status: "running",
      streamingText: "",
      streamingReasoning: "",
      pendingApproval: undefined,
      currentTool: undefined,
      toolPreviewStats: undefined,
      activity: "Run started",
      error: undefined,
      model: event.model,
      permission: event.permission,
      usageLabel: undefined,
      lastEventAt: event.timestamp,
    });
    updateSummary(sessionId, {
      status: "running",
      ...(event.title ? { title: event.title } : {}),
      ...(event.model ? { model: event.model } : {}),
    });
    queueRefresh(pending, sessionId, true);
    return;
  }

  if (event.type === "generation_finished" || event.type === "retry_reset") {
    updateRun(sessionId, {
      streamingText: "",
      streamingReasoning: "",
      currentTool: undefined,
      toolPreviewStats: undefined,
      lastEventAt: event.timestamp,
    });
    if (event.type === "generation_finished") queueRefresh(pending, sessionId);
    return;
  }

  if (event.type === "text_delta" && event.text) {
    const current = runFor(sessionId);
    updateRun(sessionId, {
      status: current.status === "awaiting_approval" ? current.status : "running",
      streamingText: appendLimited(current.streamingText, event.text, 131072),
      activity: undefined,
      lastEventAt: event.timestamp,
    });
    return;
  }

  if (event.type === "reasoning_delta" && event.text) {
    const current = runFor(sessionId);
    updateRun(sessionId, {
      streamingReasoning: appendLimited(current.streamingReasoning, event.text, 32768),
      lastEventAt: event.timestamp,
    });
    return;
  }

  if (event.type === "tool_call_preview") {
    updateRun(sessionId, {
      currentTool: event.name || "tool",
      toolPreviewStats: {
        ...(typeof event.argumentsChars === "number" ? { argsChars: event.argumentsChars } : {}),
        ...(typeof event.linesAdded === "number" ? { linesAdded: event.linesAdded } : {}),
        ...(typeof event.linesRemoved === "number" ? { linesRemoved: event.linesRemoved } : {}),
      },
      activity: `Preparing ${event.name || "tool"}`,
      lastEventAt: event.timestamp,
    });
    return;
  }

  if (event.type === "tool_preview_reset") {
    updateRun(sessionId, {
      currentTool: undefined,
      toolPreviewStats: undefined,
      activity: undefined,
      lastEventAt: event.timestamp,
    });
    return;
  }

  if (event.type === "tool_started") {
    updateRun(sessionId, {
      streamingText: "",
      streamingReasoning: "",
      currentTool: event.call?.function.name ?? "tool",
      toolPreviewStats: undefined,
      activity: event.call ? `Running ${event.call.function.name}` : "Running tool",
      lastEventAt: event.timestamp,
    });
    queueRefresh(pending, sessionId);
    return;
  }

  if (event.type === "tool_finished") {
    updateRun(sessionId, {
      currentTool: undefined,
      activity: event.result?.isError ? "Tool failed" : "Tool finished",
      lastEventAt: event.timestamp,
    });
    queueRefresh(pending, sessionId);
    return;
  }

  if (event.type === "approval_requested" && event.request) {
    updateRun(sessionId, {
      status: "awaiting_approval",
      pendingApproval: event.request,
      activity: "Approval required",
      lastEventAt: event.timestamp,
    });
    updateSummary(sessionId, { status: "awaiting_approval" });
    queueRefresh(pending, sessionId);
    return;
  }

  if (event.type === "approval_resolved") {
    const current = runFor(sessionId);
    if (!current.pendingApproval || current.pendingApproval.id === event.approvalId) {
      updateRun(sessionId, {
        pendingApproval: undefined,
        status: "running",
        activity: event.approved ? "Approval granted" : "Approval denied",
        lastEventAt: event.timestamp,
      });
    } else {
      updateRun(sessionId, { lastEventAt: event.timestamp });
    }
    return;
  }

  if (event.type === "provider_retry") {
    updateRun(sessionId, {
      activity: `Retrying provider request (${event.attempt ?? 1}/${event.maxAttempts ?? 5})`,
      lastEventAt: event.timestamp,
    });
    return;
  }

  if (event.type === "context_usage") {
    updateRun(sessionId, { contextLabel: contextLabel(event), lastEventAt: event.timestamp });
    return;
  }

  if (event.type === "state_changed" && event.status && event.status !== "superseded") {
    const current = runFor(sessionId);
    const status = current.pendingApproval ? "awaiting_approval" : event.status;
    updateRun(sessionId, { status, lastEventAt: event.timestamp });
    updateSummary(sessionId, { status });
    return;
  }

  if (event.type === "title_changed" && event.title) {
    updateRun(sessionId, { lastEventAt: event.timestamp });
    updateSummary(sessionId, { title: event.title });
    const snapshot = snapshots()[sessionId];
    if (snapshot) putSnapshot({ ...snapshot, title: event.title });
    return;
  }

  if (event.type === "error" && event.error) {
    updateRun(sessionId, {
      error: event.error.message,
      activity: undefined,
      lastEventAt: event.timestamp,
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
      toolPreviewStats: undefined,
      activity: undefined,
      usageLabel: usageLabel(event),
      lastEventAt: event.timestamp,
    });
    updateSummary(sessionId, { status: event.status });
    queueRefresh(pending, sessionId, true);
    return;
  }

  updateRun(sessionId, { lastEventAt: event.timestamp });
}

let reconnectTimer: number | undefined;
let bootStarted = false;

function openEventStream(cursor: number): void {
  socketState.set("connecting");
  client.openEvents(cursor, {
    onOpen: () => socketState.set("live"),
    onEvents: (events, nextCursor) => {
      const pending: PendingRefresh = { sessionIds: new Set(), includeList: false };
      batch(() => {
        lastCursor.set(nextCursor);
        for (const hostEvent of events) handleHostEvent(hostEvent, pending);
      });
      flushPendingRefresh(pending);
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

export const historyItems = computed<readonly TranscriptItem[]>(() => {
  const snapshot = activeSnapshot();
  return snapshot ? buildTranscriptItems(snapshot) : [];
});

export const liveReasoningItem = computed<ReasoningTranscriptItem | undefined>(() => {
  const trimmed = activeRun().streamingReasoning.trim();
  if (!trimmed) return undefined;
  return {
    id: "live-reasoning",
    kind: "reasoning",
    text: clampText(trimmed, 8000),
    charCount: trimmed.length,
    live: true,
  };
});

export const liveAssistantItem = computed<AssistantTranscriptItem | undefined>(() => {
  const run = activeRun();
  if (!run.streamingText.trim()) return undefined;
  return {
    id: "live-assistant",
    kind: "assistant",
    text: run.streamingText,
    model: run.model ?? activeSnapshot()?.model,
    live: true,
  };
});

export const showLiveWorking = computed(() => activeWorking() && liveAssistantItem() === undefined);

export const hasTranscriptContent = computed(() =>
  historyItems().length > 0 ||
  liveReasoningItem() !== undefined ||
  liveAssistantItem() !== undefined ||
  showLiveWorking()
);

export const userTurnCount = computed(() =>
  activeSnapshot()?.messages.filter((message) => message.role === "user").length ?? 0
);
