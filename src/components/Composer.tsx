import { Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { clampText, oneLine } from "../format";
import {
  activeRun,
  activeSessionId,
  activeSnapshot,
  answerApproval,
  busyAction,
  cancelActive,
  composerText,
  connectionState,
  createSession,
  lastError,
  sendPrompt,
  socketState,
} from "../store";
import { colors, textStyles } from "../theme";

function isWorking(status: string | undefined): boolean {
  return status === "running" || status === "awaiting_approval";
}

function ApprovalCard() {
  const approval = () => activeRun().pendingApproval;
  return (
    <If when={approval() !== undefined}>
      <View
        style={{
          marginHorizontal: 18,
          marginBottom: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#714c24",
          backgroundColor: "#201812",
          padding: 13,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View
            style={{
              width: 25,
              height: 25,
              borderRadius: 8,
              backgroundColor: "#573916",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900" }}>!</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
              Approval required · {approval()?.toolName ?? "tool"}
            </Text>
            <Text style={textStyles.dim}>Forge is paused until you decide.</Text>
          </View>
        </View>
        <Text style={{ color: "#d7c7b2", fontSize: 12, lineHeight: 17 }}>
          {clampText(approval()?.description ?? "", 700)}
        </Text>
        <If when={(approval()?.command?.length ?? 0) > 0}>
          <View style={{ borderRadius: 9, backgroundColor: "#100d0a", paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: "#f0d8b5", fontSize: 12, fontFamily: "monospace" }}>
              {oneLine(approval()?.command?.join(" ") ?? "", 240)}
            </Text>
          </View>
        </If>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button
            onPress={() => void answerApproval(false)}
            disabled={busyAction() === "approval"}
            style={{
              borderRadius: 9,
              paddingHorizontal: 13,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "#171a21",
            }}
            hoverStyle={{ backgroundColor: "#1d212a" }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700" }}>Deny</Text>
          </Button>
          <Button
            onPress={() => void answerApproval(true)}
            disabled={busyAction() === "approval"}
            style={{
              borderRadius: 9,
              paddingHorizontal: 13,
              paddingVertical: 8,
              backgroundColor: colors.warning,
              opacity: busyAction() === "approval" ? 0.6 : 1,
            }}
            hoverStyle={{ backgroundColor: "#facc15" }}
          >
            <Text style={{ color: "#171106", fontSize: 13, fontWeight: "800" }}>Approve</Text>
          </Button>
        </View>
      </View>
    </If>
  );
}

function StatusLine() {
  const run = () => activeRun();
  const text = () => {
    if (connectionState() !== "online") return "Reconnecting to Forge Core…";
    if (socketState() !== "live") return "Event stream is reconnecting…";
    if (run().error) return run().error ?? "";
    if (lastError()) return lastError() ?? "";
    if (run().activity) return run().activity ?? "";
    if (run().currentTool) return `Using ${run().currentTool}`;
    if (activeSessionId()) return "Ready";
    return "Create or select a session";
  };
  const tone = () => run().error || lastError()
    ? colors.danger
    : connectionState() !== "online" || socketState() !== "live"
      ? colors.warning
      : run().activity || run().currentTool
        ? colors.accentBright
        : colors.textDim;
  return (
    <View style={{ minHeight: 22, justifyContent: "center", paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <If when={isWorking(run().status)}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: colors.accentBright,
              animationName: "pulse",
              animationDuration: "1.2s",
              animationIterationCount: "infinite",
            }}
          />
        </If>
        <Text style={{ color: tone(), fontSize: 12, lineHeight: 17, numberOfLines: 1, textOverflow: "ellipsis" }}>
          {text()}
        </Text>
      </View>
    </View>
  );
}

export function Composer() {
  const hasSession = () => activeSessionId() !== undefined;
  const running = () => isWorking(activeRun().status);
  const canSend = () => hasSession()
    && composerText().trim().length > 0
    && !running()
    && busyAction() !== "send"
    && connectionState() === "online";
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.borderSoft,
        backgroundColor: "#0d1017",
        paddingHorizontal: 18,
        paddingTop: 9,
        paddingBottom: 14,
      }}
    >
      <ApprovalCard />
      <View style={{ maxWidth: 920, width: "100%", alignSelf: "center", gap: 7 }}>
        <StatusLine />
        <View
          style={{
            borderRadius: 17,
            borderWidth: 1,
            borderColor: "#303848",
            backgroundColor: "#131824",
            padding: 8,
            gap: 8,
            boxShadow: "0 14px 34px rgba(0, 0, 0, 0.24)",
          }}
        >
          <Input
            multiline
            value={composerText()}
            onChange={(event) => composerText.set(event.value)}
            onSubmit={() => void sendPrompt()}
            submitBehavior="submit"
            readonly={!hasSession()}
            placeholder={hasSession()
              ? `Message ${activeSnapshot()?.title ?? "Forge"}…`
              : "Create a session before messaging Forge…"}
            style={{
              minHeight: 64,
              maxHeight: 150,
              color: colors.text,
              fontSize: 14,
              lineHeight: 20,
              paddingHorizontal: 7,
              placeholderColor: "#626c7d",
              caretColor: colors.accentBright,
              selectionColor: "#4b3c92",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={textStyles.dim}>
              Enter sends · Shift+Enter inserts a newline
            </Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <If when={running()}>
                <Button
                  onPress={() => void cancelActive()}
                  disabled={busyAction() === "cancel"}
                  style={{
                    borderRadius: 9,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: "#51343a",
                    backgroundColor: "#211419",
                  }}
                  hoverStyle={{ backgroundColor: "#2b181f" }}
                >
                  <Text style={{ color: "#fda4af", fontSize: 13, fontWeight: "700" }}>
                    {busyAction() === "cancel" ? "Cancelling…" : "Cancel"}
                  </Text>
                </Button>
              </If>
              <If when={!hasSession()}>
                <Button
                  onPress={() => void createSession()}
                  disabled={busyAction() === "create" || connectionState() !== "online"}
                  style={{
                    borderRadius: 9,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    backgroundColor: colors.accent,
                    opacity: connectionState() === "online" ? 1 : 0.55,
                  }}
                  hoverStyle={{ backgroundColor: "#8d72ff" }}
                >
                  <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "800" }}>New session</Text>
                </Button>
              </If>
              <Button
                onPress={() => void sendPrompt()}
                disabled={!canSend()}
                accessibilityLabel="Send message to Forge"
                style={{
                  borderRadius: 9,
                  paddingHorizontal: 15,
                  paddingVertical: 8,
                  backgroundColor: canSend() ? colors.accent : "#2a3040",
                  opacity: busyAction() === "send" ? 0.7 : 1,
                }}
                hoverStyle={{ backgroundColor: canSend() ? "#8d72ff" : "#2a3040" }}
              >
                <Text style={{ color: canSend() ? "#ffffff" : "#707a8c", fontSize: 13, fontWeight: "800" }}>
                  {busyAction() === "send" ? "Sending…" : "Send"}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
