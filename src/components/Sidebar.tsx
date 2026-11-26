import { Scroll, Text, View } from "nsh";
import { formatTime, statusLabel } from "../format";
import type { SessionSummary } from "../protocol";
import {
  activeSessionId,
  connectionState,
  createSession,
  isBusy,
  openSettings,
  selectSession,
  sessionCount,
  sidebarOpen,
  socketState,
  sortedSessions,
} from "../store";
import { textClasses } from "../theme";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

function sessionDotClass(status: SessionSummary["status"]): string {
  if (status === "running" || status === "awaiting_approval") return "bg-primary";
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "bg-danger";
  return "bg-muted-foreground";
}

function SessionRow(props: { session: SessionSummary }) {
  const selected = () => activeSessionId() === props.session.id;
  return (
    <Button
      variant="nav"
      selected={selected()}
      onPress={() => void selectSession(props.session.id)}
      accessibilityLabel={`Open session ${props.session.title}`}
    >
      <View class="min-w-0 flex-1 flex-row items-center gap-3">
        <View class={`size-2 shrink-0 rounded-full ${sessionDotClass(props.session.status)}`} />
        <View class="min-w-0 flex-1 gap-1">
          <Text
            class={`text-[14px] leading-5 ${selected() ? "font-semibold text-foreground" : "font-normal text-foreground"}`}
            style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
          >
            {props.session.title || "Untitled session"}
          </Text>
          <Text class={textClasses.secondary} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {statusLabel(props.session.status)} · {formatTime(props.session.updatedAt)}
          </Text>
        </View>
      </View>
    </Button>
  );
}

function connectionDotClass(): string {
  if (connectionState() !== "online") return "bg-danger";
  return socketState() === "live" ? "bg-foreground" : "bg-muted-foreground";
}

function connectionLabel(): string {
  if (connectionState() !== "online") return "Disconnected";
  return socketState() === "live" ? "Connected" : "Reconnecting";
}

export function Sidebar(props: { compact?: boolean }) {
  return (
    <View
      class="h-full bg-sidebar py-6"
      style={{ width: 280 }}
      role="navigation"
      accessibilityLabel="Forge sessions"
    >
      <View class="gap-6 px-6">
        <View class="flex-row items-center justify-between gap-3">
          <Text class={textClasses.title}>Forge NSH</Text>
          <If when={props.compact === true}>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => sidebarOpen.set(false)}
              accessibilityLabel="Close sessions sidebar"
            >
              <Icon name="close" tone="muted" />
            </Button>
          </If>
        </View>

        <Button
          variant="primary"
          size="md"
          icon="plus"
          class="w-full"
          label={isBusy("create") ? "Creating…" : "New session"}
          busy={isBusy("create")}
          onPress={() => void createSession()}
          disabled={isBusy("create") || connectionState() !== "online"}
          accessibilityLabel="Create a new Forge session"
        />
      </View>

      <View class="flex-row items-center justify-between px-6 pb-3 pt-8">
        <Text class="text-[14px] font-semibold leading-5 text-foreground">Sessions</Text>
        <Text class={textClasses.secondary}>{sessionCount()}</Text>
      </View>

      <Scroll class="min-h-0 flex-1" contentClass="gap-1">
        <View class="gap-1 px-4">
          <If
            when={sortedSessions().length > 0}
            else={(
              <View class="px-2 py-6">
                <Text class={textClasses.secondary}>No sessions</Text>
              </View>
            )}
          >
            <Each of={sortedSessions()} key={(session) => session.id}>
              {(session) => <SessionRow session={session()} />}
            </Each>
          </If>
        </View>
      </Scroll>

      <View class="gap-4 px-6 pt-6">
        <Button
          variant="outline"
          size="sm"
          icon="settings"
          class="w-full justify-start"
          label="Settings"
          onPress={() => openSettings()}
          accessibilityLabel="Open Forge settings"
        />
        <View class="flex-row items-center gap-2 px-1">
          <View class={`size-2 rounded-full ${connectionDotClass()}`} />
          <Text class={textClasses.secondary}>{connectionLabel()}</Text>
        </View>
      </View>
    </View>
  );
}
