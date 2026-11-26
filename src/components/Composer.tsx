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
  isBusy,
  isWorkingStatus,
  lastError,
  sendPrompt,
  socketState,
} from "../store";
import { elevatedShadow } from "../theme";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Surface } from "../ui/surface";

function ApprovalCard() {
  const approval = () => activeRun().pendingApproval;
  return (
    <If when={approval() !== undefined}>
      <View class="mx-auto mb-4 w-full max-w-[840px]">
        <Surface variant="soft" class="gap-4 p-6">
          <View class="flex-row items-center gap-3">
            <Icon name="alert" tone="accent" />
            <Text class="flex-1 text-[16px] font-semibold leading-6 text-foreground">
              {approval()?.toolName ?? "Tool"}
            </Text>
          </View>
          <Text class="text-[14px] leading-5 text-muted-foreground">
            {clampText(approval()?.description ?? "", 700)}
          </Text>
          <If when={(approval()?.command?.length ?? 0) > 0}>
            <Text class="font-mono text-[14px] leading-5 text-foreground">
              {oneLine(approval()?.command?.join(" ") ?? "", 240)}
            </Text>
          </If>
          <View class="flex-row justify-end gap-3">
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

type StatusTone = "neutral" | "accent" | "danger";

const statusTextClasses: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  accent: "text-foreground",
  danger: "text-danger-foreground",
};

const statusDotClasses: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  accent: "bg-primary",
  danger: "bg-danger",
};

function StatusLine() {
  const run = () => activeRun();
  const text = () => {
    if (connectionState() !== "online") return "Reconnecting…";
    if (socketState() !== "live") return "Connecting events…";
    if (run().error) return run().error ?? "";
    if (lastError()) return lastError() ?? "";
    if (run().activity) return run().activity ?? "";
    if (run().currentTool) return run().currentTool ?? "";
    return "";
  };
  const tone = (): StatusTone => run().error || lastError()
    ? "danger"
    : connectionState() !== "online" || socketState() !== "live"
      ? "neutral"
      : run().activity || run().currentTool
        ? "accent"
        : "neutral";
  return (
    <If when={text().length > 0}>
      <View class="min-h-6 flex-row items-center gap-2 px-2">
        <View
          class={`size-2 rounded-full ${statusDotClasses[tone()]} ${isWorkingStatus(run().status) ? "animate-pulse motion-reduce:animate-none" : ""}`}
        />
        <Text
          class={`text-[14px] leading-5 ${statusTextClasses[tone()]}`}
          style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
        >
          {text()}
        </Text>
      </View>
    </If>
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
    <View class="bg-background px-8 pb-6 pt-3">
      <ApprovalCard />
      <View class="mx-auto w-full max-w-[840px] gap-3">
        <StatusLine />
        <Surface
          variant="overlay"
          class="gap-3 p-4"
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
              : "Create a session…"}
            class="rounded-(--radius) px-2 py-1 text-[16px] leading-6 text-foreground caret-primary placeholder:text-dim-foreground selection:bg-selection focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            classList={{
              "bg-transparent": hasSession(),
              "bg-surface-soft": !hasSession(),
            }}
            style={{ minHeight: 64, maxHeight: 160 }}
          />
          <View class="flex-row items-center justify-end gap-3">
            <If when={running()}>
              <Button
                variant="danger"
                size="sm"
                icon="stop"
                label={isBusy("cancel") ? "Cancelling…" : "Cancel"}
                busy={isBusy("cancel")}
                onPress={() => void cancelActive()}
                disabled={isBusy("cancel")}
              />
            </If>
            <Button
              variant="primary"
              size="md"
              icon="send"
              label={isBusy("send") ? "Sending…" : "Send"}
              busy={isBusy("send")}
              onPress={() => void sendPrompt()}
              disabled={!canSend()}
              accessibilityLabel="Send message"
            />
          </View>
        </Surface>
      </View>
    </View>
  );
}
