import { List, Scroll, Text, View, windowSize } from "nsh";
import { Input } from "nsh/base";
import { Head } from "nsh/web";
import type {
  ApprovalRequest,
  Message,
  SessionSummary,
  WorkspaceEntry,
} from "./protocol";
import { formatBytes, formatTime, shortId } from "./protocol";
import {
  type ActivityItem,
  activeRunForSelected,
  activities,
  actionError,
  answerApproval,
  bootstrapWorkbench,
  cancelSelectedRun,
  composer,
  connectionDetail,
  connectionState,
  creatingDraft,
  hostRuns,
  refreshWorkspaceEntries,
  retryConnection,
  selectSession,
  selectedSessionId,
  selectedSummary,
  sendPrompt,
  sending,
  sessions,
  settings,
  snapshot,
  snapshotLoading,
  startDraft,
  streamingReasoning,
  streamingText,
  visibleMessages,
  workspace,
  workspaceEntries,
  workspaceListingTruncated,
} from "./store";
import { Badge, Button, Divider, EmptyState, IconButton, KeyValue, SectionTitle } from "./components";
import { colors, connectionLabel, font, statusColor, statusLabel, text } from "./theme";

function Brand() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accentSoft,
          borderColor: colors.accentBorder,
          borderWidth: 1,
        }}
      >
        <Text style={{ color: colors.accentStrong, fontSize: 16, fontWeight: "800", lineHeight: 20 }}>F</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text({ color: colors.textStrong, fontSize: 14, fontWeight: "700", lineHeight: 18 })}>Forge NSH</Text>
        <Text style={text({ color: colors.faint, fontSize: 10.5, lineHeight: 14 })}>T3Code inspired workbench</Text>
      </View>
      <Badge
        label={connectionLabel(connectionState())}
        tone={connectionState() === "connected" ? "success" : connectionState() === "failed" ? "danger" : "warning"}
      />
    </View>
  );
}

function SessionRow(props: { session: () => SessionSummary }) {
  const session = props.session;
  const active = () => selectedSessionId() === session().id;
  return (
    <View
      role="button"
      onPress={() => selectSession(session().id)}
      accessibilityState={{ selected: active() }}
      style={{
        width: "100%",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 5,
        backgroundColor: active() ? colors.accentSoft : "transparent",
        borderColor: active() ? colors.accentBorder : "transparent",
        borderWidth: 1,
      }}
      hoverStyle={{ backgroundColor: active() ? colors.accentSoft : colors.panelRaised }}
      activeStyle={{ opacity: 0.75 }}
      focusVisibleStyle={{ borderColor: colors.accentStrong, borderWidth: 2 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, width: "100%" }}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: statusColor(session().status),
            flexShrink: 0,
          }}
        />
        <Text
          style={text({
            color: active() ? colors.textStrong : colors.text,
            fontSize: 12.5,
            fontWeight: active() ? "650" : "500",
            lineHeight: 16,
            flex: 1,
            minWidth: 0,
            numberOfLines: 1,
            textOverflow: "ellipsis",
          })}
        >
          {session().title}
        </Text>
        <Text style={text({ color: colors.faint, fontSize: 10, lineHeight: 14, flexShrink: 0 })}>{formatTime(session().updatedAt)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14 }}>
        <Text
          style={text({
            color: colors.faint,
            fontSize: 10.5,
            lineHeight: 14,
            fontFamily: font.mono,
            flex: 1,
            minWidth: 0,
            numberOfLines: 1,
            textOverflow: "ellipsis",
          })}
        >
          {session().model || "默认模型"}
        </Text>
        <Text style={text({ color: statusColor(session().status), fontSize: 10, lineHeight: 13 })}>{statusLabel(session().status)}</Text>
      </View>
    </View>
  );
}

