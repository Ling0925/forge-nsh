import { split, Text } from "nsh";
import type { JSX } from "nsh";
import { Button as BaseButton, type ButtonProps } from "nsh/base";
import { focusRingClass, motionClasses } from "../theme";

export type ButtonVariant = "primary" | "soft" | "secondary" | "outline" | "ghost" | "danger" | "nav";
export type ButtonSize = "sm" | "md" | "icon";

export interface UiButtonProps extends ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Text for the common single-label button; custom content can still be children. */
  label?: string;
  children?: JSX.Element;
}

const baseClass = `group flex-row items-center justify-center gap-2 rounded-(--radius) border font-semibold ${motionClasses.color} ${focusRingClass} disabled:text-control-disabled-foreground`;

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-primary-foreground enabled:hover:bg-primary-hover enabled:active:bg-primary-active disabled:border-transparent disabled:bg-control-disabled",
  soft: "border-primary-border bg-primary-soft text-accent-foreground enabled:hover:bg-accent enabled:active:bg-surface-pressed disabled:border-border-subtle disabled:bg-control-disabled",
  secondary: "border-border bg-secondary text-secondary-foreground enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed disabled:border-border-subtle disabled:bg-control-disabled",
  outline: "border-border bg-transparent text-foreground enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed disabled:border-border-subtle disabled:bg-transparent",
  ghost: "border-transparent bg-transparent text-muted-foreground enabled:hover:bg-surface-hover enabled:hover:text-foreground enabled:active:bg-surface-pressed",
  danger: "border-danger-border bg-danger-soft text-danger-foreground enabled:hover:bg-danger-hover enabled:active:border-danger disabled:border-border-subtle disabled:bg-control-disabled",
  nav: "w-full items-stretch justify-start border-transparent bg-transparent px-2.5 py-2 text-left enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed selected:border-primary-border selected:bg-primary-soft selected:hover:bg-primary-soft selected:active:bg-primary-soft",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5",
  md: "min-h-9 px-3.5 py-2",
  icon: "size-9 min-h-9 p-0",
};

const labelSizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs leading-4",
  md: "text-sm leading-5",
  icon: "text-base leading-5",
};

const labelVariantClasses: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground group-disabled:text-control-disabled-foreground",
  soft: "text-accent-foreground group-disabled:text-control-disabled-foreground",
  secondary: "text-secondary-foreground group-disabled:text-control-disabled-foreground",
  outline: "text-foreground group-disabled:text-control-disabled-foreground",
  ghost: "text-muted-foreground group-hover:text-foreground group-disabled:text-control-disabled-foreground",
  danger: "text-danger-foreground group-disabled:text-control-disabled-foreground",
  nav: "text-foreground group-disabled:text-control-disabled-foreground",
};

function sizeClass(size: ButtonSize | undefined): string {
  return sizeClasses[size ?? "md"];
}

function textClass(variant: ButtonVariant | undefined, size: ButtonSize | undefined): string {
  return `font-semibold ${labelSizeClasses[size ?? "md"]} ${labelVariantClasses[variant ?? "primary"]}`;
}

/** The workbench's styled button layer over `nsh/base`'s behavioral Button. */
export function Button(props: UiButtonProps) {
  const [own, rest] = split(props, ["variant", "size", "label", "class", "children"]);
  const variant = () => own.variant ?? "primary";
  const size = () => own.size ?? "md";
  return (
    <BaseButton
      {...rest}
      class={`${baseClass} ${sizeClass(size())} ${variantClasses[variant()]} ${own.class ?? ""}`}
    >
      {own.label !== undefined
        ? <Text class={textClass(variant(), size())}>{own.label}</Text>
        : own.children}
    </BaseButton>
  );
}
