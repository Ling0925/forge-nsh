import { colorScheme, Image, split, token, View } from "nsh";
import type { ImageAsset } from "nsh";
import alertIcon from "../assets/icons/alert.svg";
import arrowDownIcon from "../assets/icons/arrow-down.svg";
import arrowLeftIcon from "../assets/icons/arrow-left.svg";
import arrowUpRightIcon from "../assets/icons/arrow-up-right.svg";
import checkIcon from "../assets/icons/check.svg";
import chevronDownIcon from "../assets/icons/chevron-down.svg";
import chevronRightIcon from "../assets/icons/chevron-right.svg";
import closeIcon from "../assets/icons/close.svg";
import copyIcon from "../assets/icons/copy.svg";
import menuIcon from "../assets/icons/menu.svg";
import moreIcon from "../assets/icons/more.svg";
import plusIcon from "../assets/icons/plus.svg";
import refreshIcon from "../assets/icons/refresh.svg";
import sendIcon from "../assets/icons/send.svg";
import settingsIcon from "../assets/icons/settings.svg";
import sparklesIcon from "../assets/icons/sparkles.svg";
import stopIcon from "../assets/icons/stop.svg";
import trashIcon from "../assets/icons/trash.svg";

const ICONS = {
  alert: alertIcon,
  "arrow-down": arrowDownIcon,
  "arrow-left": arrowLeftIcon,
  "arrow-up-right": arrowUpRightIcon,
  check: checkIcon,
  "chevron-down": chevronDownIcon,
  "chevron-right": chevronRightIcon,
  close: closeIcon,
  copy: copyIcon,
  menu: menuIcon,
  more: moreIcon,
  plus: plusIcon,
  refresh: refreshIcon,
  send: sendIcon,
  settings: settingsIcon,
  sparkles: sparklesIcon,
  stop: stopIcon,
  trash: trashIcon,
} as const satisfies Record<string, ImageAsset>;

export type IconName = keyof typeof ICONS;
export type IconTone = "default" | "muted" | "accent" | "inverse" | "danger" | "disabled";

function toneColor(tone: IconTone): string {
  // Read colorScheme reactively so icon tint updates on light/dark switches.
  colorScheme();
  switch (tone) {
    case "muted":
      return token("muted-foreground");
    case "accent":
      return token("primary");
    case "inverse":
      return token("primary-foreground");
    case "danger":
      return token("danger-foreground");
    case "disabled":
      return token("control-disabled-foreground");
    default:
      return token("foreground");
  }
}

export interface IconProps {
  name: IconName;
  tone?: IconTone;
  class?: string;
}

/** Reicon icon (18px glyph inside a 24x24px transparent frame). */
export function Icon(props: IconProps) {
  const [own] = split(props, ["name", "tone", "class"]);
  return (
    <View class={`size-6 shrink-0 items-center justify-center ${own.class ?? ""}`}>
      <Image
        src={ICONS[own.name]}
        style={{
          width: 18,
          height: 18,
          tintColor: toneColor(own.tone ?? "default"),
        }}
      />
    </View>
  );
}
