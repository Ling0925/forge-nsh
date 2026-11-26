import {
  batch,
  cleanup,
  computed,
  effect,
  List,
  mount,
  Scroll,
  signal,
  Text,
  UrlScheme,
  View,
} from "nsh";
import { Button, Input, TextView } from "nsh/base";

type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

type ConnectionState = "connecting" | "online" | "offline";

interface SessionSummary {
  id: string;
  title: string;
  workspace: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  archived?: boolean;
}

interface ToolCall {
  id: string;
  function?: { name?: string; arguments?: string };
}

interface CoreMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface SessionSnapshot extends SessionSummary {
  messages?: CoreMessage[];
  events?: unknown[];
}

interface ConnectResponse {
  workspace: string;
  restrictWorkspace: boolean;
  cursor: number;
  clientId: string;
}

interface HostRun {
  runId: string;
  sessionId: string;
  status: SessionStatus;
  stopping: boolean;
  pendingApprovals?: ApprovalRequest[];
}

interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  description: string;
  command?: readonly string[];
}

interface Activity {
  id: string;
  label: string;
  detail: string;
  state: "running" | "done" | "error";
}

const connection = signal<ConnectionState>("connecting");
const eventSocketState = signal<"connecting" | "open" | "closed">("closed");
const clientId = signal("");
const eventCursor = signal(0);
const workspace = signal("");
const sessions = signal<SessionSummary[]>([]);
const selectedSessionId = signal<string | null>(null);
const currentSession = signal<SessionSnapshot | null>(null);
const hostRuns = signal<HostRun[]>([]);
const settingsModel = signal("");
const providerConfigured = signal(false);
const draft = signal("");
const sending = signal(false);
const liveText = signal("");
const liveReasoning = signal("");
const activities = signal<Activity[]>([]);
const pendingApprovals = signal<ApprovalRequest[]>([]);
const activeRunId = signal<string | null>(null);
const lastError = signal("");

const transcriptMessages = computed((): CoreMessage[] => {
  const messages = currentSession()?.messages ?? [];
  return messages.filter((message) => message.role !== "system");
});

const selectedSummary = computed((): SessionSummary | null => {
  const id = selectedSessionId();
  return sessions().find((session) => session.id === id) ?? null;
});

const activeRun = computed((): HostRun | null => {
  const id = selectedSessionId();
  return hostRuns().find((run) => run.sessionId === id) ?? null;
});

const runActive = computed((): boolean => {
  const status = activeRun()?.status ?? currentSession()?.status;
  return sending() || status === "running" || status === "awaiting_approval";
});

const titleText = computed((): string => {
  return currentSession()?.title ?? selectedSummary()?.title ?? "New session";
});

const modelText = computed((): string => {
  return (
    currentSession()?.model ??
    selectedSummary()?.model ??
    (settingsModel() || (providerConfigured() ? "Configured" : "Not configured"))
  );
});

const markdownClasses = {
  root: "text-[15px] leading-7 text-foreground",
  paragraph: "text-[15px] leading-7 text-foreground",
  heading: "text-foreground",
  heading1: "mt-2 text-2xl font-semibold text-foreground",
  heading2: "mt-2 text-xl font-semibold text-foreground",
  heading3: "mt-2 text-lg font-semibold text-foreground",
  blockquote: "border-l-2 border-primary/50 pl-4 text-muted-foreground",
  list: "text-foreground",
  listItem: "text-foreground",
  codeBlock: "border border-border bg-[#0a0d12]",
  codeBlockCode: "font-mono text-[13px] leading-6 text-[#d8e1ee]",
  code: "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-cyan",
  link: "text-info underline",
  tableCell: "text-sm text-foreground",
} as const;

let socket: WebSocket | undefined;
let reconnectTimer: number | undefined;
let refreshTimer: number | undefined;
let connectInFlight = false;
let manualClose = false;
let socketGeneration = 0;
let sessionLoadSerial = 0;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function endpoint(path: string): string {
  const page = UrlScheme.url();
  if (page) {
    try {
      return new URL(path, page).toString();
    } catch {
      // The web host always supplies a page URL; native fallback uses a path.
    }
  }
  return path;
}

