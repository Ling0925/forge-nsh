import { effect, Scroll, Text, View } from "nsh";
import type { ScrollRef } from "nsh";
import { TextView } from "nsh/base";
import { oneLine } from "../format";
import { activeSessionId, activeSnapshot, createSession, transcriptRows } from "../store";
import type { TranscriptRow } from "../store";
import { markdownClasses, textClasses } from "../theme";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Surface } from "../ui/surface";

function StreamingCaret() {
  return <Text class="text-sm font-bold leading-5 text-info">▍</Text>;
}

function Markdown(props: { text: string; streaming?: boolean }) {
  return (
    <TextView
      markdown={props.text}
      options={{ streaming: props.streaming === true }}
      selectable
      classes={markdownClasses}
      streamingCaret={props.streaming ? <StreamingCaret /> : undefined}
      codeBlockActions={[{ id: "copy" }]}
    />
  );
}

function UserRow(props: { row: TranscriptRow }) {
  return (
    <View class="items-end px-7">
      <View class="max-w-[76%] gap-1 rounded-(--radius-xl) border border-border-subtle bg-secondary px-3.5 py-2.5">
        <Text class="text-sm leading-5 text-secondary-foreground">{props.row.text}</Text>
        <If when={props.row.detail !== undefined}>
          <Text class={textClasses.dim}>{props.row.detail}</Text>
        </If>
      </View>
    </View>
  );
}

function AssistantRow(props: { row: TranscriptRow }) {
  return (
    <View class="flex-row items-start gap-3 px-7">
      <View
        class={`mt-0.5 size-7 items-center justify-center rounded-(--radius) border ${
          props.row.live
            ? "border-info-border bg-info-soft"
            : "border-primary-border bg-primary-soft"
        }`}
      >
        <Text class={`text-xs font-bold leading-4 ${props.row.live ? "text-info-foreground" : "text-primary"}`}>F</Text>
      </View>
      <View class="min-w-0 flex-1 pt-0.5">
        <Markdown text={props.row.text} streaming={props.row.live} />
      </View>
    </View>
  );
}

function ReasoningRow(props: { row: TranscriptRow }) {
  return (
    <View class="px-7">
      <Surface variant="inset" class="ms-10 gap-1 px-3 py-2.5 opacity-90">
        <Text class={textClasses.eyebrow}>{props.row.live ? "Reasoning live" : "Reasoning"}</Text>
        <Text class="text-xs leading-4 text-muted-foreground">{props.row.text}</Text>
      </Surface>
    </View>
  );
}

function ToolRow(props: { row: TranscriptRow }) {
  return (
    <View class="px-7">
      <Surface variant="code" class="ms-10 gap-1.5 px-3 py-2.5">
        <View class="flex-row items-center gap-2">
          <View class="size-1.5 rounded-full bg-info" />
          <Text class="text-xs font-bold uppercase leading-4 tracking-wide text-info-foreground">
            {props.row.detail ?? "TOOL"}
          </Text>
        </View>
        <Text class="font-mono text-xs leading-4 text-code-foreground">
          {oneLine(props.row.text, 900)}
        </Text>
      </Surface>
    </View>
  );
}

function MessageRow(props: { row: TranscriptRow }) {
  if (props.row.kind === "user") return <UserRow row={props.row} />;
  if (props.row.kind === "tool") return <ToolRow row={props.row} />;
  if (props.row.kind === "reasoning") return <ReasoningRow row={props.row} />;
  return <AssistantRow row={props.row} />;
}

function EmptyTranscript() {
  const hasSession = () => activeSessionId() !== undefined;
  return (
    <View class="flex-1 items-center justify-center p-8">
      <View class="max-w-[560px] items-center gap-5">
        <View class="size-14 items-center justify-center rounded-(--radius-xl) border border-primary-border bg-primary-soft">
          <Text class="text-xl font-bold leading-7 text-primary">F</Text>
        </View>
        <View class="items-center gap-2">
          <Text class={textClasses.heading} style={{ textAlign: "center" }}>
            {hasSession() ? "Start the first run" : "A Forge workbench in NSH"}
          </Text>
          <Text class={`${textClasses.small} text-center leading-5`}>
            {hasSession()
              ? "Ask Forge to inspect, explain or change the workspace. Responses stream here as Markdown; tool activity is summarized."
              : "Create a session to connect this native-shell interface with the embedded Forge Core runtime."}
          </Text>
        </View>
        <If when={!hasSession()}>
          <Button
            variant="primary"
            size="md"
            label="Create session"
            onPress={() => void createSession()}
          />
        </If>
        <If when={hasSession()}>
          <View class="flex-row flex-wrap justify-center gap-2">
            <Badge tone="neutral" label="Markdown transcript" />
            <Badge tone="neutral" label="Cursor acknowledgements" />
            <Badge tone="neutral" label="Approval flow" />
          </View>
        </If>
      </View>
    </View>
  );
}

export function Transcript() {
  let scrollRef: ScrollRef | undefined;
  effect(() => {
    transcriptRows();
    const frame = requestAnimationFrame(() => scrollRef?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  });
  return (
    <Scroll
      ref={(ref) => { scrollRef = ref; }}
      class="min-h-0 flex-1"
      contentClass="gap-4 py-5"
      contentStyle={{ flexGrow: 1 }}
    >
      <If when={transcriptRows().length > 0} else={<EmptyTranscript />}>
        <View class="gap-4">
          <If when={activeSnapshot()?.messages.some((message) => message.role !== "system") === true}>
            <View class="items-center pb-1">
              <Text class={textClasses.dim}>
                {activeSnapshot()?.title ?? "Session"} · live transcript
              </Text>
            </View>
          </If>
          <Each of={transcriptRows()} key={(row) => row.id}>
            {(row) => <MessageRow row={row()} />}
          </Each>
        </View>
      </If>
    </Scroll>
  );
}
