import { Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import { compactPath, formatTime, oneLine, statusLabel } from "../format";
import {
  activeSessionId,
  busyAction,
  connectionState,
  createSession,
  selectSession,
  sessionCount,
  socketState,
  sortedSessions,
  workspace,
} from "../store";
import type { SessionSummary } from "../protocol";
import { buttonBase, colors, textStyles } from "../theme";

function StatusDot(props: { tone: "live" | "connecting" | "offline" }) {
  const color = props.tone === "live"
    ? colors.success
    : props.tone === "connecting"
      ? colors.warning
      : colors.danger;
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        marginTop: 4,
      }}
    />
  );
}

function SessionRow(props: { session: SessionSummary }) {
  const selected = () => activeSessionId() === props.session.id;
  const statusColor = () => props.session.status === "running" || props.session.status === "awaiting_approval"
    ? colors.accentBright
    : props.session.status === "failed"
      ? colors.danger
      : colors.textDim;
  return (
    <Button
      onPress={() => void selectSession(props.session.id)}
      accessibilityLabel={`Open session ${props.session.title}`}
      style={{
        width: "100%",
        alignItems: "stretch",
        borderRadius: 11,
        paddingHorizontal: 10,
        paddingVertical: 9,
        backgroundColor: selected() ? colors.accentSoft : "transparent",
        borderWidth: 1,
        borderColor: selected() ? "#453781" : "transparent",
      }}
      hoverStyle={{
        backgroundColor: selected() ? colors.accentSoft : colors.panelSoft,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            marginTop: 6,
            backgroundColor: statusColor(),
          }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text
            style={{
              color: selected() ? colors.text : "#d7dce6",
              fontSize: 13,
              fontWeight: selected() ? "650" : "500",
              lineHeight: 17,
              numberOfLines: 1,
              textOverflow: "ellipsis",
            }}
          >
            {props.session.title || "Untitled session"}
          </Text>
          <Text style={{ ...textStyles.dim, numberOfLines: 1, textOverflow: "ellipsis" }}>
            {statusLabel(props.session.status)} · {formatTime(props.session.updatedAt)}
          </Text>
        </View>
      </View>
    </Button>
  );
}

export function Sidebar() {
  const socketTone = () => connectionState() !== "online"
    ? "offline" as const
    : socketState() === "live"
      ? "live" as const
      : "connecting" as const;
  return (
    <View
      style={{
        width: 282,
        height: "100%",
        backgroundColor: colors.sidebar,
        borderRightWidth: 1,
        borderRightColor: colors.borderSoft,
        paddingTop: 18,
        paddingBottom: 14,
      }}
    >
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(124, 92, 255, 0.32)",
            }}
          >
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "800" }}>F</Text>
          </View>
          <View style={{ gap: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "750", letterSpacing: -0.2 }}>
              Forge NSH
            </Text>
            <Text style={textStyles.dim}>native shell workbench</Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 12,
            backgroundColor: "#0f131c",
            borderWidth: 1,
            borderColor: colors.borderSoft,
            paddingHorizontal: 11,
            paddingVertical: 10,
            gap: 4,
          }}
        >
          <Text style={textStyles.eyebrow}>Workspace</Text>
          <Text style={{ ...textStyles.small, numberOfLines: 1, textOverflow: "ellipsis" }}>
            {compactPath(workspace() || "connecting…")}
          </Text>
        </View>

        <Button
          onPress={() => void createSession()}
          disabled={busyAction() === "create" || connectionState() !== "online"}
          accessibilityLabel="Create a new Forge session"
          style={{
            ...buttonBase,
            backgroundColor: colors.accent,
            opacity: busyAction() === "create" || connectionState() !== "online" ? 0.55 : 1,
          }}
          hoverStyle={{ backgroundColor: "#8d72ff" }}
        >
          <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}>
            {busyAction() === "create" ? "Creating…" : "+ New session"}
          </Text>
        </Button>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={textStyles.eyebrow}>Sessions</Text>
          <Text style={textStyles.dim}>{sessionCount()}</Text>
        </View>
      </View>

      <Scroll style={{ flex: 1 }} contentClass="gap-1">
        <View style={{ paddingHorizontal: 10, gap: 3 }}>
          <If
            when={sortedSessions().length > 0}
            else={(
              <View style={{ paddingHorizontal: 8, paddingVertical: 18, gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>
                  No sessions yet
                </Text>
                <Text style={textStyles.dim}>Create one to start a Forge run in this workspace.</Text>
              </View>
            )}
          >
            <Each of={sortedSessions()} key={(session) => session.id}>
              {(session) => <SessionRow session={session()} />}
            </Each>
          </If>
        </View>
      </Scroll>

      <View
        style={{
          marginHorizontal: 14,
          marginTop: 10,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.borderSoft,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <StatusDot tone={socketTone()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
              {connectionState() === "online"
                ? socketState() === "live" ? "Core connected" : "Core reachable; events connecting"
                : "Core disconnected"}
            </Text>
            <Text style={textStyles.dim}>{oneLine(workspace() || "waiting for /api/connect", 42)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
