import { horizontalSizeClass, keymap, Scroll, signal, Text, View } from "nsh";
import { prepareSettingsPage, requestCloseSettings, seedSettingsFormsFromCache } from "../settings";
import {
  connectionState,
  coreSettings,
  settingsLoadError,
  settingsLoadState,
} from "../store";
import { textClasses } from "../theme";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Surface } from "../ui/surface";
import { GeneralSettings } from "./settings/GeneralSettings";
import { ProviderSettings } from "./settings/ProviderSettings";

type SettingsSection = "provider" | "general";

const section = signal<SettingsSection>("provider");

const sections: readonly {
  id: SettingsSection;
  title: string;
  subtitle: string;
  description: string;
}[] = [
  {
    id: "provider",
    title: "Model providers",
    subtitle: "Sources & keys",
    description: "Manage provider endpoints, write-only credentials, model catalogs and the active source.",
  },
  {
    id: "general",
    title: "General",
    subtitle: "Runtime defaults",
    description: "Theme, permission, reasoning, timeout and context preferences for new runs.",
  },
];

function NavItem(props: { item: (typeof sections)[number] }) {
  const active = () => section() === props.item.id;
  return (
    <Button
      variant="nav"
      selected={active()}
      onPress={() => section.set(props.item.id)}
      accessibilityLabel={`Open ${props.item.title} settings`}
    >
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class={`text-sm leading-5 ${active() ? "font-bold text-foreground" : "font-medium text-secondary-foreground"}`}>
          {props.item.title}
        </Text>
        <Text class={textClasses.dim}>{props.item.subtitle}</Text>
      </View>
    </Button>
  );
}

function statusBadge(): { tone: BadgeTone; label: string } {
  if (connectionState() !== "online") return { tone: "danger", label: "Core offline" };
  if (settingsLoadState() === "loading" && !coreSettings()) return { tone: "warning", label: "Loading settings" };
  if (settingsLoadState() === "error" && !coreSettings()) return { tone: "danger", label: "Settings unavailable" };
  return coreSettings()?.isConfigured
    ? { tone: "success", label: "Provider configured" }
    : { tone: "warning", label: "Provider not configured" };
}

function SettingsUnavailable() {
  const loading = () => settingsLoadState() === "loading";
  return (
    <View class="flex-1 items-center justify-center p-8">
      <Surface variant="panel" class="max-w-[460px] items-center gap-3 px-5 py-6">
        <View class="size-11 items-center justify-center rounded-(--radius-lg) border border-warning-border bg-warning-soft">
          <Text class="text-lg font-bold leading-6 text-warning-foreground">!</Text>
        </View>
        <Text class={textClasses.title} style={{ textAlign: "center" }}>
          {loading() ? "Loading settings…" : connectionState() !== "online" ? "Forge Core is offline" : "Settings could not be loaded"}
        </Text>
        <Text class={`${textClasses.small} text-center leading-5`}>
          {loading()
            ? "Reading the public settings projection from the embedded Core."
            : settingsLoadError() ?? "Reconnect to Forge Core, then retry loading settings."}
        </Text>
        <Button
          variant="soft"
          size="sm"
          label={loading() ? "Loading…" : "Retry"}
          busy={loading()}
          disabled={loading() || connectionState() !== "online"}
          onPress={() => void prepareSettingsPage()}
        />
      </Surface>
    </View>
  );
}

function SettingsRail() {
  return (
    <View
      class="h-full border-r border-sidebar-border bg-sidebar pb-4 pt-4"
      style={{ width: 264, flexShrink: 0 }}
      role="navigation"
      accessibilityLabel="Settings navigation"
    >
      <View class="gap-4 px-4">
        <Button
          variant="ghost"
          size="sm"
          label="← Back to workbench"
          onPress={() => void requestCloseSettings()}
          accessibilityLabel="Back to workbench"
        />
        <View class="flex-row items-center gap-3">
          <View class="size-10 items-center justify-center rounded-(--radius-lg) border border-primary-border bg-primary-soft">
            <Text class="text-lg font-bold leading-6 text-primary">⚙</Text>
          </View>
          <View class="gap-0.5">
            <Text class="text-lg font-bold leading-6 tracking-tight text-sidebar-foreground">Settings</Text>
            <Text class={textClasses.dim}>Forge Core configuration</Text>
          </View>
        </View>
      </View>

      <View class="gap-1 px-2.5 pt-5">
        <Each of={sections} key={(item) => item.id}>
          {(item) => <NavItem item={item()} />}
        </Each>
      </View>

      <View class="flex-1" />
      <View class="mx-3 border-t border-sidebar-border px-1 pt-3">
        <Text class={textClasses.dim}>
          Shares configuration with the Forge CLI · secrets are write-only
        </Text>
      </View>
    </View>
  );
}

