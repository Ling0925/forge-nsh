import { Scroll, Text, View } from "nsh";
import { compactPath, formatTime, oneLine, statusLabel } from "../format";
import {
  activeSessionId,
  busyAction,
  connectionState,
  createSession,
  openSettings,
  selectSession,
  sessionCount,
  socketState,
  sortedSessions,
  workspace,
} from "../store";
import type { SessionSummary } from "../protocol";
import { textClasses } from "../theme";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Surface } from "../ui/surface";

function sessionTone(status: SessionSummary["status"]): BadgeTone {
  if (status === "running") return "info";
  if (status === "awaiting_approval") return "warning";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "danger";
  if (status === "completed") return "success";
  return "neutral";
}

const sessionDotClasses: Record<BadgeTone, string> = {
  neutral: "bg-dim-foreground",
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function SessionRow(props: { session: SessionSummary }) {
  const selected = () => activeSessionId() === props.session.id;
  const tone = () => sessionTone(props.session.status);
  return (
    <Button
      variant="nav"
      selected={selected()}
      onPress={() => void selectSession(props.session.id)}
      accessibilityLabel={`Open session ${props.session.title}`}
    >
      <View class="min-w-0 flex-1 flex-row items-start gap-2">
        <View class={`mt-1.5 size-2 rounded-full ${sessionDotClasses[tone()]}`} />
        <View class="min-w-0 flex-1 gap-1">
          <Text
            class={`text-sm leading-5 ${selected() ? "font-semibold text-foreground" : "font-medium text-secondary-foreground"}`}
            style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
          >
            {props.session.title || "Untitled session"}
          </Text>
          <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {statusLabel(props.session.status)} · {formatTime(props.session.updatedAt)}
          </Text>
        </View>
      </View>
    </Button>
  );
}

function connectionBadgeTone(): BadgeTone {
  if (connectionState() !== "online") return "danger";
  return socketState() === "live" ? "success" : "warning";
}

function connectionBadgeLabel(): string {
  if (connectionState() !== "online") return "Core disconnected";
  return socketState() === "live" ? "Core connected" : "Events connecting";
}

export function Sidebar() {
  return (
    <View
      class="h-full border-r border-sidebar-border bg-sidebar pb-3 pt-4"
      style={{ width: 280 }}
      role="navigation"
      accessibilityLabel="Forge sessions and workspace"
    >
      <View class="gap-4 px-4">
        <View class="flex-row items-center gap-3">
          <View class="size-9 items-center justify-center rounded-(--radius-lg) border border-primary-border bg-primary-soft">
            <Text class="text-base font-bold leading-5 text-primary">F</Text>
          </View>
          <View class="gap-0.5">
            <Text class="text-base font-bold leading-5 tracking-tight text-sidebar-foreground">
              Forge NSH
            </Text>
            <Text class={textClasses.dim}>native shell workbench</Text>
          </View>
        </View>

        <Surface variant="soft" class="gap-1 px-3 py-2.5">
          <Text class={textClasses.eyebrow}>Workspace</Text>
          <Text class={textClasses.small} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {compactPath(workspace() || "connecting…")}
          </Text>
        </Surface>

        <Button
          variant="soft"
          size="md"
          class="w-full"
          label={busyAction() === "create" ? "Creating…" : "+ New session"}
          busy={busyAction() === "create"}
          onPress={() => void createSession()}
          disabled={busyAction() === "create" || connectionState() !== "online"}
          accessibilityLabel="Create a new Forge session"
        />
      </View>

      <View class="px-4 pb-2 pt-4">
        <View class="flex-row items-center justify-between">
          <Text class={textClasses.eyebrow}>Sessions</Text>
          <Text class={textClasses.dim}>{sessionCount()}</Text>
        </View>
      </View>

      <Scroll class="min-h-0 flex-1" contentClass="gap-1">
        <View class="gap-1 px-2.5">
          <If
            when={sortedSessions().length > 0}
            else={(
              <View class="gap-1.5 px-2 py-4">
                <Text class="text-sm font-semibold leading-5 text-muted-foreground">
                  No sessions yet
                </Text>
                <Text class={textClasses.dim}>Create one to start a Forge run in this workspace.</Text>
              </View>
            )}
          >
            <Each of={sortedSessions()} key={(session) => session.id}>
              {(session) => <SessionRow session={session()} />}
            </Each>
          </If>
        </View>
      </Scroll>

      <View class="mx-3 mt-2 gap-2 border-t border-sidebar-border px-1 pt-3">
        <Button
          variant="outline"
          size="sm"
          class="w-full"
          label="⚙ Settings"
          onPress={openSettings}
          accessibilityLabel="Open Forge settings"
        />
        <Badge dot tone={connectionBadgeTone()} label={connectionBadgeLabel()} />
        <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
          {oneLine(workspace() || "waiting for /api/connect", 42)}
        </Text>
      </View>
    </View>
  );
}
