import { Text, View } from "nsh";
import { Select as BaseSelect } from "nsh/base";
import { elevatedShadow, focusRingClass, motionClasses } from "../theme";
import { Icon } from "./icon";

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

/** Single-select layer on a 4px grid with Reicon chevron. */
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
      offset={8}
      onChange={(event) => props.onChange(event.value)}
      popupClass="max-h-80 rounded-(--radius-xl) border border-border bg-popover p-2 text-popover-foreground"
      popupStyle={{ boxShadow: elevatedShadow() }}
      backdropClass="bg-black/25"
      popupStartingClass="opacity-0 -translate-y-1"
      popupEndingClass="opacity-0"
      listClass="gap-1"
      itemClass="rounded-(--radius) px-3 py-2 text-[14px] leading-5 text-popover-foreground focus:bg-surface-hover focus:text-foreground selected:bg-surface-hover selected:font-semibold selected:text-foreground disabled:text-control-disabled-foreground"
      groupClass="px-3 pb-1 pt-2 text-[14px] font-semibold leading-5 text-muted-foreground"
      searchClass="mx-1 mb-2 rounded-(--radius) border border-border bg-surface-inset px-3 py-2 text-[14px] text-foreground placeholder:text-dim-foreground"
      empty={(
        <View class="px-3 py-4">
          <Text class="text-[14px] leading-5 text-dim-foreground">No matching options</Text>
        </View>
      )}
      trigger={(
        <View
          class={`min-h-9 w-full flex-row items-center justify-between gap-3 rounded-(--radius) border border-input bg-surface-inset px-3 py-2 hover:bg-surface-hover disabled:bg-control-disabled ${motionClasses.color} ${focusRingClass}`}
        >
          <Text
            class={`text-[14px] leading-5 ${title() ? "text-foreground" : "text-dim-foreground"}`}
            style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
          >
            {title() ?? props.placeholder ?? "Select…"}
          </Text>
          <Icon name="chevron-down" tone="muted" />
        </View>
      )}
    />
  );
}