function eventsEndpoint(id: string, cursor: number): string {
  const path = `/api/events?clientId=${encodeURIComponent(id)}&cursor=${cursor}`;
  const page = UrlScheme.url();
  if (page) {
    const url = new URL(path, page);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
  return path;
}

function uuid(): string {
  const api = crypto as typeof crypto & {
    randomBytes?: (size: number) => Uint8Array;
  };
  if (typeof api.randomUUID === "function") return api.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof api.getRandomValues === "function") {
    api.getRandomValues(bytes);
  } else if (typeof api.randomBytes === "function") {
    bytes.set(api.randomBytes(16));
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function shortPath(path: string): string {
  if (path.length <= 42) return path;
  return `…${path.slice(-41)}`;
}

function timeAgo(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function statusLabel(status: SessionStatus | undefined): string {
  switch (status) {
    case "running":
      return "Running";
    case "awaiting_approval":
      return "Approval";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    default:
      return "Idle";
  }
}

function upsertActivity(next: Activity): void {
  activities.update((items) => {
    const index = items.findIndex((item) => item.id === next.id);
    const copy = [...items];
    if (index >= 0) copy[index] = next;
    else copy.push(next);
    return copy.slice(-8);
  });
}

function completeActivity(id: string, state: "done" | "error"): void {
  activities.update((items) =>
    items.map((item) => (item.id === id ? { ...item, state } : item)),
  );
}

function scheduleReconnect(): void {
  if (manualClose || reconnectTimer !== undefined) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connectOnce();
  }, 2500);
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function rpc(method: string, fields: Record<string, unknown> = {}): Promise<any> {
  const id = clientId();
  if (!id) throw new Error("The Forge connection is not ready yet.");
  const response = await fetch(endpoint("/api/rpc"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forge-Client": id,
    },
    body: JSON.stringify({ id: uuid(), method, ...fields }),
  });
  const payload = await readJson(response);
  if (response.status === 410) scheduleReconnect();
  if (!response.ok) {
    throw new Error(payload.error ?? `Forge Core returned HTTP ${response.status}.`);
  }
  if (!payload.ok) {
    throw new Error(payload.error?.message ?? payload.error ?? "Forge RPC failed.");
  }
  return payload.result;
}

async function refreshSettings(): Promise<void> {
  try {
    const settings = await rpc("getSettings");
    settingsModel.set(settings.model ?? "");
    providerConfigured.set(Boolean(settings.isConfigured));
  } catch {
    settingsModel.set("");
    providerConfigured.set(false);
  }
}

async function refreshHostState(): Promise<void> {
  try {
    const state = await rpc("getHostState");
    hostRuns.set((state.runs ?? []) as HostRun[]);
  } catch {
    hostRuns.set([]);
  }
}

async function refreshSession(): Promise<void> {
  const id = selectedSessionId();
  if (!id) return;
  const serial = ++sessionLoadSerial;
  try {
    const snapshot = (await rpc("getSession", { sessionId: id })) as SessionSnapshot;
    if (serial === sessionLoadSerial && selectedSessionId() === id) {
      currentSession.set(snapshot);
    }
  } catch (error) {
    if (serial === sessionLoadSerial) lastError.set(errorText(error));
  }
}

function scheduleSessionRefresh(): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    void refreshSession();
    void refreshSessions(false);
    void refreshHostState();
  }, 120);
}

