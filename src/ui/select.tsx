import { Text, View } from "nsh";
import { Select as BaseSelect } from "nsh/base";
import { focusRingClass, motionClasses } from "../theme";

export interface SelectOption {
  value: string;
  title: string;
  disabled?: boolean;
  group?: string;
}

export interface OptionSelectProps {
  items: readonly SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  accessibilityLabel: string;
  class?: string;
}

/** The workbench's styled single-select layer over `nsh/base`'s behavior primitive. */
export function OptionSelect(props: OptionSelectProps) {
  const title = () => props.items.find((item) => item.value === props.value)?.title;
  return (
    <BaseSelect
      class={props.class ?? "w-full"}
      items={[...props.items]}
      value={props.value}
      disabled={props.disabled}
      searchable={props.searchable}
      searchPlaceholder="Search…"
      searchAccessibilityLabel={`Search ${props.accessibilityLabel}`}
      accessibilityLabel={props.accessibilityLabel}
      offset={4}
      onChange={(event) => props.onChange(event.value)}
      popupClass="max-h-80 rounded-(--radius-lg) border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      backdropClass="bg-black/30"
      popupStartingClass="opacity-0 -translate-y-1"
      popupEndingClass="opacity-0"
      listClass="gap-0.5"
      itemClass="rounded-(--radius) px-2.5 py-2 text-sm leading-5 text-popover-foreground focus:bg-surface-hover focus:text-foreground selected:bg-primary-soft selected:text-accent-foreground disabled:text-control-disabled-foreground"
      groupClass="px-2.5 pb-1 pt-2 text-xs font-bold uppercase leading-4 tracking-wider text-dim-foreground"
      searchClass="mx-1 mb-1 rounded-(--radius) border border-border-subtle bg-surface-inset px-2.5 py-2 text-sm text-foreground placeholder:text-dim-foreground"
      empty={(
        <View class="px-3 py-4">
          <Text class="text-xs leading-4 text-dim-foreground">No matching options</Text>
        </View>
      )}
      trigger={(
        <View
          class={`min-h-9 w-full flex-row items-center justify-between gap-3 rounded-(--radius) border border-input bg-surface-inset px-3 py-2 hover:bg-surface-hover disabled:bg-control-disabled ${motionClasses.color} ${focusRingClass}`}
        >
          <Text
            class={`text-sm leading-5 ${title() ? "text-foreground" : "text-dim-foreground"}`}
            style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
          >
            {title() ?? props.placeholder ?? "Select…"}
          </Text>
          <Text class="text-xs leading-4 text-dim-foreground">▾</Text>
        </View>
      )}
    />
  );
}
