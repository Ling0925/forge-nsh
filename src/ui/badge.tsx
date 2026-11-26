import { split, Text, View } from "nsh";
import { motionClasses } from "../theme";

export type BadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  class?: string;
}

const surfaceToneClasses: Record<BadgeTone, string> = {
  neutral: "border-border bg-secondary",
  primary: "border-primary-border bg-primary-soft",
  info: "border-info-border bg-info-soft",
  success: "border-success-border bg-success-soft",
  warning: "border-warning-border bg-warning-soft",
  danger: "border-danger-border bg-danger-soft",
};

const textToneClasses: Record<BadgeTone, string> = {
  neutral: "text-secondary-foreground",
  primary: "text-accent-foreground",
  info: "text-info-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

const dotToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-dim-foreground",
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Compact state/classification badge; color is always paired with text. */
export function Badge(props: BadgeProps) {
  const [own] = split(props, ["label", "tone", "dot", "class"]);
  const tone = () => own.tone ?? "neutral";
  return (
    <View class={`flex-row w-fit items-center gap-1.5 rounded-full border px-2 py-1 ${motionClasses.color} ${surfaceToneClasses[tone()]} ${own.class ?? ""}`}>
      {own.dot ? <View class={`size-1.5 rounded-full ${dotToneClasses[tone()]}`} /> : null}
      <Text class={`text-xs font-semibold leading-4 ${textToneClasses[tone()]}`}>{own.label}</Text>
    </View>
  );
}