async function refreshSessions(loadCurrent = true): Promise<void> {
  const result = (await rpc("listSessions")) as SessionSummary[];
  const visible = result
    .filter((session) => !session.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  sessions.set(visible);
  const selected = selectedSessionId();
  if (selected && visible.some((session) => session.id === selected)) {
    if (loadCurrent) await refreshSession();
    return;
  }
  if (visible.length > 0) {
    selectedSessionId.set(visible[0].id);
    if (loadCurrent) await refreshSession();
  } else {
    selectedSessionId.set(null);
    currentSession.set(null);
  }
}

async function selectSession(id: string): Promise<void> {
  batch(() => {
    selectedSessionId.set(id);
    currentSession.set(null);
    liveText.set("");
    liveReasoning.set("");
    activities.set([]);
  });
  await refreshSession();
}

async function createSession(): Promise<SessionSnapshot> {
  const path = workspace();
  if (!path) throw new Error("Forge Core has not reported a workspace yet.");
  const snapshot = (await rpc("createSession", {
    input: { workspace: path },
  })) as SessionSnapshot;
  batch(() => {
    selectedSessionId.set(snapshot.id);
    currentSession.set(snapshot);
    liveText.set("");
    liveReasoning.set("");
    activities.set([]);
  });
  void refreshSessions(false);
  return snapshot;
}

async function createSessionFromUi(): Promise<void> {
  try {
    lastError.set("");
    await createSession();
  } catch (error) {
    lastError.set(errorText(error));
  }
}

function appendOptimisticUserMessage(sessionId: string, prompt: string): void {
  const snapshot = currentSession();
  if (!snapshot || snapshot.id !== sessionId) return;
  currentSession.set({
    ...snapshot,
    status: "running",
    messages: [
      ...(snapshot.messages ?? []),
      { role: "user", content: prompt } as CoreMessage,
    ],
  });
}

async function sendPrompt(): Promise<void> {
  const prompt = draft().trim();
  if (!prompt || sending() || connection() !== "online") return;
  sending.set(true);
  lastError.set("");
  try {
    let sessionId = selectedSessionId();
    if (!sessionId) sessionId = (await createSession()).id;
    draft.set("");
    liveText.set("");
    liveReasoning.set("");
    const handle = await rpc("startRun", {
      input: { sessionId, prompt },
    });
    activeRunId.set(handle.runId ?? null);
    appendOptimisticUserMessage(sessionId, prompt);
    await refreshHostState();
  } catch (error) {
    lastError.set(errorText(error));
  } finally {
    sending.set(false);
  }
}

async function cancelRun(): Promise<void> {
  const sessionId = selectedSessionId();
  if (!sessionId) return;
  try {
    lastError.set("");
    const runId = activeRun()?.runId ?? activeRunId();
    if (runId) {
      await rpc("cancelRun", { runId, wait: false });
    } else {
      await rpc("cancelSession", { sessionId });
    }
    await refreshHostState();
  } catch (error) {
    lastError.set(errorText(error));
  }
}

async function answerApproval(approval: ApprovalRequest, approved: boolean): Promise<void> {
  try {
    lastError.set("");
    const run = hostRuns().find((item) => item.sessionId === approval.sessionId);
    const runId = run?.runId ?? activeRunId();
    if (!runId) throw new Error("The run for this approval is no longer known.");
    await rpc("answerApproval", {
      runId,
      approvalId: approval.id,
      approved,
    });
    pendingApprovals.update((items) => items.filter((item) => item.id !== approval.id));
    await refreshHostState();
  } catch (error) {
    lastError.set(errorText(error));
  }
}

function rememberApproval(request: ApprovalRequest): void {
  pendingApprovals.update((items) => {
    const rest = items.filter((item) => item.id !== request.id);
    return [...rest, request].slice(-6);
  });
}

function forgetApproval(id: string): void {
  pendingApprovals.update((items) => items.filter((item) => item.id !== id));
}

function handleAgentEvent(event: any): void {
  if (!event || typeof event.type !== "string") return;
  const type = event.type as string;
  if (type === "approval_requested" && event.request) {
    rememberApproval(event.request as ApprovalRequest);
    void refreshHostState();
  }
  if (type === "approval_resolved" && typeof event.approvalId === "string") {
    forgetApproval(event.approvalId);
    void refreshHostState();
  }
  if (type === "title_changed" || type === "run_finished" || type === "state_changed") {
    scheduleSessionRefresh();
  }

  if (event.sessionId !== selectedSessionId()) return;

  if (type === "generation_started") {
    liveText.set("");
    liveReasoning.set("");
  } else if (type === "retry_reset") {
    liveText.set("");
    liveReasoning.set("");
  } else if (type === "text_delta" && typeof event.text === "string") {
    liveText.update((text) => `${text}${event.text}`.slice(-131072));
  } else if (type === "reasoning_delta" && typeof event.text === "string") {
    liveReasoning.update((text) => `${text}${event.text}`.slice(-32768));
  } else if (type === "tool_call_preview") {
    upsertActivity({
      id: `preview:${String(event.previewId ?? event.generationId ?? uuid())}`,
      label: String(event.name ?? "tool"),
      detail: `${Number(event.argumentsChars ?? 0)} chars`,
      state: "running",
    });
  } else if (type === "tool_started" && event.call) {
    const name = String(event.call.function?.name ?? "tool");
    const id = String(event.call.id ?? uuid());
    if (typeof event.previewId === "string") completeActivity(`preview:${event.previewId}`, "done");
    upsertActivity({
      id: `tool:${id}`,
      label: name,
      detail: "running",
      state: "running",
    });
  } else if (type === "tool_finished") {
    completeActivity(`tool:${String(event.toolCallId ?? "")}`, "done");
  } else if (type === "run_started") {
    batch(() => {
      liveText.set("");
      liveReasoning.set("");
      activities.set([]);
    });
    scheduleSessionRefresh();
  } else if (
    type === "generation_finished" ||
    type === "step_finished" ||
    type === "run_finished" ||
    type === "state_changed" ||
    type === "error"
  ) {
    scheduleSessionRefresh();
  }
}

function openEvents(connect: ConnectResponse): void {
  socket?.close();
  const generation = ++socketGeneration;
  const ws = new WebSocket(eventsEndpoint(connect.clientId, connect.cursor));
  socket = ws;
  eventSocketState.set("connecting");
  ws.onopen = () => {
    if (generation === socketGeneration) eventSocketState.set("open");
  };
  ws.onmessage = (message) => {
    if (generation !== socketGeneration || typeof message.data !== "string") return;
    try {
      const frame = JSON.parse(message.data) as { cursor?: number; events?: unknown[] };
      if (typeof frame.cursor === "number") {
        eventCursor.set(frame.cursor);
        ws.send(JSON.stringify({ cursor: frame.cursor }));
      }
      if (Array.isArray(frame.events)) {
        for (const event of frame.events) handleAgentEvent(event);
      }
    } catch (error) {
      console.warn("invalid Forge event frame", errorText(error));
    }
  };
  ws.onerror = () => {
    if (generation === socketGeneration) eventSocketState.set("closed");
  };
  ws.onclose = () => {
    if (generation !== socketGeneration || manualClose) return;
    eventSocketState.set("closed");
    connection.set("offline");
    scheduleReconnect();
  };
}

async function connectOnce(): Promise<void> {
  if (connectInFlight || manualClose) return;
  connectInFlight = true;
  connection.set("connecting");
  try {
    const response = await fetch(endpoint("/api/connect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = (await readJson(response)) as ConnectResponse & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Forge Core returned HTTP ${response.status}.`);
    }
    batch(() => {
      clientId.set(payload.clientId);
      eventCursor.set(payload.cursor);
      workspace.set(payload.workspace);
      connection.set("online");
      lastError.set("");
    });
    openEvents(payload);
    await Promise.all([
      refreshSessions().catch((error) => lastError.set(errorText(error))),
      refreshSettings(),
      refreshHostState(),
    ]);
  } catch (error) {
    connection.set("offline");
    lastError.set(errorText(error));
    scheduleReconnect();
  } finally {
    connectInFlight = false;
  }
}

function shutdown(): void {
  manualClose = true;
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  socket?.close();
}

function StatusDot(props: { tone: "up" | "warn" | "down" | "muted" }) {
  return (
    <View
      class="size-2 rounded-full"
      classList={{
        "bg-up": props.tone === "up",
        "bg-warn": props.tone === "warn",
        "bg-destructive": props.tone === "down",
        "bg-muted-foreground": props.tone === "muted",
      }}
    />
  );
}

function Logo(props: { size?: number }) {
  const size = props.size ?? 36;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(10, size / 3),
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(135deg, #7c6cff, #22d3ee)",
        boxShadow: "0 10px 30px rgba(124, 108, 255, 0.28)",
      }}
    >
      <Text class="font-bold text-white" style={{ fontSize: size * 0.42 }}>F</Text>
    </View>
  );
}

