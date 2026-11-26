import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { formatTime, statusLabel } from "../format";
import {
  activeRun,
  activeSessionId,
  activeSnapshot,
  busyAction,
  refreshSession,
  refreshSessions,
} from "../store";
import { colors, textStyles } from "../theme";

function statusTone(status: string | undefined): string {
  if (status === "running" || status === "awaiting_approval") return colors.accentBright;
  if (status === "failed" || status === "cancelled" || status === "interrupted") return colors.danger;
  if (status === "completed") return colors.success;
  return colors.textDim;
}

export function CenterHeader() {
  const status = () => activeRun().status ?? activeSnapshot()?.status;
  const refresh = () => {
    const id = activeSessionId();
    if (id) void refreshSession(id);
    void refreshSessions();
  };
  return (
    <View
      style={{
        minHeight: 64,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSoft,
        backgroundColor: "#0d1017",
        paddingHorizontal: 20,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: "720",
              lineHeight: 22,
              numberOfLines: 1,
              textOverflow: "ellipsis",
              flexShrink: 1,
            }}
          >
            {activeSnapshot()?.title ?? "Forge NSH"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              backgroundColor: "#11151e",
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusTone(status()) }} />
            <Text style={{ color: "#aeb6c5", fontSize: 11, fontWeight: "700" }}>{statusLabel(status())}</Text>
          </View>
        </View>
        <Text style={{ ...textStyles.dim, numberOfLines: 1, textOverflow: "ellipsis" }}>
          {activeSnapshot()
            ? `${activeSnapshot()?.model ?? "model not selected"} · updated ${formatTime(activeSnapshot()?.updatedAt)}`
            : "Embedded Forge Core · NSH web shell"}
        </Text>
      </View>
      <Button
        onPress={refresh}
        disabled={busyAction() !== undefined}
        accessibilityLabel="Refresh sessions"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: "#121722",
          opacity: busyAction() !== undefined ? 0.55 : 1,
        }}
        hoverStyle={{ backgroundColor: "#1a202c" }}
      >
        <Text style={{ color: "#b9c1cf", fontSize: 16, fontWeight: "800" }}>⟳</Text>
      </Button>
    </View>
  );
}