function SettingsContentHeader() {
  const current = () => sections.find((item) => item.id === section()) ?? sections[0];
  const badge = () => statusBadge();
  return (
    <View
      class="flex-row flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-soft px-5 py-3"
      style={{ minHeight: 68 }}
    >
      <View class="min-w-0 flex-1 gap-1">
        <View class="flex-row flex-wrap items-center gap-2">
          <Text class="text-lg font-semibold leading-6 tracking-tight text-foreground">
            {current().title}
          </Text>
          <Badge dot tone={badge().tone} label={badge().label} />
        </View>
        <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
          {current().description}
        </Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        label={settingsLoadState() === "loading" ? "Refreshing…" : "Refresh"}
        busy={settingsLoadState() === "loading"}
        disabled={settingsLoadState() === "loading" || connectionState() !== "online"}
        onPress={() => void prepareSettingsPage()}
        accessibilityLabel="Refresh settings"
      />
    </View>
  );
}

function CompactSettingsHeader() {
  const badge = () => statusBadge();
  return (
    <View class="gap-3 border-b border-border-subtle bg-surface-soft px-4 py-3">
      <View class="flex-row items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          label="← Back"
          onPress={() => void requestCloseSettings()}
          accessibilityLabel="Back to workbench"
        />
        <View class="min-w-0 flex-1 flex-row items-center justify-center gap-2">
          <Text class="text-base font-bold leading-5 tracking-tight text-foreground">Settings</Text>
          <Badge dot tone={badge().tone} label={badge().label} />
        </View>
        <Button
          variant="outline"
          size="sm"
          label={settingsLoadState() === "loading" ? "Refreshing…" : "Refresh"}
          busy={settingsLoadState() === "loading"}
          disabled={settingsLoadState() === "loading" || connectionState() !== "online"}
          onPress={() => void prepareSettingsPage()}
          accessibilityLabel="Refresh settings"
        />
      </View>
      <View
        class="flex-row gap-1 rounded-(--radius-lg) border border-border-subtle bg-surface-inset p-1"
        role="tablist"
        accessibilityLabel="Settings sections"
      >
        <Each of={sections} key={(item) => item.id}>
          {(item) => {
            const active = () => section() === item().id;
            return (
              <Button
                variant={active() ? "soft" : "ghost"}
                size="sm"
                class="flex-1"
                label={item().title}
                selected={active()}
                onPress={() => section.set(item().id)}
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
  // Components are constructed once in NSH. Seeding is cheap and prepare owns a
  // fresh authoritative read for this presentation of the page.
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
          <Scroll class="min-h-0 flex-1" contentClass="px-5 py-5">
            <View class="mx-auto w-full max-w-[980px]">
              <If when={settingsLoadState() === "error" && settingsLoadError() !== undefined}>
                <Surface variant="warning" class="mb-4 gap-1 px-4 py-3" role="alert">
                  <Text class="text-xs font-bold leading-4 text-warning-foreground">Refresh failed</Text>
                  <Text class="text-xs leading-4 text-muted-foreground">
                    {settingsLoadError()}{" "}
                    {connectionState() !== "online"
                      ? "Cached settings are shown; saving is disabled while Core is offline."
                      : "Cached settings are shown; retry refreshing before saving."}
                  </Text>
                </Surface>
              </If>
              <If when={section() === "provider"} else={<GeneralSettings />}>
                <ProviderSettings />
              </If>
            </View>
          </Scroll>
        </If>
      </View>
    </View>
  );
}
