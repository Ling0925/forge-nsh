import { split, Text, View } from "nsh";
import type { JSX } from "nsh";
import { Input, type InputProps } from "nsh/base";
import type { SaveStatus } from "../../settings/common";
import { focusRingClass, textClasses } from "../../theme";
import { Surface } from "../../ui/surface";

export function SettingsInput(props: InputProps & { invalid?: boolean }) {
  const [own, rest] = split(props, ["invalid", "readonly", "class"]);
  return (
    <Input
      {...rest}
      readonly={own.readonly}
      class={`min-h-9 w-full rounded-(--radius) border px-3 py-2 text-sm leading-5 caret-primary placeholder:text-dim-foreground selection:bg-selection ${
        own.readonly
          ? "border-border-subtle bg-control-disabled text-control-disabled-foreground"
          : `${own.invalid ? "border-danger" : "border-input"} bg-surface-inset text-foreground`
      } ${focusRingClass} ${own.class ?? ""}`}
    />
  );
}

export function Field(props: {
  label: string;
  description?: string;
  error?: string;
  children?: JSX.Element;
}) {
  return (
    <View class="min-w-0 gap-1.5" role="group">
      <Text class="text-sm font-semibold leading-5 text-foreground">{props.label}</Text>
      {props.children}
      <If when={props.description !== undefined || props.error !== undefined}>
        <Text class={props.error ? "text-xs leading-4 text-danger-foreground" : textClasses.dim}>
          {props.error ?? props.description}
        </Text>
      </If>
    </View>
  );
}

export function SettingsGroup(props: {
  title: string;
  description?: string;
  actions?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <Surface variant="panel" class="gap-4 p-4">
      <View class="flex-row flex-wrap items-start justify-between gap-3">
        <View class="min-w-0 flex-1 gap-1">
          <Text class={textClasses.title}>{props.title}</Text>
          <If when={props.description !== undefined}>
            <Text class={textClasses.small}>{props.description}</Text>
          </If>
        </View>
        {props.actions}
      </View>
      {props.children}
    </Surface>
  );
}

const statusDot: Record<SaveStatus["state"], string> = {
  idle: "bg-dim-foreground",
  saving: "bg-info animate-pulse motion-reduce:animate-none",
  saved: "bg-success",
  error: "bg-danger",
};

const statusText: Record<SaveStatus["state"], string> = {
  idle: "text-dim-foreground",
  saving: "text-info-foreground",
  saved: "text-success-foreground",
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
      <View class="min-h-5 flex-row items-center gap-2">
        <View class={`size-2 rounded-full ${statusDot[props.status.state]}`} />
        <Text class={`text-xs leading-4 ${statusText[props.status.state]}`}>{text()}</Text>
      </View>
    </If>
  );
}

export function ValidationList(props: { errors: readonly string[] }) {
  return (
    <If when={props.errors.length > 0}>
      <Surface variant="danger" class="gap-1.5 px-3 py-2.5" role="alert">
        <Text class="text-xs font-bold uppercase leading-4 tracking-wider text-danger-foreground">
          Check these values
        </Text>
        <Each of={props.errors} key={(error) => error}>
          {(error) => <Text class="text-xs leading-4 text-danger-foreground">• {error()}</Text>}
        </Each>
      </Surface>
    </If>
  );
}
