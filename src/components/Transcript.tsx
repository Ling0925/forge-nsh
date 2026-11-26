import { effect, Scroll, signal, Text, View } from "nsh";
import type { ScrollEvent, ScrollRef } from "nsh";
import {
  activeRun,
  activeSessionId,
  activeSnapshot,
  activeWorking,
  composerText,
  connectionState,
  createSession,
  hasTranscriptContent,
  historyItems,
  isBusy,
  liveAssistantItem,
  liveReasoningItem,
  scrollToBottomTick,
  showLiveWorking,
  type TranscriptItem,
} from "../store";
import { elevatedShadow, textClasses } from "../theme";
import { Button } from "../ui/button";
import {
  AssistantMessageRow,
  LiveWorkingRow,
  ReasoningDisclosure,
  UserMessageRow,
} from "./transcript/MessageRows";
import { ToolGroupRow } from "./transcript/ToolActivity";

const STARTER_PROMPTS = [
  "Explore this repository",
  "Review recent git changes",
  "Explain the architecture",
  "Check for potential bugs",
] as const;

function TranscriptItemRow(props: { item: TranscriptItem }) {
  if (props.item.kind === "user") return <UserMessageRow item={props.item} />;
  if (props.item.kind === "reasoning") return <ReasoningDisclosure item={props.item} />;
  if (props.item.kind === "tool_group") return <ToolGroupRow item={props.item} />;
  return <AssistantMessageRow item={props.item} />;
}

function EmptyTranscript() {
  const hasSession = () => activeSessionId() !== undefined;
  return (
    <View class="flex-1 items-center justify-center p-12">
      <View class="w-full max-w-[560px] items-center gap-8">
        <Text class={textClasses.heading} style={{ textAlign: "center" }}>
          {hasSession() ? (activeSnapshot()?.title ?? "New session") : "Forge NSH"}
        </Text>
        <If when={!hasSession()}>
          <Button
            variant="primary"
            size="md"
            icon="plus"
            label={isBusy("create") ? "Creating…" : "Create session"}
            busy={isBusy("create")}
            disabled={isBusy("create") || connectionState() !== "online"}
            onPress={() => void createSession()}
          />
        </If>
        <If when={hasSession()}>
          <View class="flex-row flex-wrap justify-center gap-3">
            {STARTER_PROMPTS.map((prompt) => (
              <Button
                variant="secondary"
                size="md"
                label={prompt}
                onPress={() => composerText.set(prompt)}
                accessibilityLabel={`Use prompt: ${prompt}`}
              />
            ))}
          </View>
        </If>
      </View>
    </View>
  );
}

export function Transcript() {
  let scrollRef: ScrollRef | undefined;
  const pinnedToBottom = signal(true);
  const scrollToBottom = (animated: boolean) => {
    pinnedToBottom.set(true);
    scrollRef?.scrollToEnd({ animated });
  };
  effect(() => {
    scrollToBottomTick();
    activeSessionId();
    pinnedToBottom.set(true);
    const frame = requestAnimationFrame(() => scrollRef?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  });
  effect(() => {
    historyItems();
    liveReasoningItem();
    liveAssistantItem();
    showLiveWorking();
    activeRun().activity;
    if (!pinnedToBottom()) return;
    const frame = requestAnimationFrame(() => scrollRef?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  });
  return (
    <View class="relative min-h-0 flex-1 bg-background">
      <Scroll
        ref={(ref) => { scrollRef = ref; }}
        class="min-h-0 flex-1"
        contentClass="py-8"
        contentStyle={{ flexGrow: 1 }}
        scrollEventThrottle={60}
        onScroll={(event: ScrollEvent) => {
          const distance = event.contentSize.height - (event.offset.y + event.size.height);
          pinnedToBottom.set(distance <= 48);
        }}
      >
        <If when={hasTranscriptContent()} else={<EmptyTranscript />}>
          <View class="mx-auto w-full max-w-[840px] gap-8 px-8">
            <Each of={historyItems()} key={(item) => item.id}>
              {(item) => <TranscriptItemRow item={item()} />}
            </Each>
            <If when={liveReasoningItem()}>
              {(item) => <ReasoningDisclosure item={item()} />}
            </If>
            <If when={liveAssistantItem()}>
              {(item) => <AssistantMessageRow item={item()} />}
            </If>
            <LiveWorkingRow />
          </View>
        </If>
      </Scroll>
      <If when={!pinnedToBottom() && hasTranscriptContent()}>
        <View class="absolute bottom-4 right-8">
          <Button
            variant="outline"
            size="sm"
            icon="arrow-down"
            class="rounded-(--radius-lg) bg-surface-overlay px-4"
            label={activeWorking() ? "New output" : "Jump to bottom"}
            style={{ boxShadow: elevatedShadow() }}
            onPress={() => scrollToBottom(true)}
            accessibilityLabel="Jump to latest messages"
          />
        </View>
      </If>
    </View>
  );
}