function NewSessionButton() {
  return (
    <Button
      onPress={() => void createSessionFromUi()}
      disabled={connection() !== "online"}
      class="mx-3 mb-3 h-10 items-center justify-center rounded-xl bg-primary px-3 transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-45"
    >
      <Text class="text-sm font-semibold text-primary-foreground">+ New session</Text>
    </Button>
  );
}

function SessionRow(props: { session: () => SessionSummary }) {
  const session = props.session;
  const selected = () => selectedSessionId() === session().id;
  return (
    <View
      onPress={() => void selectSession(session().id)}
      class="cursor-pointer rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-sidebar-accent/70 active:bg-sidebar-accent"
      classList={{
        "border-sidebar-border bg-sidebar-accent": selected(),
      }}
    >
      <View class="flex-row items-center gap-2">
        <View
          class="size-1.5 rounded-full"
          classList={{
            "bg-up": session().status === "completed" || session().status === "idle",
            "bg-warn": session().status === "running" || session().status === "awaiting_approval",
            "bg-destructive": session().status === "failed",
            "bg-muted-foreground":
              session().status === "cancelled" || session().status === "interrupted",
          }}
        />
        <Text class="min-w-0 flex-1 text-sm font-medium text-sidebar-foreground" style={{ numberOfLines: 1 }}>
          {session().title}
        </Text>
        <Text class="text-[11px] text-muted-foreground">{timeAgo(session().updatedAt)}</Text>
      </View>
      <View class="mt-1 flex-row items-center justify-between gap-2 pl-3.5">
        <Text class="text-[11px] text-muted-foreground" style={{ numberOfLines: 1 }}>
          {session().model ?? "default model"}
        </Text>
        <Text class="text-[11px] text-muted-foreground">{statusLabel(session().status)}</Text>
      </View>
    </View>
  );
}

