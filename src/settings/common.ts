export interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
}

export const idleStatus: SaveStatus = { state: "idle" };

/** Forge endpoints are complete HTTP(S) base URLs without credentials/query/fragment. */
export function endpointProblem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the provider base URL.";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Use a complete http(s) URL, for example https://api.example.com/v1.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only http and https URLs are supported.";
  }
  if (url.username || url.password) return "Do not put credentials in the URL.";
  if (url.search || url.hash) return "Remove query parameters and fragments from the URL.";
  return "";
}

export function parseIntegerOption(
  raw: string,
  label: string,
  min: number,
  max: number,
  allowBlank = false,
): { value?: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (allowBlank) return { value: null };
    return { error: `${label}: enter an integer.` };
  }
  if (!/^\d+$/.test(trimmed)) return { error: `${label}: enter a positive integer.` };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { error: `${label}: enter an integer from ${min.toLocaleString()} to ${max.toLocaleString()}.` };
  }
  return { value };
}

export function formatTokenShort(tokens: number): string {
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1000) {
    const value = tokens / 1000;
    return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(tokens);
}
