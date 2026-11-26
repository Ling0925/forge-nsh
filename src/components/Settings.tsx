import { horizontalSizeClass, keymap, Scroll, Text, View } from "nsh";
import { prepareSettingsPage, requestCloseSettings, seedSettingsFormsFromCache } from "../settings";
import {
  connectionState,
  coreSettings,
  settingsLoadError,
  settingsLoadState,
  settingsSection,
  type SettingsSection,
} from "../store";
import { textClasses } from "../theme";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Surface } from "../ui/surface";
import { GeneralSettings } from "./settings/GeneralSettings";
import { ProviderSettings } from "./settings/ProviderSettings";

const sections: readonly {
  id: SettingsSection;
  title: string;
}[] = [
  { id: "provider", title: "Providers" },
  { id: "general", title: "General" },
];

function NavItem(props: { item: (typeof sections)[number] }) {
  const active = () => settingsSection() === props.item.id;
  return (
    <Button
      variant="nav"
      selected={active()}
      onPress={() => settingsSection.set(props.item.id)}
      accessibilityLabel={`Open ${props.item.title} settings`}
    >
      <Text class={`text-[14px] leading-5 ${active() ? "font-semibold text-foreground" : "font-normal text-muted-foreground"}`}>
        {props.item.title}
      </Text>
    </Button>
  );
}

function statusBadge(): { tone: BadgeTone; label: string } {
  if (connectionState() !== "online") return { tone: "danger", label: "Offline" };
  if (settingsLoadState() === "loading" && !coreSettings()) return { tone: "neutral", label: "Loading" };
  if (settingsLoadState() === "error" && !coreSettings()) return { tone: "danger", label: "Unavailable" };
  return coreSettings()?.isConfigured
    ? { tone: "neutral", label: "Configured" }
    : { tone: "neutral", label: "Unconfigured" };
}

function SettingsUnavailable() {
  const loading = () => settingsLoadState() === "loading";
  return (
    <View class="flex-1 items-center justify-center p-12">
      <View class="max-w-[460px] items-center gap-6">
        <Icon name="alert" tone="muted" />
        <Text class={textClasses.title} style={{ textAlign: "center" }}>
          {loading() ? "Loading…" : connectionState() !== "online" ? "Offline" : "Settings unavailable"}
        </Text>
        <If when={!loading() && settingsLoadError() !== undefined}>
          <Text class={`${textClasses.secondary} text-center`} role="alert">
            {settingsLoadError()}
          </Text>
        </If>
        <Button
          variant="primary"
          size="sm"
          icon="refresh"
          label={loading() ? "Loading…" : "Retry"}
          busy={loading()}
          disabled={loading() || connectionState() !== "online"}
          onPress={() => void prepareSettingsPage()}
        />
      </View>
    </View>
  );
}

function SettingsRail() {
  return (
    <View
      class="h-full bg-sidebar py-6"
      style={{ width: 264, flexShrink: 0 }}
      role="navigation"
      accessibilityLabel="Settings navigation"
    >
      <View class="gap-6 px-6">
        <Button
          variant="ghost"
          size="sm"
          icon="arrow-left"
          class="w-fit px-2"
          label="Back"
          onPress={() => void requestCloseSettings()}
          accessibilityLabel="Back to workbench"
        />
        <View class="flex-row items-center gap-3">
          <Icon name="settings" />
          <Text class={textClasses.title}>Settings</Text>
        </View>
      </View>

      <View class="gap-1 px-4 pt-8">
        <Each of={sections} key={(item) => item.id}>
          {(item) => <NavItem item={item()} />}
        </Each>
      </View>
    </View>
  );
}

function SettingsContentHeader() {
  const current = () => sections.find((item) => item.id === settingsSection()) ?? sections[0];
  const badge = () => statusBadge();
  return (
    <View
      class="flex-row flex-wrap items-center justify-between gap-4 bg-background px-8 py-5"
      style={{ minHeight: 72 }}
    >
      <View class="min-w-0 flex-row items-center gap-3">
        <Text class={textClasses.title}>{current().title}</Text>
        <Badge dot tone={badge().tone} label={badge().label} />
      </View>
      <Button
        variant="ghost"
        size="icon"
        busy={settingsLoadState() === "loading"}
        disabled={settingsLoadState() === "loading" || connectionState() !== "online"}
        onPress={() => void prepareSettingsPage()}
        accessibilityLabel="Refresh settings"
        tooltip="Refresh"
      >
        <Icon
          name="refresh"
          tone={settingsLoadState() === "loading" || connectionState() !== "online" ? "disabled" : "muted"}
        />
      </Button>
    </View>
  );
}

function CompactSettingsHeader() {
  const badge = () => statusBadge();
  return (
    <View class="gap-4 bg-background px-6 py-4">
      <View class="flex-row items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          icon="arrow-left"
          label="Back"
          onPress={() => void requestCloseSettings()}
          accessibilityLabel="Back to workbench"
        />
        <View class="flex-row items-center gap-2">
          <Text class={textClasses.title}>Settings</Text>
          <Badge dot tone={badge().tone} label={badge().label} />
        </View>
        <Button
          variant="ghost"
          size="icon"
          busy={settingsLoadState() === "loading"}
          disabled={settingsLoadState() === "loading" || connectionState() !== "online"}
          onPress={() => void prepareSettingsPage()}
          accessibilityLabel="Refresh settings"
        >
          <Icon
            name="refresh"
            tone={settingsLoadState() === "loading" || connectionState() !== "online" ? "disabled" : "muted"}
          />
        </Button>
      </View>
      <View
        class="flex-row gap-1 rounded-(--radius-lg) bg-surface-soft p-1"
        role="tablist"
        accessibilityLabel="Settings sections"
      >
        <Each of={sections} key={(item) => item.id}>
          {(item) => {
            const active = () => settingsSection() === item().id;
            return (
              <Button
                variant={active() ? "secondary" : "ghost"}
                size="sm"
                class={`flex-1 ${active() ? "bg-surface-raised font-semibold" : ""}`}
                label={item().title}
                selected={active()}
                onPress={() => settingsSection.set(item().id)}
                accessibilityLabel={`Open ${item().title} settings`}
              />
            );
          }}
        </Each>
      </View>
    </View>
  );
}

export function SettingsScreen() {
  queueMicrotask(() => {
    seedSettingsFormsFromCache();
    void prepareSettingsPage();
  });
  keymap.bind("escape", () => void requestCloseSettings());
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <View class={`h-full w-full overflow-hidden bg-background ${isRegular() ? "flex-row" : "flex-col"}`}>
      <If when={isRegular()} else={<CompactSettingsHeader />}>
        <SettingsRail />
      </If>

      <View class="min-h-0 min-w-0 flex-1 bg-background">
        <If when={isRegular()}>
          <SettingsContentHeader />
        </If>

        <If when={coreSettings() !== undefined} else={<SettingsUnavailable />}>
          <Scroll class="min-h-0 flex-1" contentClass="px-8 py-8">
            <View class="mx-auto w-full max-w-[840px] gap-8">
              <If when={settingsLoadState() === "error" && settingsLoadError() !== undefined}>
                <Surface variant="danger" class="flex-row items-center gap-3 p-4" role="alert">
                  <Icon name="alert" tone="danger" />
                  <Text class="flex-1 text-[14px] leading-5 text-danger-foreground">
                    {settingsLoadError()}
                  </Text>
                </Surface>
              </If>
              <If when={settingsSection() === "provider"} else={<GeneralSettings />}>
                <ProviderSettings />
              </If>
            </View>
          </Scroll>
        </If>
      </View>
    </View>
  );
}
