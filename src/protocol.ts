import { UrlScheme } from "nsh";

export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export interface ConnectResponse {
  workspace: string;
  restrictWorkspace: boolean;
  cursor: number;
  clientId: string;
  recovery?: unknown[];
}

export interface SessionSummary {
  version: 1;
  id: string;
  title: string;
  workspace: string;
  originWorkspace?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  providerSourceId?: string;
  parentSessionId?: string;
  agentProfileName?: string;
  archived?: boolean;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface FileChangeSummary {
  path: string;
  kind: "created" | "modified" | "deleted";
  patch?: {
    added?: number;
    removed?: number;
    status?: string;
  };
}

export interface MessageCitation {
  title?: string;
  url: string;
}

export type Message =
  | { role: "system"; content: string }
  | {
      role: "user";
      content: string;
      images?: unknown[];
      origin?: string;
    }
  | {
      role: "assistant";
      content: string | null;
      reasoning?: string;
      generationId?: string;
      citations?: readonly MessageCitation[];
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; content: string; tool_call_id: string };

export interface SessionSnapshot extends SessionSummary {
  messages: Message[];
  events: AgentEvent[];
  pendingTool?: ToolCall;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  childSessionId?: string;
  description: string;
  command?: readonly string[];
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
}

/**
 * The event union is large; the workbench consumes a deliberately small,
 * display-oriented subset and keeps the rest opaque.
 */
export interface AgentEvent {
  type: string;
  sessionId: string;
  timestamp: string;
  turn?: number;
  step?: number;
  generationId?: string;
  messageIndex?: number;
  text?: string;
  status?: SessionStatus | "superseded";
  model?: string;
  permission?: "readonly" | "workspace" | "unrestricted";
  title?: string;
  request?: ApprovalRequest;
  approvalId?: string;
  approved?: boolean;
  call?: ToolCall;
  toolCallId?: string;
  previewId?: string;
  name?: string;
  argumentsChars?: number;
  linesAdded?: number;
  linesRemoved?: number;
  attempt?: number;
  maxAttempts?: number;
  reason?: string;
  error?: { code?: string; message: string; retryable?: boolean };
  usage?: Usage | {
    windowTokens?: number | null;
    usedTokens?: number;
    estimated?: boolean;
  };
  result?: { content?: string; isError?: boolean; changes?: readonly FileChangeSummary[] };
  [key: string]: unknown;
}

export interface HostEvent {
  runId: string;
  event: AgentEvent;
}

export interface EventBatch {
  cursor: number;
  events: HostEvent[];
}

export interface RunHandle {
  runId: string;
  sessionId: string;
}

export type ProviderProtocol = "chat-completions" | "responses" | "anthropic" | "gemini";
export type ReasoningEffort = "default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ThemePreference = "system" | "light" | "dark";
export type PermissionPreference = "readonly" | "workspace" | "unrestricted";
export type ProviderEndpoints = Partial<Record<ProviderProtocol, string | undefined>>;

/** Public, normalized model metadata. Missing capabilities are unknown, never secrets. */
export interface ModelCatalogEntry {
  id: string;
  contextWindowTokens: number | null;
  displayName?: string;
  maxOutputTokens?: number | null;
  inputModalities?: readonly string[];
  outputModalities?: readonly string[];
  reasoningEffort?: ReasoningEffort;
  reasoningEfforts?: readonly string[];
  tools?: boolean;
  vision?: boolean;
  protocols?: readonly ProviderProtocol[];
  pricing?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    currency?: string;
    source?: string;
    updatedAt?: string;
  };
  provenance?: Readonly<Record<string, "upstream" | "reference" | "user">>;
}

export type ModelCatalog = readonly ModelCatalogEntry[];

export interface ModelSelection {
  mode: "all" | "selected" | "none";
  models?: readonly string[];
  manual?: ModelCatalog;
  overrides?: Readonly<Record<string, Partial<Omit<ModelCatalogEntry, "id">> & { apiMode?: ProviderProtocol }>>;
}

export interface PublicProviderPreset {
  id: string;
  name: string;
  kind: "vendor" | "relay" | "local" | "custom";
  endpoints: ProviderEndpoints;
  regionLabel?: string;
  regions?: readonly {
    id: string;
    name: string;
    endpoints: ProviderEndpoints;
    website?: string;
    keysUrl?: string;
  }[];
  website?: string;
  keysUrl?: string;
  noKey?: boolean;
}

export type ModelAccessResult =
  | { type: "presets"; presets: readonly PublicProviderPreset[] }
  | {
      type: "catalog";
      sourceId: string;
      models: ModelCatalog;
      stale?: boolean;
      fetchedAt?: string;
      error?: string;
    };

export interface PublicCredential {
  id: string;
  label: string;
  enabled: boolean;
  type: "api-key" | "account";
  status: "ready" | "disabled" | "expired" | "signed-out";
  platform?: string;
  expiresAt?: number;
  protocol?: ProviderProtocol;
}

/** Public projection of a Forge provider source: it never contains secrets. */
export interface PublicProviderSource {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiMode?: ProviderProtocol;
  revision: number;
  hasApiKey: boolean;
  preset?: string;
  endpoints?: ProviderEndpoints;
  activeCredentialId?: string;
  credentials?: readonly PublicCredential[];
  connection?: {
    headerNames?: readonly string[];
    hasExtraBody?: boolean;
    hasProxy?: boolean;
    hasVertex?: boolean;
    auth?: { type?: "auto" | "bearer" | "api-key" | "none" | "header"; header?: string };
  };
  credentialRouting?: "order" | "rotate" | "usage" | "smart" | "pace";
  sticky?: boolean;
  modelSelection?: ModelSelection;
  modelAliases?: Readonly<Record<string, string>>;
}

