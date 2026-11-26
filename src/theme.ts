import { colorScheme, token } from "nsh";
import type { TextViewClasses } from "nsh/base";

/**
 * Shared presentation tokens aligned with docs/DESIGN.md:
 * 90% neutral monochrome surfaces, single accent <=10%, Geist typography,
 * 4px spacing grid, 8-40px radii, and single-layer containers.
 */
export const textClasses = {
  title: "text-[18px] font-semibold leading-7 tracking-tight text-foreground",
  heading: "text-[18px] font-bold leading-7 tracking-tight text-foreground",
  body: "text-[16px] font-normal leading-6 text-foreground",
  bodySm: "text-[14px] font-normal leading-5 text-foreground",
  secondary: "text-[14px] font-normal leading-5 text-muted-foreground",
  mono: "font-mono text-[14px] font-normal leading-5 text-secondary-foreground",
} as const;

export const motionClasses = {
  color: "transition-colors duration-150 motion-reduce:transition-none",
  opacity: "transition-opacity duration-150 motion-reduce:transition-none",
  all: "transition-all duration-150 motion-reduce:transition-none",
} as const;

export const focusRingClass = "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/** Desktop secondary-control visibility: hidden at rest, revealed on hover/focus without layout shift. */
export const intentRevealClass =
  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 motion-reduce:transition-none";

export const surfaceClasses = {
  panel: "rounded-(--radius-lg) bg-card",
  soft: "rounded-(--radius-lg) bg-surface-soft",
  bordered: "rounded-(--radius-lg) border border-border bg-background",
  overlay: "rounded-(--radius-xl) border border-border bg-surface-overlay",
  code: "rounded-(--radius-lg) bg-code",
  danger: "rounded-(--radius-lg) border border-danger-border bg-danger-soft",
} as const;

/** Minimal neutral elevation reserved for floating input/menu/overlay surfaces. */
export function elevatedShadow(): string {
  colorScheme();
  return `0 8px 24px ${token("shadow-color")}`;
}

export const markdownClasses: TextViewClasses = {
  root: "gap-4 text-[16px] leading-6 text-foreground",
  paragraph: "leading-6 text-foreground",
  heading: "font-semibold tracking-tight text-foreground",
  heading1: "pt-2 text-[18px] font-bold leading-7 text-foreground",
  heading2: "pt-1 text-[18px] font-semibold leading-7 text-foreground",
  heading3: "text-[16px] font-semibold leading-6 text-foreground",
  strong: "font-semibold text-foreground",
  emphasis: "italic text-foreground",
  code: "rounded-(--radius) bg-code px-2 py-1 font-mono text-[14px] text-foreground",
  keyboard: "rounded-(--radius) border border-border bg-surface-soft px-2 py-1 font-mono text-[14px] text-foreground",
  codeBlock: "overflow-hidden rounded-(--radius-lg) bg-code",
  codeBlockHeader: "bg-surface-soft",
  codeBlockCode: "font-mono text-[14px] leading-6 text-code-foreground",
  blockquote: "border-l-2 border-border-strong py-1 pl-4 text-muted-foreground",
  alert: "gap-2 rounded-(--radius-lg) bg-surface-soft px-4 py-3 text-foreground",
  alertNote: "text-foreground",
  alertTip: "text-foreground",
  alertImportant: "text-foreground",
  alertWarning: "text-foreground",
  alertCaution: "border border-danger-border bg-danger-soft text-danger-foreground",
  list: "gap-2",
  listItem: "gap-3",
  listMarker: "font-medium text-muted-foreground",
  link: "text-primary underline",
  table: "overflow-hidden rounded-(--radius-lg) border border-border",
  tableHead: "bg-surface-soft",
  tableRow: "border-border",
  tableCell: "px-3 py-2 text-[14px] leading-5 text-foreground",
  tableHeaderCell: "px-3 py-2 text-[14px] font-semibold leading-5 text-foreground",
  rule: "my-2 border-t border-border-subtle",
};
