import { horizontalSizeClass, Text, View } from "nsh";
import { formatTime, statusLabel } from "../format";
import {
  activeSnapshot,
  activeStatus,
  connectionState,
  isBusy,
  manualRefresh,
  sidebarOpen,
} from "../store";
import { textClasses } from "../theme";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";

function statusTone(status: string | undefined): BadgeTone {
  if (status === "running") return "info";
  if (status === "awaiting_approval") return "warning";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "danger";
  if (status === "completed") return "success";
  return "neutral";
}

export function CenterHeader() {
  const status = () => activeStatus();
  return (
    <View
      class="flex-row items-center gap-3 border-b border-border-subtle bg-surface-soft px-5 py-3"
      style={{ minHeight: 64 }}
    >
      <If when={horizontalSizeClass() !== "regular"}>
        <Button
          variant="outline"
          size="sm"
          label="☰"
          onPress={() => sidebarOpen.set(true)}
          accessibilityLabel="Open sessions sidebar"
          tooltip="Sessions"
        />
      </If>
      <View class="min-w-0 flex-1 gap-1">
        <View class="min-w-0 flex-row items-center gap-2">
          <Text
            class="text-lg font-semibold leading-6 tracking-tight text-foreground"
            style={{ numberOfLines: 1, textOverflow: "ellipsis", flexShrink: 1 }}
          >
            {activeSnapshot()?.title ?? "Forge NSH"}
          </Text>
          <Badge dot tone={statusTone(status())} label={statusLabel(status())} />
        </View>
        <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
          {activeSnapshot()
            ? `${activeSnapshot()?.model ?? "model not selected"} · updated ${formatTime(activeSnapshot()?.updatedAt)}`
            : "Embedded Forge Core · NSH web shell"}
        </Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        label={isBusy("refresh") ? "Refreshing…" : "Refresh"}
        onPress={() => void manualRefresh()}
        disabled={isBusy("refresh") || connectionState() !== "online"}
        busy={isBusy("refresh")}
        accessibilityLabel="Refresh sessions"
        tooltip="Refresh sessions"
      />
    </View>
  );
}