function Sidebar() {
  return (
    <View class="w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <View class="flex-row items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <Logo />
        <View class="min-w-0 flex-1">
          <Text class="text-[15px] font-semibold text-sidebar-foreground">Forge NSH</Text>
          <Text class="mt-0.5 text-xs text-muted-foreground">LAN agent workbench</Text>
        </View>
      </View>
      <View class="border-b border-sidebar-border px-4 py-3">
        <Text class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</Text>
        <View class="mt-2 flex-row items-center gap-2 rounded-lg border border-sidebar-border bg-background/50 px-2.5 py-2">
          <View class="size-1.5 rounded-full bg-primary" />
          <Text class="min-w-0 flex-1 text-xs text-sidebar-foreground" style={{ numberOfLines: 1 }}>
            {workspace() ? baseName(workspace()) : "Connecting"}
          </Text>
        </View>
      </View>
      <View class="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Text class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</Text>
        <Text class="text-[11px] text-muted-foreground">{sessions().length}</Text>
      </View>
      <List
        each={sessions()}
        keyExtractor={(session) => session.id}
        estimatedItemSize={64}
        class="min-h-0 flex-1 px-2 pb-2"
        contentClass="gap-1"
        empty={
          <View class="items-center px-4 py-10">
            <Text class="text-sm font-medium text-sidebar-foreground">No sessions yet</Text>
            <Text class="mt-1 text-center text-xs leading-5 text-muted-foreground">
              Start a conversation with the button below.
            </Text>
          </View>
        }
      >
        {(session) => <SessionRow session={session} />}
      </List>
      <NewSessionButton />
    </View>
  );
}

function EmptyState() {
  const examples = [
    "Inspect this workspace and summarize its architecture",
    "Find the main entry points and explain how to run the project",
    "Propose a small first improvement and implement it carefully",
  ];
  return (
    <View class="flex-1 items-center justify-center px-8 py-16">
      <Logo size={64} />
      <Text class="mt-6 text-center text-3xl font-semibold tracking-tight text-foreground">
        What should Forge work on?
      </Text>
      <Text class="mt-3 max-w-[560px] text-center text-sm leading-6 text-muted-foreground">
        Ask about the codebase, request a focused change, or start with one of these prompts.
      </Text>
      <View class="mt-8 gap-2 self-stretch">
        <Each of={examples}>
          {(example) => (
            <View
              onPress={() => draft.set(example())}
              class="cursor-pointer rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/40 active:bg-accent/60"
            >
              <Text class="text-sm text-secondary-foreground">{example()}</Text>
            </View>
          )}
        </Each>
      </View>
    </View>
  );
}

