import { clampText, compactPath, oneLine, shortId } from "./format";
import type { FileChangeSummary, MessageCitation, SessionSnapshot } from "./protocol";

export interface ToolChangeItem {
  path: string;
  kind: "created" | "modified" | "deleted";
  added?: number;
  removed?: number;
}

export interface ToolExecutionItem {
  id: string;
  name: string;
  summary: string;
  argumentsPretty?: string;
  output?: string;
  status: "done" | "error" | "pending";
  durationMs?: number;
  changes?: readonly ToolChangeItem[];
}

export interface UserTranscriptItem {
  id: string;
  kind: "user";
  text: string;
  attachments?: number;
}

export interface AssistantTranscriptItem {
  id: string;
  kind: "assistant";
  text: string;
  live?: boolean;
  model?: string;
  citations?: readonly MessageCitation[];
}

export interface ReasoningTranscriptItem {
  id: string;
  kind: "reasoning";
  text: string;
  charCount: number;
  live?: boolean;
}

export interface ToolGroupTranscriptItem {
  id: string;
  kind: "tool_group";
  calls: readonly ToolExecutionItem[];
}

export type TranscriptItem =
  | UserTranscriptItem
  | AssistantTranscriptItem
  | ReasoningTranscriptItem
  | ToolGroupTranscriptItem;

const PATH_KEYS = ["path", "file_path", "filePath", "target", "directory", "dir"] as const;
const COMMAND_KEYS = ["command", "cmd"] as const;
const TEXT_KEYS = ["query", "pattern", "regex", "url", "prompt", "name"] as const;

export function summarizeToolArguments(name: string, rawArgs: string): { summary: string; pretty?: string } {
  const trimmed = rawArgs.trim();
  if (!trimmed) return { summary: name };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      summary: oneLine(trimmed, 64),
      pretty: clampText(trimmed, 4000),
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const pretty = clampText(JSON.stringify(parsed, null, 2) ?? trimmed, 4000);
    return {
      summary: oneLine(typeof parsed === "string" ? parsed : trimmed, 64),
      pretty,
    };
  }

  const record = parsed as Record<string, unknown>;
  const pretty = clampText(JSON.stringify(record, null, 2), 4000);

  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { summary: compactPath(value.trim(), 56), pretty };
    }
  }
  for (const key of COMMAND_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { summary: oneLine(value.trim(), 72), pretty };
    }
    if (Array.isArray(value) && value.length > 0) {
      const joined = value.filter((item): item is string => typeof item === "string").join(" ");
      if (joined.trim()) return { summary: oneLine(joined.trim(), 72), pretty };
    }
  }
  for (const key of TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { summary: oneLine(value.trim(), 64), pretty };
    }
  }

  const firstKey = Object.keys(record)[0];
  if (!firstKey) return { summary: name };
  const firstValue = record[firstKey];
  const compactValue = typeof firstValue === "string"
    ? oneLine(firstValue, 48)
    : oneLine(JSON.stringify(firstValue) ?? "", 48);
  return {
    summary: compactValue ? `${firstKey}: ${compactValue}` : firstKey,
    pretty,
  };
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1).replace(/\.0$/, "")}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

export function formatCharCount(chars: number): string {
  if (chars >= 1000) return `${(chars / 1000).toFixed(1).replace(/\.0$/, "")}k chars`;
  return `${chars} chars`;
}

function mapChanges(changes: readonly FileChangeSummary[] | undefined): readonly ToolChangeItem[] | undefined {
  if (!changes?.length) return undefined;
  return changes.map((change) => ({
    path: change.path,
    kind: change.kind,
    ...(typeof change.patch?.added === "number" ? { added: change.patch.added } : {}),
    ...(typeof change.patch?.removed === "number" ? { removed: change.patch.removed } : {}),
  }));
}

interface ToolEventMeta {
  startedAt?: number;
  finishedAt?: number;
  isError?: boolean;
  changes?: readonly FileChangeSummary[];
}

