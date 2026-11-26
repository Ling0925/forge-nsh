import type { TextStyle, ViewStyle } from "nsh";

export const colors = {
  canvas: "#090b10",
  sidebar: "#0c0f16",
  panel: "#10131b",
  panelRaised: "#151923",
  panelSoft: "#121620",
  border: "#242a37",
  borderSoft: "#1c222e",
  text: "#f4f6fb",
  textMuted: "#9aa3b2",
  textDim: "#697283",
  accent: "#7c5cff",
  accentBright: "#9d8cff",
  accentSoft: "#241d4d",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  userBubble: "#1d2432",
  code: "#0a0d13",
};

export const textStyles = {
  eyebrow: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  small: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  dim: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "650",
    lineHeight: 23,
  },
} satisfies Record<string, TextStyle>;

export const panelStyle: ViewStyle = {
  backgroundColor: colors.panel,
  borderColor: colors.borderSoft,
  borderWidth: 1,
  borderRadius: 14,
};

export const buttonBase: ViewStyle = {
  borderRadius: 9,
  paddingHorizontal: 12,
  paddingVertical: 8,
  alignItems: "center",
  justifyContent: "center",
};

export const markdownClasses = {
  root: "gap-3 text-[14px] leading-6 text-zinc-200",
  paragraph: "text-zinc-200",
  heading: "text-zinc-50",
  code: "rounded bg-[#1b2130] px-1 py-0.5 text-[12px] text-violet-200",
  codeBlock: "rounded-xl border border-[#252c3c] bg-[#080a0f]",
  codeBlockCode: "text-[12px] leading-5 text-zinc-200",
  blockquote: "border-l-2 border-violet-500 pl-3 text-zinc-300",
  listMarker: "text-violet-300",
  link: "text-violet-300 underline",
  table: "border-[#252c3c]",
};
