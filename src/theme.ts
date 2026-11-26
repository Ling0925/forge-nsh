import type { TextStyle, ViewStyle } from "nsh";
import type { SessionStatus } from "./protocol";

export const colors = {
  page: "#090a0f",
  sidebar: "#0c0d12",
  panel: "#101116",
  panelRaised: "#15161d",
  panelSoft: "#12131a",
  border: "#24262f",
  borderSoft: "#1b1d25",
  text: "#eceef4",
  textStrong: "#ffffff",
  muted: "#9aa0ae",
  faint: "#666c79",
  accent: "#8f86ff",
  accentStrong: "#aaa5ff",
  accentSoft: "#262449",
  accentBorder: "#48447e",
  success: "#66d9a3",
  successSoft: "#123329",
  warning: "#e7c36f",
  warningSoft: "#382f18",
  danger: "#ff7b8a",
  dangerSoft: "#3d1d25",
  info: "#7cc7ff",
  infoSoft: "#142b3a",
  userBubble: "#25213f",
  assistantBubble: "#14161d",
  toolBubble: "#101820",
  code: "#0b0d12",
  shadow: "#000000",
};

export const font = {
  sans: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, system-ui, sans-serif",
  mono: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace",
};

export function text(style?: TextStyle): TextStyle {
  return {
    color: colors.text,
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 18,
    ...style,
  };
}

export function panel(style?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.panel,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: 10,
    ...style,
  };
}

export function statusColor(status: SessionStatus | string | undefined): string {
  switch (status) {
    case "running":
      return colors.info;
    case "awaiting_approval":
      return colors.warning;
    case "completed":
      return colors.success;
    case "failed":
      return colors.danger;
    case "cancelled":
    case "interrupted":
      return colors.warning;
    case "idle":
      return colors.muted;
    default:
      return colors.faint;
  }
}

export function statusLabel(status: SessionStatus | string | undefined): string {
  switch (status) {
    case "running":
      return "运行中";
    case "awaiting_approval":
      return "等待审批";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "interrupted":
      return "已中断";
    case "idle":
      return "空闲";
    default:
      return status ?? "未知";
  }
}

export function connectionLabel(state: string): string {
  switch (state) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重连中";
    case "failed":
      return "连接失败";
    default:
      return state;
  }
}
