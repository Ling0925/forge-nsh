import { Clipboard, horizontalSizeClass, signal, Text, View } from "nsh";
import { Button as BaseButton, Collapsible, TextView } from "nsh/base";
import { oneLine } from "../../format";
import type { MessageCitation } from "../../protocol";
import { activeRun, activeStatus, showLiveWorking } from "../../store";
import { focusRingClass, intentRevealClass, markdownClasses, motionClasses, textClasses } from "../../theme";
import {
  type AssistantTranscriptItem,
  formatCharCount,
  type ReasoningTranscriptItem,
  type UserTranscriptItem,
} from "../../transcript";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import { Surface } from "../../ui/surface";

function StreamingCaret() {
  return <Text class="text-[16px] font-bold leading-6 text-primary">▍</Text>;
}

function citationLabel(citation: MessageCitation): string {
  if (citation.title?.trim()) return oneLine(citation.title, 36);
  try {
    return new URL(citation.url).hostname;
  } catch {
    return oneLine(citation.url, 36);
  }
}

export function CopyButton(props: { text: string; accessibilityLabel?: string }) {
  const copied = signal(false);
  let timer: number | undefined;
  const copy = () => {
    void Clipboard.writeText(props.text)
      .then((result) => {
        if (result === "failed") return;
        copied.set(true);
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          copied.set(false);
        }, 1800);
      })
      .catch(() => undefined);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      class="min-h-8 px-2 py-1"
      onPress={copy}
      accessibilityLabel={props.accessibilityLabel ?? "Copy text"}
    >
      <Icon name={copied() ? "check" : "copy"} tone={copied() ? "accent" : "muted"} />
    </Button>
  );
}

export function UserMessageRow(props: { item: UserTranscriptItem }) {
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <View class="group items-end gap-2">
      <View class="max-w-[82%] gap-3 rounded-(--radius-lg) bg-surface-soft px-6 py-4">
        <View selectable>
          <Text class="text-[16px] leading-6 text-foreground selection:bg-selection">
            {props.item.text}
          </Text>
        </View>
        <If when={props.item.attachments !== undefined && props.item.attachments > 0}>
          <Badge tone="neutral" label={`${props.item.attachments} attachment(s)`} />
        </If>
      </View>
      <View class={`min-h-8 flex-row items-center justify-end ${isRegular() ? intentRevealClass : ""}`}>
        <CopyButton text={props.item.text} accessibilityLabel="Copy prompt" />
      </View>
    </View>
  );
}

export function AssistantMessageRow(props: { item: AssistantTranscriptItem }) {
  const isLive = () => props.item.live === true;
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <View class="group gap-3">
      <View class="min-h-8 flex-row items-center justify-between gap-3">
        <View class="min-w-0 flex-row items-center gap-3">
          <Text class="text-[14px] font-semibold leading-5 text-foreground">Forge</Text>
          <If when={props.item.model !== undefined && props.item.model.length > 0}>
            <Text class="font-mono text-[14px] leading-5 text-muted-foreground" style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
              {props.item.model}
            </Text>
          </If>
          <If when={isLive()}>
            <Badge dot tone="primary" label="Streaming" />
          </If>
        </View>
        <View class={`min-h-8 ${isRegular() ? intentRevealClass : ""}`}>
          <If when={!isLive()}>
            <CopyButton text={props.item.text} accessibilityLabel="Copy assistant response" />
          </If>
        </View>
      </View>

      <TextView
        markdown={props.item.text}
        options={{ streaming: isLive() }}
        selectable
        classes={markdownClasses}
        streamingCaret={isLive() ? <StreamingCaret /> : undefined}
        codeBlockActions={[{ id: "copy" }]}
      />

      <If when={(props.item.citations?.length ?? 0) > 0}>
        <View class="flex-row flex-wrap gap-2 pt-2">
          <Each of={props.item.citations ?? []} key={(citation) => citation.url}>
            {(citation) => (
              <View class="flex-row items-center gap-1 rounded-(--radius) bg-surface-soft px-3 py-1">
                <Icon name="arrow-up-right" tone="accent" />
                <Text class="text-[14px] leading-5 text-foreground" style={{ numberOfLines: 1 }}>
                  {citationLabel(citation())}
                </Text>
              </View>
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

export function ReasoningDisclosure(props: { item: ReasoningTranscriptItem }) {
  const open = signal(props.item.live === true);
  const isLive = () => props.item.live === true;
  return (
    <Surface variant="soft" class="overflow-hidden">
      <Collapsible
        open={open()}
        reveal
        content={(
          <View selectable class="px-4 pb-4 pt-1">
            <Text class="text-[14px] leading-6 text-muted-foreground selection:bg-selection">
              {props.item.text}
            </Text>
          </View>
        )}
      >
        <BaseButton
          selected={open()}
          onPress={() => open.update((value) => !value)}
          accessibilityLabel={isLive() ? "Toggle live thinking" : "Toggle thought process"}
          class={`w-full flex-row items-center justify-between gap-3 rounded-(--radius-lg) px-4 py-3 hover:bg-surface-hover ${motionClasses.color} ${focusRingClass}`}
        >
          <View class="min-w-0 flex-1 flex-row items-center gap-3">
            <If
              when={isLive()}
              else={<Icon name="sparkles" tone="muted" />}
            >
              <View class="size-6 items-center justify-center">
                <View class="size-2 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
              </View>
            </If>
            <Text class="text-[14px] font-medium leading-5 text-foreground">
              {isLive() ? "Thinking…" : "Thought process"}
            </Text>
            <Text class={textClasses.secondary}>{formatCharCount(props.item.charCount)}</Text>
          </View>
          <Icon name={open() ? "chevron-down" : "chevron-right"} tone="muted" />
        </BaseButton>
      </Collapsible>
    </Surface>
  );
}

export function LiveWorkingRow() {
  const run = () => activeRun();
  const isApproval = () => activeStatus() === "awaiting_approval";
  const previewBadge = () => {
    const stats = run().toolPreviewStats;
    if (!stats) return undefined;
    if (stats.linesAdded !== undefined || stats.linesRemoved !== undefined) {
      return `+${stats.linesAdded ?? 0} -${stats.linesRemoved ?? 0}`;
    }
    if (stats.argsChars !== undefined && stats.argsChars > 0) {
      return `${stats.argsChars} chars`;
    }
    return undefined;
  };
  return (
    <If when={showLiveWorking()}>
      <Surface variant="soft" class="w-fit flex-row items-center gap-3 px-4 py-3">
        <View
          class={`size-2 rounded-full bg-primary ${isApproval() ? "" : "animate-pulse motion-reduce:animate-none"}`}
        />
        <Text class="text-[14px] font-medium leading-5 text-foreground">
          {run().activity ?? (isApproval() ? "Approval required" : "Thinking…")}
        </Text>
        <If when={previewBadge() !== undefined}>
          <Text class="font-mono text-[14px] leading-5 text-muted-foreground">
            {previewBadge()}
          </Text>
        </If>
      </Surface>
    </If>
  );
}