function Sidebar() {
  return (
    <View
      style={{
        width: 292,
        flexShrink: 0,
        backgroundColor: colors.sidebar,
        borderRightColor: colors.borderSoft,
        borderRightWidth: 1,
        height: "100%",
      }}
    >
      <Brand />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
        <View
          style={{
            backgroundColor: colors.panelSoft,
            borderColor: colors.borderSoft,
            borderWidth: 1,
            borderRadius: 9,
            padding: 10,
            gap: 4,
          }}
        >
          <Text style={text({ color: colors.faint, fontSize: 10, fontWeight: "700", letterSpacing: 0.7 })}>WORKSPACE</Text>
          <Text
            style={text({
              color: colors.muted,
              fontSize: 11,
              lineHeight: 15,
              fontFamily: font.mono,
              numberOfLines: 2,
              textOverflow: "ellipsis",
            })}
          >
            {workspace() || "等待 Core 握手…"}
          </Text>
        </View>
        <Button label="＋ 新会话" onPress={startDraft} disabled={connectionState() === "failed"} />
      </View>
      <Divider />
      <View style={{ flex: 1, minHeight: 0 }}>
        <Scroll style={{ flex: 1 }}>
          <View style={{ padding: 8, gap: 4 }}>
            <Each of={sessions()} key={(session) => session.id}>
              {(session) => <SessionRow session={session} />}
            </Each>
            <If when={sessions().length === 0}>
              <EmptyState compact title="还没有会话" detail="点击“新会话”开始一个草稿；首次发送时会在 Core 中创建真实会话。" />
            </If>
          </View>
        </Scroll>
      </View>
      <Divider />
      <View style={{ padding: 12, gap: 7 }}>
        <Text style={text({ color: colors.faint, fontSize: 10.5, lineHeight: 15 })}>
          受信任局域网 HTTP · 无配对与加密
        </Text>
        <Text style={text({ color: colors.faint, fontSize: 10.5, lineHeight: 15, fontFamily: font.mono })}>
          port 21888 · core loopback
        </Text>
      </View>
    </View>
  );
}

function messageToolSummary(message: Message): string {
  if (message.role !== "assistant") return "";
  const calls = message.tool_calls ?? [];
  if (calls.length === 0) return "";
  return calls.map((call) => `调用 ${call.function.name}`).join(" · ");
}

function messageToolId(message: Message): string {
  return message.role === "tool" ? shortId(message.tool_call_id) : "";
}

function messageBody(message: Message): string {
  if (message.role === "assistant") return message.content ?? messageToolSummary(message);
  return message.content;
}

function hasAssistantToolCalls(message: Message): boolean {
  return message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0;
}

function MessageRow(props: { message: () => Message }) {
  const message = props.message;
  const role = () => message().role;
  const user = () => role() === "user";
  const tool = () => role() === "tool";
  return (
    <If when={role() !== "system"}>
      <View
        style={{
          width: "100%",
          alignItems: user() ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            maxWidth: user() ? "82%" : "92%",
            width: tool() ? "100%" : undefined,
            backgroundColor: user() ? colors.userBubble : tool() ? colors.toolBubble : colors.assistantBubble,
            borderColor: user() ? colors.accentBorder : tool() ? "#1f3b46" : colors.borderSoft,
            borderWidth: 1,
            borderRadius: user() ? 12 : 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 7,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text
              style={text({
                color: user() ? colors.accentStrong : tool() ? colors.info : colors.muted,
                fontSize: 10.5,
                fontWeight: "700",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              })}
            >
              {user() ? "你" : tool() ? "工具" : "Forge"}
            </Text>
            <If when={tool()}>
              <Text style={text({ color: colors.faint, fontSize: 10, fontFamily: font.mono })}>{messageToolId(message())}</Text>
            </If>
          </View>
          <Text
            style={text({
              color: tool() ? "#b8d7e3" : colors.text,
              fontSize: tool() ? 11.5 : 13.5,
              lineHeight: tool() ? 17 : 20,
              fontFamily: tool() ? font.mono : font.sans,
              userSelect: "text",
              width: "100%",
            })}
          >
            {messageBody(message())}
          </Text>
          <If when={hasAssistantToolCalls(message())}>
            <Text style={text({ color: colors.faint, fontSize: 10.5, fontFamily: font.mono })}>
              {messageToolSummary(message())}
            </Text>
          </If>
        </View>
      </View>
    </If>
  );
}

function StreamingFooter() {
  const active = () => activeRunForSelected();
  const visible = () =>
    streamingText().length > 0 || streamingReasoning().length > 0 || active() !== undefined;
  return (
    <If when={visible()}>
      <View
        style={{
          width: "100%",
          backgroundColor: colors.assistantBubble,
          borderColor: colors.accentBorder,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.info, animationName: "pulse", animationDuration: 1400, animationIterationCount: "infinite" }} />
          <Text style={text({ color: colors.info, fontSize: 11, fontWeight: "700" })}>
            {active()?.status === "awaiting_approval" ? "等待审批" : "正在运行"}
          </Text>
          <Text style={text({ color: colors.faint, fontSize: 10, fontFamily: font.mono })}>
            {active() ? `run ${shortId(active()?.runId)}` : "stream"}
          </Text>
        </View>
        <If when={streamingReasoning().length > 0}>
          <Text
            style={text({
              color: colors.faint,
              fontSize: 11.5,
              lineHeight: 17,
              fontStyle: "italic",
              numberOfLines: 5,
              textOverflow: "ellipsis",
            })}
          >
            {streamingReasoning()}
          </Text>
        </If>
        <Text style={text({ color: colors.text, fontSize: 13.5, lineHeight: 20, userSelect: "text", width: "100%" })}>
          {streamingText() || "Core 正在执行工具或等待模型响应…"}
        </Text>
      </View>
    </If>
  );
}

function Transcript() {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.page }}>
      <List
        each={visibleMessages()}
        keyExtractor={(message, index) => `${index}:${message.role}`}
        initialScrollAtEnd
        alignment="bottom"
        maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.25 }}
        style={{ flex: 1 }}
        contentStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 12, alignItems: "stretch" }}
        empty={
          <EmptyState
            title={creatingDraft() ? "新的 Forge 会话" : "选择一个会话"}
            detail={
              creatingDraft()
                ? "在下方输入任务。首次发送会通过 Forge Core 创建会话并启动运行。"
                : "从左侧选择一个线程，或点击“新会话”开始。此初始版本已经使用真实 Core RPC 与事件流。"
            }
          />
        }
        footer={<StreamingFooter />}
      >
        {(message) => <MessageRow message={message} />}
      </List>
    </View>
  );
}

