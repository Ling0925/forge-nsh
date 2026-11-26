import { split, Text } from "nsh";
import type { JSX } from "nsh";
import { Button as BaseButton, type ButtonProps } from "nsh/base";
import { focusRingClass, motionClasses } from "../theme";
import { Icon, type IconName, type IconTone } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "nav";
export type ButtonSize = "sm" | "md" | "icon";

export interface UiButtonProps extends ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  icon?: IconName;
  children?: JSX.Element;
}

const baseClass = `group flex-row items-center justify-center gap-2 rounded-(--radius) font-medium ${motionClasses.color} ${focusRingClass} disabled:text-control-disabled-foreground`;

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground enabled:hover:bg-primary-hover enabled:active:bg-primary-active disabled:bg-control-disabled",
  secondary: "bg-secondary text-secondary-foreground enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed disabled:bg-control-disabled",
  outline: "border border-border bg-transparent text-foreground enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed disabled:border-border-subtle disabled:bg-transparent",
  ghost: "bg-transparent text-muted-foreground enabled:hover:bg-surface-hover enabled:hover:text-foreground enabled:active:bg-surface-pressed",
  danger: "border border-danger-border bg-danger-soft text-danger-foreground enabled:hover:bg-danger-hover disabled:border-border-subtle disabled:bg-control-disabled",
  nav: "w-full items-stretch justify-start bg-transparent px-3 py-3 text-left enabled:hover:bg-surface-hover enabled:active:bg-surface-pressed selected:bg-surface-hover selected:hover:bg-surface-hover",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-2",
  md: "min-h-9 px-4 py-2",
  icon: "size-9 min-h-9 p-0",
};

const labelSizeClasses: Record<ButtonSize, string> = {
  sm: "text-[14px] leading-5",
  md: "text-[14px] leading-5",
  icon: "text-[14px] leading-5",
};

const labelVariantClasses: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground group-disabled:text-control-disabled-foreground",
  secondary: "text-secondary-foreground group-disabled:text-control-disabled-foreground",
  outline: "text-foreground group-disabled:text-control-disabled-foreground",
  ghost: "text-muted-foreground group-hover:text-foreground group-disabled:text-control-disabled-foreground",
  danger: "text-danger-foreground group-disabled:text-control-disabled-foreground",
  nav: "text-foreground group-disabled:text-control-disabled-foreground",
};

function iconToneFor(variant: ButtonVariant, disabled: boolean | undefined): IconTone {
  if (disabled) return "disabled";
  if (variant === "primary") return "inverse";
  if (variant === "danger") return "danger";
  if (variant === "ghost") return "muted";
  return "default";
}

function sizeClass(size: ButtonSize | undefined): string {
  return sizeClasses[size ?? "md"];
}

function textClass(variant: ButtonVariant | undefined, size: ButtonSize | undefined): string {
  return `font-medium ${labelSizeClasses[size ?? "md"]} ${labelVariantClasses[variant ?? "primary"]}`;
}

/** Styled button over `nsh/base`'s Button on a strict 4px grid with Reicon support. */
export function Button(props: UiButtonProps) {
  const [own, rest] = split(props, ["variant", "size", "label", "icon", "class", "children"]);
  const variant = () => own.variant ?? "primary";
  const size = () => own.size ?? "md";
  return (
    <BaseButton
      {...rest}
      class={`${baseClass} ${sizeClass(size())} ${variantClasses[variant()]} ${own.class ?? ""}`}
    >
      <If when={own.icon !== undefined}>
        <Icon name={own.icon!} tone={iconToneFor(variant(), rest.disabled)} />
      </If>
      {own.label !== undefined
        ? <Text class={textClass(variant(), size())}>{own.label}</Text>
        : own.children}
    </BaseButton>
  );
}
