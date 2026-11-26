import { split, Text, View } from "nsh";
import type { JSX } from "nsh";
import { Checkbox as BaseCheckbox, type CheckboxProps } from "nsh/base";
import { focusRingClass, motionClasses } from "../theme";

export interface UiCheckboxProps extends CheckboxProps {
  label?: string;
  description?: string;
  children?: JSX.Element;
}

/** Styled checkbox with an accessible text label. */
export function Checkbox(props: UiCheckboxProps) {
  const [own, rest] = split(props, ["label", "description", "class", "children"]);
  return (
    <BaseCheckbox
      {...rest}
      class={`flex-row items-start gap-2.5 rounded-(--radius) ${motionClasses.color} ${focusRingClass} ${own.class ?? ""}`}
      indicatorClass="mt-0.5 size-4 items-center justify-center rounded-(--radius-sm) border border-input bg-surface-inset checked:border-primary checked:bg-primary disabled:border-border-subtle disabled:bg-control-disabled"
      indicator={(
        <If when={props.checked === true}>
          <Text class="text-xs font-black leading-3 text-primary-foreground">✓</Text>
        </If>
      )}
    >
      {own.children ?? (
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="text-sm font-medium leading-5 text-foreground">{own.label}</Text>
          <If when={own.description !== undefined}>
            <Text class="text-xs leading-4 text-dim-foreground">{own.description}</Text>
          </If>
        </View>
      )}
    </BaseCheckbox>
  );
}