export interface PublicSettings {
  baseUrl: string;
  model: string;
  apiMode?: ProviderProtocol;
  theme: ThemePreference;
  defaultPermission: PermissionPreference;
  requestTimeoutMs: number;
  contextBudgetChars: number;
  contextBudgetTokens?: number | null;
  reasoningEffort?: ReasoningEffort;
  hasApiKey: boolean;
  isConfigured: boolean;
  providerSources?: readonly PublicProviderSource[];
  activeSourceId?: string;
  environmentOverride?: boolean;
}

export interface ProviderSourceSave {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiMode?: ProviderProtocol;
  preset?: string;
  endpoints?: ProviderEndpoints;
  modelSelection?: ModelSelection;
  modelAliases?: Readonly<Record<string, string>>;
  credentialRouting?: "order" | "rotate" | "usage" | "smart" | "pace";
  sticky?: boolean;
  activeCredentialId?: string;
}

export type ProviderSourceOperation =
  | {
      type: "save";
      source: ProviderSourceSave;
      apiKey?: string;
      expectedRevision?: number;
    }
  | { type: "activate"; id: string }
  | { type: "remove"; id: string; forgottenSessionIds?: readonly string[] };

export interface SettingsPatch {
  theme?: ThemePreference;
  defaultPermission?: PermissionPreference;
  reasoningEffort?: ReasoningEffort;
  requestTimeoutMs?: number;
  contextBudgetChars?: number;
  contextBudgetTokens?: number | null;
}

/** The subset of Forge Core's ConfigureInput written by this workbench. */
export interface ConfigureInput {
  apiKey?: string;
  source?: ProviderSourceOperation;
  settings?: SettingsPatch;
}

interface RpcSuccess<T> {
  id: string;
  ok: true;
  method: string;
  result: T;
}

interface RpcFailure {
  id: string;
  ok: false;
  method: string;
  error?: { code?: string; message?: string; retryable?: boolean };
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure;

/** RFC 4122 version 4, without depending on a secure-context randomUUID. */
export function requestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function pageOrigin(): string {
  try {
    const page = UrlScheme.url();
    if (page) return new URL(page).origin;
  } catch {
    // UrlScheme is optional on non-web hosts; import.meta.url is same-origin here.
  }
  return new URL(import.meta.url).origin;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") return body.error;
    if (
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) return body.error.message;
  } catch {
    // Use the status below.
  }
  return `HTTP ${response.status}`;
}

export interface EventStreamCallbacks {
  onOpen?: () => void;
  onEvents?: (events: HostEvent[], cursor: number) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: () => void;
}

/** Small protocol client for the trusted-LAN Forge Web host. */
export class ForgeApiClient {
  private clientId: string | undefined;
  private socket: WebSocket | undefined;

  get connectedClientId(): string | undefined {
    return this.clientId;
  }

  async connect(): Promise<ConnectResponse> {
    const response = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(await responseError(response));
    const value = await response.json() as ConnectResponse;
    if (!value.clientId || !Number.isSafeInteger(value.cursor)) {
      throw new Error("Forge Core returned an invalid connection response.");
    }
    this.clientId = value.clientId;
    return value;
  }

  async connectionResumable(cursor: number): Promise<boolean> {
    if (!this.clientId) return false;
    const response = await fetch("/api/connection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forge-Client": this.clientId,
      },
      body: JSON.stringify({ cursor }),
    });
    if (!response.ok) return false;
    const value = await response.json() as { resumable?: boolean };
    return value.resumable === true;
  }

  async rpc<T>(method: string, fields: Record<string, unknown> = {}): Promise<T> {
    if (!this.clientId) throw new Error("Forge Core is not connected.");
    const id = requestId();
    const response = await fetch("/api/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forge-Client": this.clientId,
      },
      body: JSON.stringify({ id, method, ...fields }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const envelope = await response.json() as RpcEnvelope<T>;
    if (envelope.id !== id || envelope.method !== method) {
      throw new Error("Forge Core returned a mismatched RPC response.");
    }
    if (!envelope.ok) {
      throw new Error(envelope.error?.message ?? `Forge RPC ${method} failed.`);
    }
    return envelope.result;
  }

  openEvents(cursor: number, callbacks: EventStreamCallbacks): void {
    if (!this.clientId) throw new Error("Forge Core is not connected.");
    this.closeEvents();
    const origin = pageOrigin();
    const socketOrigin = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const query = `clientId=${encodeURIComponent(this.clientId)}&cursor=${encodeURIComponent(String(cursor))}`;
    const socket = new WebSocket(`${socketOrigin}/api/events?${query}`);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      callbacks.onOpen?.();
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      callbacks.onError?.();
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      callbacks.onClose?.(event.code, event.reason);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data !== "string") return;
      let batch: EventBatch;
      try {
        batch = JSON.parse(event.data) as EventBatch;
      } catch {
        return;
      }
      if (!Number.isSafeInteger(batch.cursor) || !Array.isArray(batch.events)) return;
      try {
        callbacks.onEvents?.(batch.events, batch.cursor);
        // Core's lease and replay logic expect explicit cursor acknowledgements.
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ cursor: batch.cursor }));
        }
      } catch (error) {
        console.error("event handling failed", error);
      }
    };
  }

  closeEvents(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    socket.onopen = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.onmessage = null;
    if (socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  close(): void {
    this.closeEvents();
    this.clientId = undefined;
  }
}
