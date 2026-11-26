import { effect, Scroll, Text, View } from "nsh";
import type { ScrollRef } from "nsh";
import { Button, TextView } from "nsh/base";
import { oneLine } from "../format";
import { activeSessionId, activeSnapshot, createSession, transcriptRows } from "../store";
import type { TranscriptRow } from "../store";
import { colors, markdownClasses, textStyles } from "../theme";

function StreamingCaret() {
  return <Text style={{ color: colors.accentBright, fontSize: 15, fontWeight: "800" }}>▍</Text>;
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
    <View style={{ alignItems: "flex-end", paddingHorizontal: 28 }}>
      <View
        style={{
          maxWidth: "76%",
          borderRadius: 16,
          borderBottomRightRadius: 5,
          backgroundColor: colors.userBubble,
          borderWidth: 1,
          borderColor: "#2b3447",
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 4,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21 }}>{props.row.text}</Text>
        <If when={props.row.detail !== undefined}>
          <Text style={textStyles.dim}>{props.row.detail}</Text>
        </If>
      </View>
    </View>
  );
}

function AssistantRow(props: { row: TranscriptRow }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 28, gap: 12, alignItems: "flex-start" }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: props.row.live ? colors.accent : "#283041",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "800" }}>F</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <Markdown text={props.row.text} streaming={props.row.live} />
      </View>
    </View>
  );
}

function ReasoningRow(props: { row: TranscriptRow }) {
  return (
    <View style={{ paddingHorizontal: 68 }}>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#262e3e",
          backgroundColor: "#0e121a",
          paddingHorizontal: 12,
          paddingVertical: 9,
          gap: 4,
          opacity: 0.86,
        }}
      >
        <Text style={textStyles.eyebrow}>{props.row.live ? "Reasoning live" : "Reasoning"}</Text>
        <Text style={{ color: "#8f99ab", fontSize: 12, lineHeight: 17 }}>{props.row.text}</Text>
      </View>
    </View>
  );
}

function ToolRow(props: { row: TranscriptRow }) {
  return (
    <View style={{ paddingHorizontal: 68 }}>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#293242",
          backgroundColor: colors.code,
          paddingHorizontal: 12,
          paddingVertical: 9,
          gap: 5,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentBright }} />
          <Text style={{ color: "#aeb7c7", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
            {props.row.detail ?? "TOOL"}
          </Text>
        </View>
        <Text style={{ color: "#c5ccd9", fontSize: 12, lineHeight: 17, fontFamily: "monospace" }}>
          {oneLine(props.row.text, 900)}
        </Text>
      </View>
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
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 34 }}>
      <View style={{ maxWidth: 560, alignItems: "center", gap: 18 }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 17,
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: "#453781",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.accentBright, fontSize: 25, fontWeight: "800" }}>F</Text>
        </View>
        <View style={{ alignItems: "center", gap: 7 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "750", letterSpacing: -0.3 }}>
            {hasSession() ? "Start the first run" : "A Forge workbench in NSH"}
          </Text>
          <Text style={{ ...textStyles.small, textAlign: "center", lineHeight: 20 }}>
            {hasSession()
              ? "Ask Forge to inspect, explain or change the workspace. Responses stream here as Markdown; tool activity is summarized."
              : "Create a session to connect this native-shell interface with the embedded Forge Core runtime."}
          </Text>
        </View>
        <If when={!hasSession()}>
          <Button
            onPress={() => void createSession()}
            style={{
              borderRadius: 10,
              backgroundColor: colors.accent,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
            hoverStyle={{ backgroundColor: "#8d72ff" }}
          >
            <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>Create session</Text>
          </Button>
        </If>
        <If when={hasSession()}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Text style={{ ...textStyles.dim, borderRadius: 999, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 10, paddingVertical: 5 }}>
              Markdown transcript
            </Text>
            <Text style={{ ...textStyles.dim, borderRadius: 999, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 10, paddingVertical: 5 }}>
              Cursor acknowledgements
            </Text>
            <Text style={{ ...textStyles.dim, borderRadius: 999, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 10, paddingVertical: 5 }}>
              Approval flow
            </Text>
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
      style={{ flex: 1, minHeight: 0 }}
      contentStyle={{ flexGrow: 1, paddingVertical: 22, gap: 18 }}
    >
      <If when={transcriptRows().length > 0} else={<EmptyTranscript />}>
        <View style={{ gap: 18 }}>
          <If when={activeSnapshot()?.messages.some((message) => message.role !== "system") === true}>
            <View style={{ alignItems: "center", paddingBottom: 2 }}>
              <Text style={textStyles.dim}>
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
