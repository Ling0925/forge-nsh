import { token } from "nsh";

/**
 * Shared presentation tokens for the Forge workbench.
 *
 * Colors, radii and fonts themselves live in nsh.json. Feature components use
 * these semantic class groups instead of inventing local visual values.
 */
export const textClasses = {
  eyebrow: "text-xs font-bold uppercase leading-4 tracking-wider text-dim-foreground",
  body: "text-sm leading-5 text-foreground",
  small: "text-xs leading-4 text-muted-foreground",
  dim: "text-xs leading-4 text-dim-foreground",
  title: "text-base font-semibold leading-6 text-foreground",
  heading: "text-xl font-bold leading-7 tracking-tight text-foreground",
  mono: "font-mono text-xs leading-4 text-secondary-foreground",
} as const;

export const motionClasses = {
  color: "transition-colors duration-150 motion-reduce:transition-none",
  all: "transition-all duration-150 motion-reduce:transition-none",
} as const;

export const focusRingClass = "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

export const surfaceClasses = {
  panel: "rounded-(--radius-lg) border border-border-subtle bg-card",
  soft: "rounded-(--radius-lg) border border-border-subtle bg-surface-soft",
  inset: "rounded-(--radius-lg) border border-border-subtle bg-surface-inset",
  overlay: "rounded-(--radius-xl) border border-border bg-surface-overlay",
  code: "rounded-(--radius) border border-code-border bg-code",
  warning: "rounded-(--radius-lg) border border-warning-border bg-warning-soft",
  danger: "rounded-(--radius-lg) border border-danger-border bg-danger-soft",
} as const;

/** A quiet elevation cue for the one floating input surface. */
export function elevatedShadow(): string {
  return `0 16px 38px ${token("shadow-color")}`;
}

export const markdownClasses = {
  root: "gap-3 text-sm leading-6 text-foreground",
  paragraph: "text-foreground",
  heading: "font-semibold text-foreground",
  code: "rounded-(--radius-sm) border border-code-border bg-code px-1 py-0.5 font-mono text-xs text-info-foreground",
  codeBlock: "overflow-hidden rounded-(--radius-lg) border border-code-border bg-code",
  codeBlockCode: "font-mono text-xs leading-5 text-code-foreground",
  blockquote: "border-l-2 border-primary-border pl-3 text-muted-foreground",
  listMarker: "text-primary",
  link: "text-info-foreground underline",
  table: "border-code-border",
};
