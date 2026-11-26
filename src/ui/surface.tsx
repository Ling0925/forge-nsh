import { split, View } from "nsh";
import type { ViewProps } from "nsh";
import { surfaceClasses } from "../theme";

export type SurfaceVariant = keyof typeof surfaceClasses;

export interface SurfaceProps extends ViewProps {
  variant?: SurfaceVariant;
}

/** A semantic bordered surface; callers add layout, spacing and content. */
export function Surface(props: SurfaceProps) {
  const [own, rest] = split(props, ["variant", "class", "children"]);
  return (
    <View
      {...rest}
      class={`${surfaceClasses[own.variant ?? "panel"]} ${own.class ?? ""}`}
    >
      {own.children}
    </View>
  );
}
