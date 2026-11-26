import { Text, View } from "nsh";
import { Input } from "nsh/base";
import { clampText, oneLine } from "../format";
import {
  activeRun,
  activeSessionId,
  activeSnapshot,
  activeWorking,
  answerApproval,
  cancelActive,
  composerText,
  connectionState,
  createSession,
  isBusy,
  isWorkingStatus,
  lastError,
  sendPrompt,
  socketState,
} from "../store";
import { elevatedShadow, textClasses } from "../theme";
import { Button } from "../ui/button";
import { Surface } from "../ui/surface";

function ApprovalCard() {
  const approval = () => activeRun().pendingApproval;
  return (
    <If when={approval() !== undefined}>
      <View class="mx-4 mb-2">
        <Surface variant="warning" class="gap-3 p-3">
          <View class="flex-row items-center gap-2.5">
            <View class="size-6 items-center justify-center rounded-(--radius) bg-warning">
              <Text class="text-xs font-black leading-4 text-primary-foreground">!</Text>
            </View>
            <View class="min-w-0 flex-1 gap-0.5">
              <Text class="text-sm font-semibold leading-5 text-foreground">
                Approval required · {approval()?.toolName ?? "tool"}
              </Text>
              <Text class={textClasses.dim}>Forge is paused until you decide.</Text>
            </View>
          </View>
          <Text class="text-xs leading-4 text-warning-foreground">
            {clampText(approval()?.description ?? "", 700)}
          </Text>
          <If when={(approval()?.command?.length ?? 0) > 0}>
            <Surface variant="code" class="px-2.5 py-2">
              <Text class="font-mono text-xs leading-4 text-code-foreground">
                {oneLine(approval()?.command?.join(" ") ?? "", 240)}
              </Text>
            </Surface>
          </If>
          <View class="flex-row justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              label="Deny"
              onPress={() => void answerApproval(false)}
              disabled={isBusy("approval")}
            />
            <Button
              variant="primary"
              size="sm"
              label="Approve"
              busy={isBusy("approval")}
              onPress={() => void answerApproval(true)}
              disabled={isBusy("approval")}
            />
          </View>
        </Surface>
      </View>
    </If>
  );
}

type StatusTone = "neutral" | "info" | "warning" | "danger";

const statusTextClasses: Record<StatusTone, string> = {
  neutral: "text-dim-foreground",
  info: "text-info-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

const statusDotClasses: Record<StatusTone, string> = {
  neutral: "bg-dim-foreground",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
};

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
  const tone = (): StatusTone => run().error || lastError()
    ? "danger"
    : connectionState() !== "online" || socketState() !== "live"
      ? "warning"
      : run().activity || run().currentTool
        ? "info"
        : "neutral";
  return (
    <View class="min-h-6 justify-center px-1">
      <View class="flex-row items-center gap-2">
        <View
          class={`size-2 rounded-full ${statusDotClasses[tone()]} ${isWorkingStatus(run().status) ? "animate-pulse motion-reduce:animate-none" : ""}`}
        />
        <Text
          class={`text-xs leading-4 ${statusTextClasses[tone()]}`}
          style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
        >
          {text()}
        </Text>
      </View>
    </View>
  );
}

export function Composer() {
  const hasSession = () => activeSessionId() !== undefined;
  const running = () => activeWorking();
  const canSend = () => hasSession()
    && composerText().trim().length > 0
    && !running()
    && !isBusy("send")
    && connectionState() === "online";
  return (
    <View class="border-t border-border-subtle bg-surface-soft px-4 pb-3 pt-2">
      <ApprovalCard />
      <View class="w-full max-w-[920px] gap-2 self-center">
        <StatusLine />
        <Surface
          variant="overlay"
          class="gap-2 p-2"
          style={{ boxShadow: elevatedShadow() }}
        >
          <Input
            multiline
            value={composerText()}
            onChange={(event) => composerText.set(event.value)}
            onSubmit={() => { if (canSend()) void sendPrompt(); }}
            submitBehavior="submit"
            readonly={!hasSession()}
            accessibilityLabel={hasSession() ? `Message ${activeSnapshot()?.title ?? "Forge"}` : "Message Forge"}
            placeholder={hasSession()
              ? `Message ${activeSnapshot()?.title ?? "Forge"}…`
              : "Create a session before messaging Forge…"}
            class="rounded-(--radius-sm) px-1.5 text-sm leading-5 text-foreground caret-primary placeholder:text-dim-foreground selection:bg-selection focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            classList={{
              "bg-transparent": hasSession(),
              "bg-surface-inset": !hasSession(),
            }}
            style={{ minHeight: 64, maxHeight: 144 }}
          />
          <View class="flex-row flex-wrap items-center justify-between gap-2">
            <Text class={textClasses.dim}>
              Enter sends · Shift+Enter inserts a newline
            </Text>
            <View class="flex-row flex-wrap items-center justify-end gap-2">
              <If when={running()}>
                <Button
                  variant="danger"
                  size="sm"
                  label={isBusy("cancel") ? "Cancelling…" : "Cancel"}
                  busy={isBusy("cancel")}
                  onPress={() => void cancelActive()}
                  disabled={isBusy("cancel")}
                />
              </If>
              <If when={!hasSession()}>
                <Button
                  variant="soft"
                  size="sm"
                  label={isBusy("create") ? "Creating…" : "New session"}
                  busy={isBusy("create")}
                  onPress={() => void createSession()}
                  disabled={isBusy("create") || connectionState() !== "online"}
                />
              </If>
              <Button
                variant="primary"
                size="sm"
                label={isBusy("send") ? "Sending…" : "Send"}
                busy={isBusy("send")}
                onPress={() => void sendPrompt()}
                disabled={!canSend()}
                accessibilityLabel="Send message to Forge"
              />
            </View>
          </View>
        </Surface>
      </View>
    </View>
  );
}
