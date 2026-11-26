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

function Section(props: { title: string; children?: JSX.Element }) {
  return (
    <View class="gap-4" role="group">
      <Text class="text-[14px] font-semibold leading-5 text-foreground" role="header" accessibilityLevel={2}>
        {props.title}
      </Text>
      <View class="gap-3">{props.children}</View>
    </View>
  );
}

type FactTone = "default" | "muted" | "accent" | "danger";

const factToneClasses: Record<FactTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  accent: "text-primary",
  danger: "text-danger-foreground",
};

function Fact(props: { label: string; value: string; tone?: FactTone; mono?: boolean }) {
  return (
    <View class="flex-row items-start gap-3">
      <View style={{ width: 88, flexShrink: 0 }}>
        <Text class={textClasses.secondary} style={{ numberOfLines: 1 }}>{props.label}</Text>
      </View>
      <View class="min-w-0 flex-1">
        <Text
          class={`text-[14px] leading-5 ${props.mono ? "font-mono " : ""}${factToneClasses[props.tone ?? "default"]}`}
          style={{ numberOfLines: 2, textOverflow: "ellipsis" }}
        >
          {props.value}
        </Text>
      </View>
    </View>
  );
}

export function Inspector() {
  const endpointText = () => {
    try {
      return new URL(pageOrigin()).host;
    } catch {
      return "—";
    }
  };
  const connectionText = () => connectionState() === "online"
    ? socketState() === "live" ? "Live" : "Connecting"
    : "Offline";
  const connectionTone = (): FactTone => connectionState() === "online" && socketState() === "live"
    ? "default"
    : connectionState() === "online" ? "muted" : "danger";
  const statusTone = (): FactTone => {
    const status = activeRun().status ?? activeSnapshot()?.status;
    if (status === "running" || status === "awaiting_approval") return "accent";
    if (status === "failed" || status === "cancelled" || status === "interrupted") return "danger";
    return "default";
  };

  return (
    <View class="h-full bg-sidebar" style={{ width: 300 }}>
      <View class="px-6 pb-4 pt-6">
        <Text class={textClasses.title}>Inspector</Text>
      </View>
      <Scroll class="min-h-0 flex-1" contentClass="gap-8 px-6 pb-8 pt-2">
        <Section title="Connection">
          <Fact label="State" value={connectionText()} tone={connectionTone()} />
          <Fact label="Client" value={shortId(connectInfo()?.clientId)} mono />
          <Fact label="Cursor" value={String(lastCursor())} mono />
          <Fact label="Endpoint" value={endpointText()} mono />
          <Fact
            label="Provider"
            value={coreSettings()?.isConfigured ? "Configured" : "Unconfigured"}
            tone={coreSettings()?.isConfigured ? "default" : "muted"}
          />
          <Fact label="Models" value={String(availableModels().length)} mono />
        </Section>

        <Section title="Workspace">
          <Fact label="Path" value={compactPath(workspace() || "—", 48)} mono />
          <Fact
            label="Mode"
            value={connectInfo()?.restrictWorkspace === false ? "Multi-workspace" : "Single"}
          />
        </Section>

        <Section title="Session">
          <Fact label="Title" value={activeSnapshot()?.title ?? "—"} />
          <Fact label="ID" value={shortId(activeSessionId(), 12)} mono />
          <Fact label="Model" value={activeRun().model || activeSnapshot()?.model || coreSettings()?.model || availableModels()[0] || "—"} mono />
          <Fact
            label="Status"
            value={statusLabel(activeRun().status ?? activeSnapshot()?.status)}
            tone={statusTone()}
          />
          <Fact label="Updated" value={formatDateTime(activeSnapshot()?.updatedAt)} />
        </Section>

        <Section title="Run">
          <Fact label="Run ID" value={shortId(activeRun().runId, 12)} mono />
          <Fact label="Permission" value={activeRun().permission ?? "default"} />
          <Fact label="Tool" value={activeRun().currentTool ?? "—"} mono />
          <Fact label="Context" value={activeRun().contextLabel ?? "—"} mono />
          <Fact label="Usage" value={activeRun().usageLabel ?? "—"} />
          <Fact label="Last event" value={formatTime(activeRun().lastEventAt ?? activeSnapshot()?.updatedAt)} />
        </Section>
      </Scroll>
    </View>
  );
}
