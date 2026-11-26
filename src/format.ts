export function shortId(id: string | undefined, length = 8): string {
  if (!id) return "—";
  return id.length <= length ? id : id.slice(0, length);
}

export function oneLine(text: string, max = 96): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  if (flattened.length <= max) return flattened;
  return `${flattened.slice(0, Math.max(0, max - 1))}…`;
}

export function clampText(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

export function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function compactPath(path: string, max = 42): string {
  if (path.length <= max) return path;
  const base = basename(path);
  const room = max - base.length - 5;
  if (room <= 4) return `…/${base}`;
  return `${path.slice(0, room)}…/${base}`;
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day} ${formatTime(iso)}`;
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function statusLabel(status: string | undefined): string {
  switch (status) {
    case "running": return "Running";
    case "awaiting_approval": return "Approval";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "failed": return "Failed";
    case "interrupted": return "Interrupted";
    case "idle": return "Idle";
    default: return "Idle";
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
