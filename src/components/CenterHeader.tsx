import { horizontalSizeClass, Text, View } from "nsh";
import { formatTime, statusLabel } from "../format";
import {
  activeSnapshot,
  activeStatus,
  applyThemePreference,
  connectionState,
  coreSettings,
  createSession,
  isBusy,
  manualRefresh,
  openSettings,
  sidebarOpen,
} from "../store";
import { intentRevealClass, textClasses } from "../theme";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { CascadeMenu, type CascadeMenuItem } from "../ui/menu";

function statusTone(status: string | undefined): BadgeTone {
  if (status === "running" || status === "awaiting_approval") return "primary";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "danger";
  return "neutral";
}

export function CenterHeader() {
  const status = () => activeStatus();
  const isRegular = () => horizontalSizeClass() === "regular";
  const currentTheme = () => coreSettings()?.theme ?? "system";

  const menuItems = (): readonly CascadeMenuItem[] => [
    {
      id: "new-session",
      label: "New session",
      icon: "plus",
      disabled: isBusy("create") || connectionState() !== "online",
      onSelect: () => void createSession(),
    },
    {
      id: "refresh",
      label: "Refresh",
      icon: "refresh",
      disabled: isBusy("refresh") || connectionState() !== "online",
      onSelect: () => void manualRefresh(),
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: "sparkles",
      children: [
        {
          id: "theme-system",
          label: "System",
          selected: currentTheme() === "system",
          onSelect: () => void applyThemePreference("system"),
        },
        {
          id: "theme-light",
          label: "Light",
          selected: currentTheme() === "light",
          onSelect: () => void applyThemePreference("light"),
        },
        {
          id: "theme-dark",
          label: "Dark",
          selected: currentTheme() === "dark",
          onSelect: () => void applyThemePreference("dark"),
        },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      icon: "settings",
      children: [
        {
          id: "settings-provider",
          label: "Providers",
          onSelect: () => openSettings("provider"),
        },
        {
          id: "settings-general",
          label: "General",
          onSelect: () => openSettings("general"),
        },
      ],
    },
  ];

  return (
    <View
      class="group flex-row items-center gap-4 bg-background px-8 py-5"
      style={{ minHeight: 72 }}
    >
      <If when={!isRegular()}>
        <Button
          variant="outline"
          size="icon"
          onPress={() => sidebarOpen.set(true)}
          accessibilityLabel="Open sessions sidebar"
          tooltip="Sessions"
        >
          <Icon name="menu" />
        </Button>
      </If>

      <View class="min-w-0 flex-1 gap-1">
        <View class="min-w-0 flex-row items-center gap-3">
          <Text
            class={textClasses.title}
            style={{ numberOfLines: 1, textOverflow: "ellipsis", flexShrink: 1 }}
          >
            {activeSnapshot()?.title ?? "Forge NSH"}
          </Text>
          <If when={activeSnapshot() !== undefined}>
            <Badge dot tone={statusTone(status())} label={statusLabel(status())} />
          </If>
        </View>
        <If when={activeSnapshot() !== undefined}>
          <Text class={textClasses.secondary} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {activeSnapshot()?.model ?? "—"} · {formatTime(activeSnapshot()?.updatedAt)}
          </Text>
        </If>
      </View>

      <View class="flex-row items-center gap-2">
        <View class={isRegular() ? intentRevealClass : ""}>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => void manualRefresh()}
            disabled={isBusy("refresh") || connectionState() !== "online"}
            busy={isBusy("refresh")}
            accessibilityLabel="Refresh sessions"
            tooltip="Refresh"
          >
            <Icon name="refresh" tone={isBusy("refresh") || connectionState() !== "online" ? "disabled" : "muted"} />
          </Button>
        </View>
        <CascadeMenu
          items={menuItems()}
          accessibilityLabel="Workbench menu"
          trigger={<Icon name="more" />}
        />
      </View>
    </View>
  );
}
