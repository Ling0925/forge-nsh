import { split, Text, View } from "nsh";
import { motionClasses } from "../theme";

export type BadgeTone = "neutral" | "primary" | "danger";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  class?: string;
}

const surfaceToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-soft",
  primary: "bg-primary-soft",
  danger: "bg-danger-soft",
};

const textToneClasses: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  danger: "text-danger-foreground",
};

const dotToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  danger: "bg-danger",
};

/** Rectangular 8px-radius status tag; color is always paired with text. */
export function Badge(props: BadgeProps) {
  const [own] = split(props, ["label", "tone", "dot", "class"]);
  const tone = () => own.tone ?? "neutral";
  return (
    <View class={`w-fit flex-row items-center gap-2 rounded-(--radius) px-2 py-1 ${motionClasses.color} ${surfaceToneClasses[tone()]} ${own.class ?? ""}`}>
      {own.dot ? <View class={`size-2 rounded-full ${dotToneClasses[tone()]}`} /> : null}
      <Text class={`text-[14px] font-medium leading-5 ${textToneClasses[tone()]}`}>{own.label}</Text>
    </View>
  );
}