function Composer() {
  const active = () => activeRunForSelected();
  const canSend = () => composer().trim().length > 0 && !sending() && connectionState() !== "failed";
  return (
    <View
      style={{
        flexShrink: 0,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 14,
        backgroundColor: colors.page,
        borderTopColor: colors.borderSoft,
        borderTopWidth: 1,
      }}
    >
      <View style={{ maxWidth: 860, width: "100%", alignSelf: "center", gap: 8 }}>
        <If when={settings() && !settings()?.isConfigured}>
          <View
            style={{
              backgroundColor: colors.warningSoft,
              borderColor: colors.warning,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            <Text style={text({ color: colors.warning, fontSize: 11.5, lineHeight: 16 })}>
              Forge 尚未配置 Provider/API Key。界面与会话协议可用，但启动模型运行会失败。
            </Text>
          </View>
        </If>
        <If when={actionError()}>
          <View
            style={{
              backgroundColor: colors.dangerSoft,
              borderColor: colors.danger,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            <Text style={text({ color: colors.danger, fontSize: 11.5, lineHeight: 16 })}>{actionError()}</Text>
          </View>
        </If>
        <View
          style={{
            backgroundColor: colors.panelRaised,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 13,
            padding: 10,
            gap: 9,
            boxShadow: [{ x: 0, y: 12, blur: 28, spread: -18, color: colors.shadow }],
          }}
        >
          <Input
            value={composer()}
            onChange={(event) => composer.set(event.value)}
            onSubmit={() => {
              void sendPrompt();
            }}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            autoCorrect={false}
            placeholder="描述要实现的任务…  Enter 发送，Shift+Enter 换行"
            style={{
              width: "100%",
              minHeight: 68,
              maxHeight: 150,
              color: colors.text,
              placeholderColor: colors.faint,
              caretColor: colors.accentStrong,
              selectionColor: colors.accentSoft,
              backgroundColor: "transparent",
              fontFamily: font.sans,
              fontSize: 14,
              lineHeight: 20,
              padding: 2,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={text({ color: colors.faint, fontSize: 10.5, flex: 1, minWidth: 0, numberOfLines: 1 })}>
              {active() ? `运行 ${shortId(active()?.runId)} · ${statusLabel(active()?.status)}` : "Forge Core RPC · WebSocket events · workspace permission"}
            </Text>
            <If when={active()}>
              <Button compact variant="danger" label="停止" onPress={() => void cancelSelectedRun()} />
            </If>
            <Button compact label={sending() ? "发送中…" : "发送"} onPress={() => void sendPrompt()} disabled={!canSend()} />
          </View>
        </View>
      </View>
    </View>
  );
}

function CenterHeader() {
  const title = () => snapshot()?.title ?? selectedSummary()?.title ?? (creatingDraft() ? "新会话" : "Forge NSH Workbench");
  const subtitle = () => {
    const current = snapshot();
    if (current) return `${statusLabel(current.status)} · ${current.model || "默认模型"} · ${shortId(current.id)}`;
    if (creatingDraft()) return "草稿 · 首次发送时创建 Core 会话";
    return connectionDetail();
  };
  return (
    <View
      style={{
        height: 56,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 18,
        borderBottomColor: colors.borderSoft,
        borderBottomWidth: 1,
        backgroundColor: colors.page,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text
          style={text({
            color: colors.textStrong,
            fontSize: 14.5,
            fontWeight: "700",
            lineHeight: 19,
            numberOfLines: 1,
            textOverflow: "ellipsis",
          })}
        >
          {title()}
        </Text>
        <Text
          style={text({
            color: colors.faint,
            fontSize: 10.5,
            lineHeight: 14,
            numberOfLines: 1,
            textOverflow: "ellipsis",
          })}
        >
          {subtitle()}
        </Text>
      </View>
      <If when={snapshotLoading()}>
        <Badge label="加载快照" tone="info" />
      </If>
      <If when={connectionState() === "failed"}>
        <Button compact variant="secondary" label="重试连接" onPress={retryConnection} />
      </If>
    </View>
  );
}

function CenterPane() {
  return (
    <View style={{ flex: 1, minWidth: 0, height: "100%", backgroundColor: colors.page }}>
      <CenterHeader />
      <Transcript />
      <Composer />
    </View>
  );
}

function ApprovalCard(props: { approval: () => ApprovalRequest }) {
  const approval = props.approval;
  return (
    <View
      style={{
        backgroundColor: colors.warningSoft,
        borderColor: colors.warning,
        borderWidth: 1,
        borderRadius: 9,
        padding: 10,
        gap: 8,
        width: "100%",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Badge label={approval().toolName} tone="warning" />
        <Text style={text({ color: colors.faint, fontSize: 10, fontFamily: font.mono })}>{shortId(approval().id)}</Text>
      </View>
      <Text style={text({ color: colors.text, fontSize: 11.5, lineHeight: 16 })}>{approval().description}</Text>
      <If when={(approval().command?.length ?? 0) > 0}>
        <Text style={text({ color: colors.warning, fontSize: 10.5, lineHeight: 15, fontFamily: font.mono, numberOfLines: 4 })}>
          {approval().command?.join(" ") ?? ""}
        </Text>
      </If>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button compact label="批准" onPress={() => void answerApproval(approval(), true)} />
        <Button compact variant="danger" label="拒绝" onPress={() => void answerApproval(approval(), false)} />
      </View>
    </View>
  );
}

function WorkspaceEntryRow(props: { entry: () => WorkspaceEntry }) {
  const entry = props.entry;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, width: "100%", paddingVertical: 3 }}>
      <Text style={text({ color: entry().kind === "directory" ? colors.info : colors.faint, fontSize: 11, width: 16 })}>
        {entry().kind === "directory" ? "▸" : "·"}
      </Text>
      <Text
        style={text({
          color: colors.text,
          fontSize: 11,
          lineHeight: 15,
          fontFamily: font.mono,
          flex: 1,
          minWidth: 0,
          numberOfLines: 1,
          textOverflow: "ellipsis",
        })}
      >
        {entry().name}
      </Text>
      <Text style={text({ color: colors.faint, fontSize: 9.5 })}>{entry().kind === "file" ? formatBytes(entry().sizeBytes) : ""}</Text>
    </View>
  );
}

function ActivityRow(props: { item: () => ActivityItem }) {
  const item = props.item;
  return (
    <View style={{ flexDirection: "row", gap: 8, width: "100%", alignItems: "flex-start" }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          marginTop: 5,
          flexShrink: 0,
          backgroundColor:
            item().tone === "success"
              ? colors.success
              : item().tone === "warning"
                ? colors.warning
                : item().tone === "danger"
                  ? colors.danger
                  : item().tone === "muted"
                    ? colors.faint
                    : colors.info,
        }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Text style={text({ color: colors.text, fontSize: 11, fontWeight: "650", flex: 1, minWidth: 0, numberOfLines: 1 })}>{item().title}</Text>
          <Text style={text({ color: colors.faint, fontSize: 9.5 })}>{formatTime(item().timestamp)}</Text>
        </View>
        <If when={item().detail}>
          <Text style={text({ color: colors.muted, fontSize: 10.5, lineHeight: 14, numberOfLines: 3, textOverflow: "ellipsis" })}>{item().detail}</Text>
        </If>
      </View>
    </View>
  );
}

function InspectorSection(props: { title: string; detail?: string; children?: any }) {
  return (
    <View style={{ padding: 12, gap: 10, width: "100%" }}>
      <SectionTitle title={props.title} detail={props.detail} />
      {props.children}
    </View>
  );
}

function Inspector() {
  const active = () => activeRunForSelected();
  const pending = () => active()?.pendingApprovals ?? [];
  const current = () => snapshot();
  return (
    <View
      style={{
        width: 304,
        flexShrink: 0,
        backgroundColor: colors.sidebar,
        borderLeftColor: colors.borderSoft,
        borderLeftWidth: 1,
        height: "100%",
      }}
    >
      <Scroll style={{ flex: 1 }}>
        <View style={{ paddingVertical: 4, gap: 2 }}>
          <InspectorSection title="连接">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge
                label={connectionLabel(connectionState())}
                tone={connectionState() === "connected" ? "success" : connectionState() === "failed" ? "danger" : "warning"}
              />
              <Text style={text({ color: colors.faint, fontSize: 10, flex: 1, numberOfLines: 1 })}>{`${hostRuns().length} 个活跃运行`}</Text>
            </View>
            <Text style={text({ color: colors.muted, fontSize: 11, lineHeight: 15 })}>{connectionDetail()}</Text>
            <KeyValue label="workspace" value={workspace() || "—"} mono />
            <KeyValue label="core" value="127.0.0.1 · reverse proxied" mono />
          </InspectorSection>
          <Divider />
          <InspectorSection title="会话">
            <KeyValue label="title" value={current()?.title ?? selectedSummary()?.title ?? "新草稿"} />
            <KeyValue label="status" value={statusLabel(current()?.status ?? selectedSummary()?.status)} />
            <KeyValue label="model" value={current()?.model ?? settings()?.model ?? "未配置"} mono />
            <KeyValue label="session" value={shortId(current()?.id ?? selectedSessionId())} mono />
            <KeyValue label="run" value={active() ? `${shortId(active()?.runId)} · ${statusLabel(active()?.status)}` : "—"} mono />
            <KeyValue label="permission" value={active()?.permission ?? settings()?.defaultPermission ?? "workspace"} />
          </InspectorSection>
          <Divider />
          <InspectorSection title="审批" detail="需要人工决定的工具调用">
            <If when={pending().length === 0}>
              <Text style={text({ color: colors.faint, fontSize: 11 })}>当前没有待处理审批。</Text>
            </If>
            <Each of={pending()} key={(approval) => approval.id}>
              {(approval) => <ApprovalCard approval={approval} />}
            </Each>
          </InspectorSection>
          <Divider />
          <InspectorSection title="工作区" detail="根目录条目（只读预览）">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <Text style={text({ color: colors.faint, fontSize: 10.5 })}>
                {workspaceListingTruncated() ? "列表已截断" : `${workspaceEntries().length} 项`}
              </Text>
              <IconButton
                label="刷新工作区"
                icon="↻"
                onPress={() => {
                  const id = selectedSessionId();
                  if (id) void refreshWorkspaceEntries(id);
                }}
                disabled={!selectedSessionId()}
              />
            </View>
            <Each of={workspaceEntries().slice(0, 12)} key={(entry) => entry.path}>
              {(entry) => <WorkspaceEntryRow entry={entry} />}
            </Each>
            <If when={workspaceEntries().length === 0}>
              <Text style={text({ color: colors.faint, fontSize: 11 })}>选择会话后可读取工作区条目。</Text>
            </If>
          </InspectorSection>
          <Divider />
          <InspectorSection title="活动" detail="来自 Core WebSocket 的运行事件">
            <If when={activities().length === 0}>
              <Text style={text({ color: colors.faint, fontSize: 11 })}>
                暂无活动。启动一次运行后，这里会显示文本流之外的工具、审批与生命周期事件。
              </Text>
            </If>
            <Each of={activities().slice(0, 14)} key={(item) => item.id}>
              {(item) => <ActivityRow item={item} />}
            </Each>
          </InspectorSection>
        </View>
      </Scroll>
    </View>
  );
}

export function Workbench() {
  bootstrapWorkbench();
  const showSidebar = () => windowSize().width >= 760;
  const showInspector = () => windowSize().width >= 1120;
  return (
    <View style={{ flex: 1, width: "100%", height: "100%", backgroundColor: colors.page, flexDirection: "row", overflow: "hidden" }}>
      <Head
        title="Forge NSH Workbench"
        description="A T3Code-inspired Forge Core control plane built with Native Shell."
        lang="zh-CN"
      />
      <If when={showSidebar()}>
        <Sidebar />
      </If>
      <CenterPane />
      <If when={showInspector()}>
        <Inspector />
      </If>
    </View>
  );
}
