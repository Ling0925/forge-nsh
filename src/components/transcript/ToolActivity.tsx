import { horizontalSizeClass, signal, Text, View } from "nsh";
import { Button as BaseButton, Collapsible } from "nsh/base";
import { compactPath } from "../../format";
import { focusRingClass, intentRevealClass, motionClasses, textClasses } from "../../theme";
import {
  formatDuration,
  type ToolChangeItem,
  type ToolExecutionItem,
  type ToolGroupTranscriptItem,
} from "../../transcript";
import { Badge } from "../../ui/badge";
import { Icon } from "../../ui/icon";
import { Surface } from "../../ui/surface";
import { CopyButton } from "./MessageRows";

function diffSummary(changes: readonly ToolChangeItem[] | undefined): { added: number; removed: number } | undefined {
  if (!changes?.length) return undefined;
  let added = 0;
  let removed = 0;
  let hasCounts = false;
  for (const change of changes) {
    if (change.added !== undefined) {
      added += change.added;
      hasCounts = true;
    }
    if (change.removed !== undefined) {
      removed += change.removed;
      hasCounts = true;
    }
  }
  return hasCounts ? { added, removed } : undefined;
}

function ToolCard(props: { call: ToolExecutionItem }) {
  const expanded = signal(false);
  const isError = () => props.call.status === "error";
  const isPending = () => props.call.status === "pending";
  const isRegular = () => horizontalSizeClass() === "regular";
  const hasDetails = () =>
    props.call.argumentsPretty !== undefined ||
    props.call.output !== undefined ||
    (props.call.changes?.length ?? 0) > 0;
  const duration = () => formatDuration(props.call.durationMs);
  const totals = () => diffSummary(props.call.changes);

  return (
    <Surface variant={isError() ? "danger" : "soft"} class="overflow-hidden">
      <Collapsible
        open={expanded()}
        reveal
        content={(
          <If when={hasDetails()}>
            <View class="gap-4 px-4 pb-4 pt-2">
              <If when={(props.call.changes?.length ?? 0) > 0}>
                <View class="gap-2">
                  <Text class="text-[14px] font-semibold leading-5 text-foreground">Changes</Text>
                  <Each of={props.call.changes ?? []} key={(change) => change.path}>
                    {(change) => (
                      <View class="flex-row items-center justify-between gap-3">
                        <View class="min-w-0 flex-1 flex-row items-center gap-3">
                          <Badge tone={change().kind === "deleted" ? "danger" : "neutral"} label={change().kind} />
                          <Text class="min-w-0 flex-1 font-mono text-[14px] leading-5 text-foreground" style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
                            {compactPath(change().path, 52)}
                          </Text>
                        </View>
                        <If when={change().added !== undefined || change().removed !== undefined}>
                          <View class="flex-row items-center gap-2">
                            <If when={change().added !== undefined}>
                              <Text class="font-mono text-[14px] leading-5 text-foreground">+{change().added}</Text>
                            </If>
                            <If when={change().removed !== undefined}>
                              <Text class="font-mono text-[14px] leading-5 text-danger-foreground">-{change().removed}</Text>
                            </If>
                          </View>
                        </If>
                      </View>
                    )}
                  </Each>
                </View>
              </If>

              <If when={props.call.argumentsPretty !== undefined}>
                <View class="group gap-2">
                  <View class="flex-row items-center justify-between gap-2">
                    <Text class="text-[14px] font-semibold leading-5 text-foreground">Input</Text>
                    <View class={`min-h-8 ${isRegular() ? intentRevealClass : ""}`}>
                      <CopyButton text={props.call.argumentsPretty ?? ""} accessibilityLabel={`Copy ${props.call.name} input`} />
                    </View>
                  </View>
                  <View selectable>
                    <Text class="font-mono text-[14px] leading-5 text-muted-foreground selection:bg-selection">
                      {props.call.argumentsPretty}
                    </Text>
                  </View>
                </View>
              </If>

              <If when={props.call.output !== undefined}>
                <View class="group gap-2">
                  <View class="flex-row items-center justify-between gap-2">
                    <Text class={`text-[14px] font-semibold leading-5 ${isError() ? "text-danger-foreground" : "text-foreground"}`}>
                      {isError() ? "Error" : "Output"}
                    </Text>
                    <View class={`min-h-8 ${isRegular() ? intentRevealClass : ""}`}>
                      <CopyButton text={props.call.output ?? ""} accessibilityLabel={`Copy ${props.call.name} output`} />
                    </View>
                  </View>
                  <View selectable>
                    <Text class={`font-mono text-[14px] leading-5 selection:bg-selection ${isError() ? "text-danger-foreground" : "text-muted-foreground"}`}>
                      {props.call.output}
                    </Text>
                  </View>
                </View>
              </If>
            </View>
          </If>
        )}
      >
        <BaseButton
          selected={expanded()}
          disabled={!hasDetails()}
          onPress={() => expanded.update((value) => !value)}
          accessibilityLabel={`Toggle ${props.call.name} details`}
          class={`w-full flex-row items-center gap-3 rounded-(--radius-lg) px-4 py-3 ${motionClasses.color} ${focusRingClass} ${
            isError() ? "enabled:hover:bg-danger-hover" : "enabled:hover:bg-surface-hover"
          }`}
        >
          <View
            class={`size-2 shrink-0 rounded-full ${
              isError()
                ? "bg-danger"
                : isPending()
                  ? "bg-primary animate-pulse motion-reduce:animate-none"
                  : "bg-muted-foreground"
            }`}
          />
          <Text class="font-mono text-[14px] font-semibold leading-5 text-foreground">
            {props.call.name}
          </Text>
          <Text
            class="min-w-0 flex-1 text-[14px] leading-5 text-muted-foreground"
            style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
          >
            {props.call.summary}
          </Text>
          <If when={totals() !== undefined}>
            <View class="flex-row items-center gap-2">
              <Text class="font-mono text-[14px] leading-5 text-foreground">+{totals()?.added ?? 0}</Text>
              <Text class="font-mono text-[14px] leading-5 text-danger-foreground">-{totals()?.removed ?? 0}</Text>
            </View>
          </If>
          <If when={duration() !== undefined}>
            <Text class={textClasses.secondary}>{duration()}</Text>
          </If>
          <If when={isError()}>
            <Badge tone="danger" label="Error" />
          </If>
          <If when={hasDetails()}>
            <Icon name={expanded() ? "chevron-down" : "chevron-right"} tone="muted" />
          </If>
        </BaseButton>
      </Collapsible>
    </Surface>
  );
}

export function ToolGroupRow(props: { item: ToolGroupTranscriptItem }) {
  return (
    <View class="gap-3">
      <Each of={props.item.calls} key={(call) => call.id}>
        {(call) => <ToolCard call={call()} />}
      </Each>
    </View>
  );
}
