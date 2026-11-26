import { Scroll, Text, View } from "nsh";
import type { JSX } from "nsh";
import { compactPath, formatDateTime, formatTime, shortId, statusLabel } from "../format";
import { pageOrigin } from "../protocol";
import {
  activeRun,
  activeSessionId,
  activeSnapshot,
  availableModels,
  connectInfo,
  connectionState,
  coreSettings,
  lastCursor,
  socketState,
  workspace,
} from "../store";
import { textClasses } from "../theme";
import { Surface } from "../ui/surface";

function Section(props: { title: string; children?: JSX.Element }) {
  return (
    <View class="gap-2.5 px-4 py-3" role="group">
      <Text class={textClasses.eyebrow} role="header" accessibilityLevel={2}>{props.title}</Text>
      <View class="gap-2">{props.children}</View>
    </View>
  );
}

type FactTone = "neutral" | "dim" | "info" | "success" | "warning" | "danger";

const factToneClasses: Record<FactTone, string> = {
  neutral: "text-secondary-foreground",
  dim: "text-dim-foreground",
  info: "text-info-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

function Fact(props: { label: string; value: string; tone?: FactTone; mono?: boolean }) {
  return (
    <View class="flex-row items-start gap-2.5">
      <View style={{ width: 84, flexShrink: 0 }}>
        <Text class={textClasses.dim} style={{ numberOfLines: 1 }}>{props.label}</Text>
      </View>
      <View class="min-w-0 flex-1">
        <Text
          class={`text-xs leading-4 ${props.mono ? "font-mono " : ""}${factToneClasses[props.tone ?? "neutral"]}`}
          style={{ numberOfLines: 2, textOverflow: "ellipsis" }}
        >
          {props.value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View class="h-px bg-border-subtle" />;
}

export function Inspector() {
  const endpointText = () => {
    try {
      return `LAN ${new URL(pageOrigin()).host}`;
    } catch {
      return "LAN endpoint";
    }
  };
  const connectionText = () => connectionState() === "online"
    ? socketState() === "live" ? "online · events live" : "online · events connecting"
    : "offline";
  const connectionTone = (): FactTone => connectionState() === "online" && socketState() === "live"
    ? "success"
    : connectionState() === "online" ? "warning" : "danger";
  const statusTone = (): FactTone => {
    const status = activeRun().status ?? activeSnapshot()?.status;
    if (status === "running") return "info";
    if (status === "awaiting_approval") return "warning";
    if (status === "failed" || status === "cancelled" || status === "interrupted") return "danger";
    if (status === "completed") return "success";
    return "dim";
  };
  return (
    <View
      class="h-full border-l border-sidebar-border bg-sidebar"
      style={{ width: 300 }}
    >
      <View class="gap-1 px-4 pb-3 pt-4">
        <Text class="text-base font-bold leading-5 tracking-tight text-sidebar-foreground">Inspector</Text>
        <Text class={textClasses.dim}>Connection, workspace and run state</Text>
      </View>
      <Divider />
      <Scroll class="min-h-0 flex-1">
        <Section title="Connection">
          <Fact label="State" value={connectionText()} tone={connectionTone()} />
          <Fact label="Client" value={shortId(connectInfo()?.clientId)} mono />
          <Fact label="Cursor" value={String(lastCursor())} mono />
          <Fact label="Endpoint" value={endpointText()} mono />
          <Fact
            label="Provider"
            value={coreSettings()?.isConfigured ? "configured" : "not configured"}
            tone={coreSettings()?.isConfigured ? "success" : "warning"}
          />
          <Fact label="Models" value={String(availableModels().length)} mono />
        </Section>
        <Divider />
        <Section title="Workspace">
          <Fact label="Path" value={compactPath(workspace() || "—", 52)} mono />
          <Fact
            label="Mode"
            value={connectInfo()?.restrictWorkspace === false ? "multi-workspace" : "single workspace"}
          />
          <Fact label="Sessions" value={activeSnapshot() ? "snapshot loaded" : "none selected"} />
        </Section>
        <Divider />
        <Section title="Session">
          <Fact label="Title" value={activeSnapshot()?.title ?? "—"} />
          <Fact label="ID" value={shortId(activeSessionId(), 12)} mono />
          <Fact label="Model" value={activeRun().model ?? activeSnapshot()?.model ?? coreSettings()?.model ?? availableModels()[0] ?? "—"} mono />
          <Fact
            label="Status"
            value={statusLabel(activeRun().status ?? activeSnapshot()?.status)}
            tone={statusTone()}
          />
          <Fact label="Updated" value={formatDateTime(activeSnapshot()?.updatedAt)} />
        </Section>
        <Divider />
        <Section title="Run">
          <Fact label="Run ID" value={shortId(activeRun().runId, 12)} mono />
          <Fact label="Permission" value={activeRun().permission ?? "default"} />
          <Fact label="Tool" value={activeRun().currentTool ?? "—"} mono />
          <Fact label="Context" value={activeRun().contextLabel ?? "—"} mono />
          <Fact label="Usage" value={activeRun().usageLabel ?? "—"} />
          <Fact label="Last event" value={formatTime(activeRun().lastEventAt ?? activeSnapshot()?.updatedAt)} />
        </Section>
        <Divider />
        <View class="p-4">
          <Surface variant="warning" class="gap-1.5 p-3">
            <Text class="text-xs font-bold leading-4 text-warning-foreground">Trusted LAN only</Text>
            <Text class="text-xs leading-4 text-muted-foreground">
              HTTP is not encrypted. Anyone who can reach this port can use the embedded Forge Core.
            </Text>
          </Surface>
        </View>
      </Scroll>
    </View>
  );
}
