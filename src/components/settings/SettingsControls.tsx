import { split, Text, View } from "nsh";
import type { JSX } from "nsh";
import { Input, type InputProps } from "nsh/base";
import type { SaveStatus } from "../../settings/common";
import { focusRingClass, textClasses } from "../../theme";
import { Icon } from "../../ui/icon";
import { Surface } from "../../ui/surface";

export function SettingsInput(props: InputProps & { invalid?: boolean }) {
  const [own, rest] = split(props, ["invalid", "readonly", "class"]);
  return (
    <Input
      {...rest}
      readonly={own.readonly}
      class={`min-h-9 w-full rounded-(--radius) border px-3 py-2 text-[14px] leading-5 caret-primary placeholder:text-dim-foreground selection:bg-selection ${
        own.readonly
          ? "border-border-subtle bg-control-disabled text-control-disabled-foreground"
          : `${own.invalid ? "border-danger" : "border-input"} bg-surface-inset text-foreground`
      } ${focusRingClass} ${own.class ?? ""}`}
    />
  );
}

export function Field(props: {
  label: string;
  error?: string;
  children?: JSX.Element;
}) {
  return (
    <View class="min-w-0 gap-2" role="group">
      <Text class="text-[14px] font-medium leading-5 text-foreground">{props.label}</Text>
      {props.children}
      <If when={props.error !== undefined}>
        <Text class="text-[14px] leading-5 text-danger-foreground" role="alert">
          {props.error}
        </Text>
      </If>
    </View>
  );
}

/** Borderless single-layer settings section separated by generous whitespace. */
export function SettingsGroup(props: {
  title: string;
  actions?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <View class="gap-6">
      <View class="flex-row flex-wrap items-center justify-between gap-4">
        <Text class={textClasses.title}>{props.title}</Text>
        {props.actions}
      </View>
      <View class="gap-6">{props.children}</View>
    </View>
  );
}

const statusDot: Record<SaveStatus["state"], string> = {
  idle: "bg-muted-foreground",
  saving: "bg-primary animate-pulse motion-reduce:animate-none",
  saved: "bg-foreground",
  error: "bg-danger",
};

const statusText: Record<SaveStatus["state"], string> = {
  idle: "text-muted-foreground",
  saving: "text-foreground",
  saved: "text-foreground",
  error: "text-danger-foreground",
};

export function SaveStatusLine(props: { status: SaveStatus; idleText?: string }) {
  const text = () => props.status.message ?? (
    props.status.state === "saving"
      ? "Saving…"
      : props.status.state === "saved"
        ? "Saved"
        : props.status.state === "error"
          ? "Not saved"
          : props.idleText ?? ""
  );
  return (
    <If when={text().length > 0}>
      <View class="min-h-6 flex-row items-center gap-2">
        <View class={`size-2 rounded-full ${statusDot[props.status.state]}`} />
        <Text class={`text-[14px] leading-5 ${statusText[props.status.state]}`}>{text()}</Text>
      </View>
    </If>
  );
}

export function ValidationList(props: { errors: readonly string[] }) {
  return (
    <If when={props.errors.length > 0}>
      <Surface variant="danger" class="gap-2 p-4" role="alert">
        <View class="flex-row items-center gap-2">
          <Icon name="alert" tone="danger" />
          <Text class="text-[14px] font-semibold leading-5 text-danger-foreground">
            Check these values
          </Text>
        </View>
        <Each of={props.errors} key={(error) => error}>
          {(error) => <Text class="text-[14px] leading-5 text-danger-foreground">• {error()}</Text>}
        </Each>
      </Surface>
    </If>
  );
}