export function buildTranscriptItems(snapshot: SessionSnapshot): readonly TranscriptItem[] {
  const toolMessages = new Map<string, { index: number; content: string }>();
  for (const [index, message] of snapshot.messages.entries()) {
    if (message.role === "tool") {
      toolMessages.set(message.tool_call_id, { index, content: message.content });
    }
  }

  const eventMeta = new Map<string, ToolEventMeta>();
  for (const event of snapshot.events) {
    if (event.type === "tool_started" && event.call?.id) {
      const ts = Date.parse(event.timestamp);
      const prev = eventMeta.get(event.call.id) ?? {};
      eventMeta.set(event.call.id, {
        ...prev,
        ...(Number.isFinite(ts) ? { startedAt: ts } : {}),
      });
    } else if (event.type === "tool_finished" && event.toolCallId) {
      const ts = Date.parse(event.timestamp);
      const prev = eventMeta.get(event.toolCallId) ?? {};
      eventMeta.set(event.toolCallId, {
        ...prev,
        ...(Number.isFinite(ts) ? { finishedAt: ts } : {}),
        isError: event.result?.isError === true,
        ...(event.result?.changes ? { changes: event.result.changes } : {}),
      });
    }
  }

  const pairedToolIndices = new Set<number>();
  const items: TranscriptItem[] = [];

  for (const [index, message] of snapshot.messages.entries()) {
    if (message.role === "system") continue;

    if (message.role === "user") {
      items.push({
        id: `${snapshot.id}:user-${index}`,
        kind: "user",
        text: message.content,
        ...(message.images?.length ? { attachments: message.images.length } : {}),
      });
      continue;
    }

    if (message.role === "assistant") {
      const reasoning = message.reasoning?.trim();
      if (reasoning) {
        items.push({
          id: `${snapshot.id}:reasoning-${index}`,
          kind: "reasoning",
          text: clampText(reasoning, 8000),
          charCount: reasoning.length,
        });
      }
      if (message.content?.trim()) {
        items.push({
          id: `${snapshot.id}:assistant-${index}`,
          kind: "assistant",
          text: message.content,
          model: snapshot.model,
          ...(message.citations?.length ? { citations: message.citations } : {}),
        });
      }
      if (message.tool_calls?.length) {
        const calls: ToolExecutionItem[] = message.tool_calls.map((call) => {
          const resultMessage = toolMessages.get(call.id);
          if (resultMessage) pairedToolIndices.add(resultMessage.index);
          const meta = eventMeta.get(call.id);
          const { summary, pretty } = summarizeToolArguments(call.function.name, call.function.arguments);
          const durationMs =
            meta?.startedAt !== undefined && meta?.finishedAt !== undefined && meta.finishedAt >= meta.startedAt
              ? meta.finishedAt - meta.startedAt
              : undefined;
          const status: ToolExecutionItem["status"] = meta?.isError
            ? "error"
            : resultMessage !== undefined || meta?.finishedAt !== undefined
              ? "done"
              : "pending";
          return {
            id: call.id,
            name: call.function.name,
            summary,
            ...(pretty ? { argumentsPretty: pretty } : {}),
            ...(resultMessage ? { output: clampText(resultMessage.content, 4000) } : {}),
            status,
            ...(durationMs !== undefined ? { durationMs } : {}),
            ...(meta?.changes ? { changes: mapChanges(meta.changes) } : {}),
          };
        });
        items.push({
          id: `${snapshot.id}:tools-${index}`,
          kind: "tool_group",
          calls,
        });
      }
      continue;
    }

    if (pairedToolIndices.has(index)) continue;
    items.push({
      id: `${snapshot.id}:tool-orphan-${index}`,
      kind: "tool_group",
      calls: [
        {
          id: message.tool_call_id,
          name: "tool",
          summary: shortId(message.tool_call_id),
          output: clampText(message.content, 4000),
          status: "done",
        },
      ],
    });
  }

  return items;
}
