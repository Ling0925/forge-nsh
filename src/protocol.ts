export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export type Permission = "readonly" | "workspace" | "unrestricted";

export interface ErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  workspace: string;
  originWorkspace?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
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

export type Message =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: string;
      origin?: string;
    }
  | {
      role: "assistant";
      content: string | null;
      reasoning?: string;
      tool_calls?: readonly ToolCall[];
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  description: string;
  command?: readonly string[];
}

export interface AgentEvent {
  type: string;
  sessionId: string;
  timestamp: string;
  turn?: number;
  step?: number;
  generationId?: string;
  messageIndex?: number;
  text?: string;
  status?: string;
  model?: string;
  permission?: Permission;
  title?: string;
  call?: ToolCall;
  toolCallId?: string;
  result?: ToolResult;
  request?: ApprovalRequest;
  approvalId?: string;
  approved?: boolean;
  error?: ErrorInfo;
  summary?: string;
  name?: string;
  argumentsChars?: number;
  linesAdded?: number;
  linesRemoved?: number;
  reason?: string;
  attempt?: number;
  maxAttempts?: number;
  usage?: unknown;
}

export interface RunEvent {
  runId: string;
  event: AgentEvent;
}

export type HostEvent = RunEvent | Record<string, unknown>;

export interface SessionSnapshot extends SessionSummary {
  messages: readonly Message[];
  events: readonly AgentEvent[];
  pendingTool?: ToolCall;
  permissionCeiling?: Permission;
}

export interface RunState {
  runId: string;
  sessionId: string;
  status: SessionStatus;
  stopping: boolean;
  permission?: Permission;
  pendingApprovals: readonly ApprovalRequest[];
}

export interface HostState {
  hostId: string;
  protocolVersion: number;
  runs: readonly RunState[];
}

export interface PublicSettings {
  baseUrl: string;
  model: string;
  theme?: string;
  defaultPermission?: Permission;
  requestTimeoutMs?: number;
  hasApiKey: boolean;
  isConfigured: boolean;
  activeSourceId?: string;
}

export interface ConnectHandshake {
  workspace: string;
  restrictWorkspace: boolean;
  cursor: number;
  clientId: string;
  recovery: HostEvent[];
}

export interface RpcEnvelope {
  id: string;
  ok: boolean;
  method: string;
  result?: unknown;
  error?: ErrorInfo;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
  sizeBytes?: number;
  updatedAt?: string;
}

export interface WorkspaceListing {
  workspace: string;
  path: string;
  parentPath: string | null;
  entries: readonly WorkspaceEntry[];
  truncated: boolean;
}

export function isRunEvent(event: HostEvent): event is RunEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "runId" in event &&
    "event" in event
  );
}

export function shortId(value: string | undefined, length = 8): string {
  if (!value) return "—";
  return value.length <= length ? value : value.slice(0, length);
}

export function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
