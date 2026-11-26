import { split, Text, View } from "nsh";
import type { JSX } from "nsh";
import { Checkbox as BaseCheckbox, type CheckboxProps } from "nsh/base";
import { focusRingClass, motionClasses } from "../theme";
import { Icon } from "./icon";

export interface UiCheckboxProps extends CheckboxProps {
  label?: string;
  children?: JSX.Element;
}

/** Styled checkbox using Reicon check glyph on a 4px grid. */
export function Checkbox(props: UiCheckboxProps) {
  const [own, rest] = split(props, ["label", "class", "children"]);
  return (
    <BaseCheckbox
      {...rest}
      class={`flex-row items-center gap-3 rounded-(--radius) ${motionClasses.color} ${focusRingClass} ${own.class ?? ""}`}
      indicatorClass="size-5 items-center justify-center rounded-(--radius) border border-input bg-surface-inset checked:border-primary checked:bg-primary disabled:border-border-subtle disabled:bg-control-disabled"
      indicator={(
        <If when={props.checked === true}>
          <Icon name="check" tone="inverse" />
        </If>
      )}
    >
      {own.children ?? (
        <View class="min-w-0 flex-1">
          <Text class="text-[14px] font-medium leading-5 text-foreground">{own.label}</Text>
        </View>
      )}
    </BaseCheckbox>
  );
}