function messageMarkdown(message: CoreMessage): string {
  if (typeof message.content === "string" && message.content.trim()) return message.content;
  const calls = message.tool_calls ?? [];
  if (calls.length > 0) {
    return `_Calling ${calls.map((call) => `\`${call.function?.name ?? "tool"}\``).join(", ")}_`;
  }
  return "";
}

function toolSummary(message: CoreMessage): string {
  const text = message.content ?? "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 360) return compact || "Tool finished.";
  return `${compact.slice(0, 360)}…`;
}

function MessageRow(props: { message: () => CoreMessage }) {
  const message = props.message;
  const isUser = () => message().role === "user";
  const isTool = () => message().role === "tool";
  return (
    <View class="flex-row gap-3">
      <View
        class="mt-0.5 size-8 shrink-0 items-center justify-center rounded-full border"
        classList={{
          "border-primary/40 bg-primary/20": isUser(),
          "border-border bg-muted": !isUser(),
        }}
      >
        <Text class="text-xs font-semibold text-foreground">{isUser() ? "You" : isTool() ? "T" : "F"}</Text>
      </View>
      <View class="min-w-0 flex-1">
        <View class="mb-1.5 flex-row items-baseline gap-2">
          <Text class="text-[13px] font-semibold text-foreground">
            {isUser() ? "You" : isTool() ? "Tool" : "Forge"}
          </Text>
          <If when={isTool()}>
            <Text class="text-[11px] uppercase tracking-wider text-muted-foreground">result</Text>
          </If>
        </View>
        <If
          when={isTool()}
          else={
            <TextView
              markdown={messageMarkdown(message())}
              selectable={true}
              classes={markdownClasses}
              class="min-w-0"
            />
          }
        >
          <View class="rounded-xl border border-border bg-muted/45 px-3 py-2">
            <Text class="font-mono text-xs leading-5 text-muted-foreground">{toolSummary(message())}</Text>
          </View>
        </If>
      </View>
    </View>
  );
}

function ActivityRow(props: { activity: () => Activity }) {
  const activity = props.activity;
  return (
    <View class="flex-row items-center gap-2 rounded-lg border border-border bg-card/70 px-2.5 py-2">
      <View
        class="size-1.5 rounded-full"
        classList={{
          "bg-warn animate-pulse": activity().state === "running",
          "bg-up": activity().state === "done",
          "bg-destructive": activity().state === "error",
        }}
      />
      <Text class="font-mono text-xs text-foreground">{activity().label}</Text>
      <Text class="min-w-0 flex-1 text-xs text-muted-foreground" style={{ numberOfLines: 1 }}>
        {activity().detail}
      </Text>
    </View>
  );
}

function StreamingRow() {
  return (
    <View class="flex-row gap-3">
      <View class="mt-0.5 size-8 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/15">
        <View class="size-2 animate-pulse rounded-full bg-primary" />
      </View>
      <View class="min-w-0 flex-1">
        <Text class="mb-1.5 text-[13px] font-semibold text-foreground">Forge</Text>
        <TextView
          markdown={liveText() || "_Thinking…_"}
          options={{ streaming: true }}
          selectable={true}
          classes={markdownClasses}
          streamingCaret={<View class="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary" />}
        />
        <If when={liveReasoning() !== ""}>
          <View class="mt-2 rounded-xl border border-border bg-muted/35 px-3 py-2">
            <Text class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reasoning</Text>
            <Text class="mt-1 text-xs leading-5 text-muted-foreground" style={{ numberOfLines: 4 }}>
              {liveReasoning()}
            </Text>
          </View>
        </If>
      </View>
    </View>
  );
}

function Transcript() {
  const empty = () => transcriptMessages().length === 0 && liveText() === "" && !runActive();
  return (
    <Scroll class="min-h-0 flex-1 bg-background" contentClass="mx-auto w-full max-w-[840px] gap-7 px-6 py-8">
      <If when={empty()}>
        <EmptyState />
      </If>
      <Each of={transcriptMessages()} key="index">
        {(message) => <MessageRow message={message} />}
      </Each>
      <If when={liveText() !== "" || liveReasoning() !== "" || runActive()}>
        <StreamingRow />
      </If>
      <If when={activities().length > 0}>
        <View class="gap-2 border-t border-border/70 pt-4">
          <Text class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tool activity</Text>
          <Each of={activities()} key="index">
            {(activity) => <ActivityRow activity={activity} />}
          </Each>
        </View>
      </If>
    </Scroll>
  );
}

function ApprovalCard(props: { approval: () => ApprovalRequest }) {
  const approval = props.approval;
  return (
    <View class="mb-3 rounded-2xl border border-warn/35 bg-warn/10 p-3">
      <View class="flex-row items-center gap-2">
        <View class="size-2 rounded-full bg-warn" />
        <Text class="flex-1 text-sm font-semibold text-foreground">Approval required: {approval().toolName}</Text>
      </View>
      <Text class="mt-2 text-xs leading-5 text-secondary-foreground">{approval().description}</Text>
      <If when={(approval().command ?? []).length > 0}>
        <View class="mt-2 rounded-lg bg-background/70 px-2.5 py-2">
          <Text class="font-mono text-[11px] text-muted-foreground" style={{ numberOfLines: 3 }}>
            {(approval().command ?? []).join(" ")}
          </Text>
        </View>
      </If>
      <View class="mt-3 flex-row justify-end gap-2">
        <Button
          onPress={() => void answerApproval(approval(), false)}
          class="rounded-lg border border-border px-3 py-1.5 hover:bg-muted active:bg-muted/80"
        >
          <Text class="text-xs font-medium text-foreground">Reject</Text>
        </Button>
        <Button
          onPress={() => void answerApproval(approval(), true)}
          class="rounded-lg bg-up px-3 py-1.5 active:opacity-85"
        >
          <Text class="text-xs font-semibold text-[#062017]">Approve</Text>
        </Button>
      </View>
    </View>
  );
}

function Composer() {
  const canSend = () => connection() === "online" && !sending() && draft().trim() !== "";
  return (
    <View class="border-t border-border bg-background px-5 py-4">
      <View class="mx-auto w-full max-w-[840px]">
        <Each of={pendingApprovals()} key={(approval) => approval.id}>
          {(approval) => <ApprovalCard approval={approval} />}
        </Each>
        <If when={lastError() !== ""}>
          <View class="mb-3 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2">
            <Text class="text-xs leading-5 text-[#fecaca]">{lastError()}</Text>
          </View>
        </If>
        <View class="rounded-2xl border border-input bg-card shadow-2xl shadow-black/25 focus-within:border-primary/70">
          <Input
            multiline={true}
            value={draft()}
            onChange={(event) => draft.set(event.value)}
            onSubmit={() => void sendPrompt()}
            submitBehavior="submit"
            placeholder="Message Forge…  (Enter sends, Shift+Enter adds a line)"
            class="max-h-40 min-h-[58px] bg-transparent px-4 py-3 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground"
          />
          <View class="flex-row items-center gap-2 border-t border-border/70 px-3 py-2">
            <View class="rounded-md bg-muted px-2 py-1">
              <Text class="max-w-[260px] text-[11px] text-muted-foreground" style={{ numberOfLines: 1 }}>
                {modelText()}
              </Text>
            </View>
            <Text class="min-w-0 flex-1 text-[11px] text-muted-foreground" style={{ numberOfLines: 1 }}>
              {workspace() ? shortPath(workspace()) : "waiting for workspace"}
            </Text>
            <If when={runActive()}>
              <Button
                onPress={() => void cancelRun()}
                class="rounded-lg border border-border px-3 py-1.5 hover:bg-muted active:bg-muted/80"
              >
                <Text class="text-xs font-medium text-foreground">Stop</Text>
              </Button>
            </If>
            <Button
              onPress={() => void sendPrompt()}
              disabled={!canSend()}
              busy={sending()}
              class="rounded-lg bg-primary px-3.5 py-1.5 transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
            >
              <Text class="text-xs font-semibold text-primary-foreground">{sending() ? "Sending" : "Send"}</Text>
            </Button>
          </View>
        </View>
        <Text class="mt-2 text-center text-[11px] text-muted-foreground">
          Trusted LAN service. Tool rendering is intentionally simplified in this initial NSH build.
        </Text>
      </View>
    </View>
  );
}

function DetailRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <View class="flex-row items-start gap-3 py-2">
      <Text class="w-[86px] shrink-0 text-xs text-muted-foreground">{props.label}</Text>
      <Text
        class="min-w-0 flex-1 text-xs leading-5 text-secondary-foreground"
        classList={{ "font-mono": props.mono === true }}
        style={{ numberOfLines: 3 }}
      >
        {props.value}
      </Text>
    </View>
  );
}

function InspectorSection(props: { title: string; children?: any }) {
  return (
    <View class="border-b border-border px-4 py-4">
      <Text class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}

function Inspector() {
  const connectionText = () =>
    connection() === "online"
      ? eventSocketState() === "open"
        ? "Connected"
        : "Connecting events"
      : connection() === "connecting"
        ? "Connecting"
        : "Offline";
  return (
    <View class="w-[300px] shrink-0 flex-col border-l border-border bg-[#0c0e12]">
      <View class="flex-row items-center justify-between border-b border-border px-4 py-4">
        <Text class="text-sm font-semibold text-foreground">Inspector</Text>
        <View class="rounded-full border border-border bg-muted px-2 py-0.5">
          <Text class="text-[10px] uppercase tracking-wider text-muted-foreground">live</Text>
        </View>
      </View>
      <Scroll class="min-h-0 flex-1">
        <InspectorSection title="Connection">
          <View class="flex-row items-center gap-2 py-1.5">
            <StatusDot tone={connection() === "online" ? "up" : connection() === "connecting" ? "warn" : "down"} />
            <Text class="text-sm font-medium text-foreground">{connectionText()}</Text>
          </View>
          <DetailRow label="Socket" value={eventSocketState()} mono={true} />
          <DetailRow label="Cursor" value={String(eventCursor())} mono={true} />
          <DetailRow label="Client" value={clientId() ? `${clientId().slice(0, 8)}…` : "not assigned"} mono={true} />
        </InspectorSection>
        <InspectorSection title="Workspace">
          <DetailRow label="Path" value={workspace() || "connecting"} mono={true} />
          <DetailRow label="Name" value={workspace() ? baseName(workspace()) : "—"} />
        </InspectorSection>
        <InspectorSection title="Model">
          <DetailRow label="Selected" value={modelText()} mono={true} />
          <DetailRow label="Provider" value={providerConfigured() ? "configured" : "not configured"} />
        </InspectorSection>
        <InspectorSection title="Run">
          <View class="flex-row items-center gap-2 py-1.5">
            <StatusDot tone={runActive() ? "warn" : "up"} />
            <Text class="text-sm font-medium text-foreground">
              {activeRun()?.status ? statusLabel(activeRun()?.status) : statusLabel(currentSession()?.status)}
            </Text>
          </View>
          <DetailRow label="Run id" value={activeRun()?.runId ?? activeRunId() ?? "none"} mono={true} />
          <DetailRow label="Approvals" value={String(pendingApprovals().length)} />
          <DetailRow label="Messages" value={String(transcriptMessages().length)} />
        </InspectorSection>
        <View class="px-4 py-4">
          <Text class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Text>
          <Text class="mt-2 text-xs leading-5 text-muted-foreground">
            This proof of concept uses Forge Core directly: sessions, event cursors, run control and approvals are real.
            Rich tool diffs, settings editing, attachments and workspace switching are not implemented yet.
          </Text>
        </View>
      </Scroll>
    </View>
  );
}

function ChatHeader() {
  return (
    <View class="h-14 shrink-0 flex-row items-center justify-between border-b border-border bg-background px-5">
      <View class="min-w-0 flex-1 flex-row items-center gap-3">
        <Text class="min-w-0 text-[15px] font-semibold text-foreground" style={{ numberOfLines: 1 }}>
          {titleText()}
        </Text>
        <View class="rounded-full border border-border bg-muted px-2 py-0.5">
          <Text class="text-[10px] uppercase tracking-wider text-muted-foreground">
            {statusLabel(activeRun()?.status ?? currentSession()?.status)}
          </Text>
        </View>
      </View>
      <View class="flex-row items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5">
        <StatusDot tone={connection() === "online" ? "up" : connection() === "connecting" ? "warn" : "down"} />
        <Text class="text-xs text-secondary-foreground">
          {connection() === "online" ? "Core connected" : connection() === "connecting" ? "Connecting" : "Reconnecting"}
        </Text>
      </View>
    </View>
  );
}

function App() {
  effect(() => {
    const timer = setTimeout(() => void connectOnce(), 0);
    cleanup(() => {
      clearTimeout(timer);
      shutdown();
    });
  });

  return (
    <View class="flex-1 flex-row overflow-hidden bg-background">
      <Sidebar />
      <View class="min-w-0 flex-1 flex-col bg-background">
        <ChatHeader />
        <Transcript />
        <Composer />
      </View>
      <Inspector />
    </View>
  );
}

mount(App);
