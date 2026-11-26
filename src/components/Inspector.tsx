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
import { colors, textStyles } from "../theme";

function Section(props: { title: string; children?: JSX.Element }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 13, gap: 10 }}>
      <Text style={textStyles.eyebrow}>{props.title}</Text>
      <View style={{ gap: 8 }}>{props.children}</View>
    </View>
  );
}

function Fact(props: { label: string; value: string; tone?: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ width: 82, flexShrink: 0 }}>
        <Text style={{ ...textStyles.dim, numberOfLines: 1 }}>{props.label}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: props.tone ?? "#c8cfdb",
            fontSize: 12,
            lineHeight: 17,
            fontFamily: props.mono ? "monospace" : undefined,
            numberOfLines: 2,
            textOverflow: "ellipsis",
          }}
        >
          {props.value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.borderSoft }} />;
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
  const connectionTone = () => connectionState() === "online" && socketState() === "live"
    ? colors.success
    : connectionState() === "online" ? colors.warning : colors.danger;
  const statusTone = () => {
    const status = activeRun().status ?? activeSnapshot()?.status;
    if (status === "running" || status === "awaiting_approval") return colors.accentBright;
    if (status === "failed" || status === "cancelled" || status === "interrupted") return colors.danger;
    if (status === "completed") return colors.success;
    return colors.textMuted;
  };
  return (
    <View
      style={{
        width: 302,
        height: "100%",
        backgroundColor: "#0c0f15",
        borderLeftWidth: 1,
        borderLeftColor: colors.borderSoft,
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "750" }}>Inspector</Text>
        <Text style={textStyles.dim}>Connection, workspace and run state</Text>
      </View>
      <Divider />
      <Scroll style={{ flex: 1 }}>
        <Section title="Connection">
          <Fact label="State" value={connectionText()} tone={connectionTone()} />
          <Fact label="Client" value={shortId(connectInfo()?.clientId)} mono />
          <Fact label="Cursor" value={String(lastCursor())} mono />
          <Fact label="Endpoint" value={endpointText()} mono />
          <Fact
            label="Provider"
            value={coreSettings()?.isConfigured ? "configured" : "not configured"}
            tone={coreSettings()?.isConfigured ? colors.success : colors.warning}
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
          <Fact label="Last event" value={formatTime(activeSnapshot()?.updatedAt)} />
        </Section>
        <Divider />
        <View style={{ padding: 16, gap: 8 }}>
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#43320f",
              backgroundColor: "#191309",
              padding: 11,
              gap: 5,
            }}
          >
            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800" }}>Trusted LAN only</Text>
            <Text style={{ color: "#b8a586", fontSize: 11, lineHeight: 16 }}>
              HTTP is not encrypted. Anyone who can reach this port can use the embedded Forge Core.
            </Text>
          </View>
        </View>
      </Scroll>
    </View>
  );
}
