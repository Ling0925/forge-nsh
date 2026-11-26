import { signal, Text, View } from "nsh";
import type { Bounds, JSX, Point, ViewRef } from "nsh";
import { Overlay } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { elevatedShadow, focusRingClass, motionClasses } from "../theme";
import { Icon, type IconName } from "./icon";

export const MENU_OPEN_DELAY_MS = 120;
export const MENU_CLOSE_DELAY_MS = 220;

export interface CascadeMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  children?: readonly CascadeMenuItem[];
}

function crossSign(p1: Point, p2: Point, p3: Point): number {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

/** Returns true when pointer `p` lies inside (or on the edge of) triangle (a, b, c). */
export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = crossSign(p, a, b);
  const d2 = crossSign(p, b, c);
  const d3 = crossSign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Builds the safe triangle between the pointer exit point and the submenu's near vertical edge. */
export function buildSafeTriangle(
  exitPoint: Point,
  bounds: Bounds,
  placement: "left" | "right",
): [Point, Point, Point] {
  const edgeX = placement === "left" ? bounds.origin.x + bounds.size.width : bounds.origin.x;
  const topEdge: Point = { x: edgeX, y: bounds.origin.y };
  const bottomEdge: Point = { x: edgeX, y: bounds.origin.y + bounds.size.height };
  return [exitPoint, topEdge, bottomEdge];
}

function MenuPanel(props: {
  items: readonly CascadeMenuItem[];
  accessibilityLabel: string;
  onCloseAll: () => void;
  onEnterSubmenu?: () => void;
  onLeaveSubmenu?: () => void;
}) {
  const hoveredIndex = signal<number | null>(null);
  const openIndex = signal<number | null>(null);
  const submenuMeta = signal<{ bounds: Bounds; placement: "left" | "right" } | undefined>(undefined);
  const itemRefs: (ViewRef | undefined)[] = [];
  let exitPoint: Point | undefined;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;

  const clearTimers = () => {
    if (openTimer !== undefined) {
      clearTimeout(openTimer);
      openTimer = undefined;
    }
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const inSafeTriangle = (point: Point): boolean => {
    const meta = submenuMeta();
    if (openIndex() === null || !exitPoint || !meta) return false;
    const tri = buildSafeTriangle(exitPoint, meta.bounds, meta.placement);
    return pointInTriangle(point, tri[0], tri[1], tri[2]);
  };

  const scheduleClose = () => {
    clearTimers();
    if (openIndex() === null) return;
    closeTimer = setTimeout(() => {
      closeTimer = undefined;
      openIndex.set(null);
      submenuMeta.set(undefined);
      exitPoint = undefined;
    }, MENU_CLOSE_DELAY_MS);
  };

  const handleRowEnter = (index: number, item: CascadeMenuItem, pagePoint: Point) => {
    hoveredIndex.set(index);
    const active = openIndex();
    if (active !== null && active !== index && inSafeTriangle(pagePoint)) {
      return;
    }
    clearTimers();
    if (item.disabled) {
      if (active !== null) scheduleClose();
      return;
    }
    if (item.children?.length) {
      if (active !== index) {
        openTimer = setTimeout(() => {
          openTimer = undefined;
          exitPoint = undefined;
          submenuMeta.set(undefined);
          openIndex.set(index);
        }, MENU_OPEN_DELAY_MS);
      }
    } else if (active !== null) {
      scheduleClose();
    }
  };

  const handleRowLeave = (index: number, pagePoint: Point) => {
    if (hoveredIndex() === index) hoveredIndex.set(null);
    if (openIndex() === index) {
      exitPoint = pagePoint;
    }
  };

  const handleRowPress = (index: number, item: CascadeMenuItem) => {
    if (item.disabled) return;
    if (item.children?.length) {
      clearTimers();
      exitPoint = undefined;
      submenuMeta.set(undefined);
      openIndex.set(openIndex() === index ? null : index);
      return;
    }
    item.onSelect?.();
    props.onCloseAll();
  };

  const activeChildItem = () => {
    const idx = openIndex();
    return idx !== null ? props.items[idx] : undefined;
  };

  const activeChildRef = () => {
    const idx = openIndex();
    return idx !== null ? (itemRefs[idx] ?? null) : null;
  };

  return (
    <View
      role="menu"
      accessibilityLabel={props.accessibilityLabel}
      class="min-w-[200px] gap-1 rounded-(--radius-xl) border border-border bg-popover p-2"
      style={{ boxShadow: elevatedShadow() }}
      onMouseEnter={() => {
        clearTimers();
        props.onEnterSubmenu?.();
      }}
      onMouseMove={(event) => {
        if (inSafeTriangle(event.pagePosition)) {
          clearTimers();
        }
      }}
      onMouseLeave={() => {
        props.onLeaveSubmenu?.();
        scheduleClose();
      }}
    >
      <Each of={props.items} key={(item) => item.id}>
        {(item, index) => {
          const isOpen = () => openIndex() === index();
          const hasChildren = () => (item().children?.length ?? 0) > 0;
          const isHighlighted = () => hoveredIndex() === index() || isOpen();
          return (
            <BaseButton
              ref={(ref) => { itemRefs[index()] = ref; }}
              role="menuitem"
              disabled={item().disabled}
              selected={item().selected === true || isOpen()}
              accessibilityLabel={item().label}
              onMouseEnter={(event) => handleRowEnter(index(), item(), event.pagePosition)}
              onMouseLeave={(event) => handleRowLeave(index(), event.pagePosition)}
              onPress={() => handleRowPress(index(), item())}
              class={`flex-row items-center justify-between gap-3 rounded-(--radius) px-3 py-2 ${motionClasses.color} ${focusRingClass} ${
                isHighlighted() ? "bg-surface-hover" : "bg-transparent"
              } disabled:opacity-50`}
            >
              <View class="min-w-0 flex-1 flex-row items-center gap-3">
                <If when={item().icon !== undefined}>
                  <Icon
                    name={item().icon!}
                    tone={item().danger ? "danger" : item().selected ? "accent" : "muted"}
                  />
                </If>
                <Text
                  class={`text-[14px] leading-5 ${
                    item().danger
                      ? "text-danger-foreground"
                      : item().selected
                        ? "font-semibold text-foreground"
                        : "font-normal text-foreground"
                  }`}
                >
                  {item().label}
                </Text>
              </View>
              <If when={item().selected === true && !hasChildren()}>
                <Icon name="check" tone="accent" />
              </If>
              <If when={hasChildren()}>
                <Icon name="chevron-right" tone="muted" />
              </If>
            </BaseButton>
          );
        }}
      </Each>

      <If when={(activeChildItem()?.children?.length ?? 0) > 0 && activeChildRef() !== null}>
        <Overlay
          anchor={activeChildRef()}
          placement="right"
          align="start"
          offset={12}
          margin={12}
          onPosition={(event) => {
            submenuMeta.set({
              bounds: event.bounds,
              placement: event.placement === "left" ? "left" : "right",
            });
          }}
        >
          <MenuPanel
            items={activeChildItem()?.children ?? []}
            accessibilityLabel={activeChildItem()?.label ?? "Submenu"}
            onCloseAll={props.onCloseAll}
            onEnterSubmenu={() => {
              clearTimers();
              exitPoint = undefined;
              props.onEnterSubmenu?.();
            }}
            onLeaveSubmenu={() => {
              scheduleClose();
              props.onLeaveSubmenu?.();
            }}
          />
        </Overlay>
      </If>
    </View>
  );
}

export interface CascadeMenuProps {
  items: readonly CascadeMenuItem[];
  accessibilityLabel: string;
  trigger: JSX.Element;
  placement?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

/** Desktop cascading menu with open/close delays and safe-triangle pointer protection. */
export function CascadeMenu(props: CascadeMenuProps) {
  const open = signal(false);
  let triggerRef: ViewRef | undefined;
  const closeAll = () => open.set(false);
  return (
    <View>
      <BaseButton
        ref={(ref) => { triggerRef = ref; }}
        selected={open()}
        onPress={() => open.update((value) => !value)}
        accessibilityLabel={props.accessibilityLabel}
        class={`size-9 items-center justify-center rounded-(--radius) border border-border bg-transparent hover:bg-surface-hover active:bg-surface-pressed ${motionClasses.color} ${focusRingClass}`}
      >
        {props.trigger}
      </BaseButton>
      <If when={open() && triggerRef !== undefined}>
        <Overlay
          anchor={triggerRef}
          placement={props.placement ?? "bottom"}
          align={props.align ?? "end"}
          offset={8}
          margin={12}
          onPressOutside={closeAll}
          onCancel={closeAll}
        >
          <MenuPanel
            items={props.items}
            accessibilityLabel={props.accessibilityLabel}
            onCloseAll={closeAll}
          />
        </Overlay>
      </If>
    </View>
  );
}
