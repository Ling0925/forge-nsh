import { horizontalSizeClass, Text, View } from "nsh";
import type { ProviderProtocol, PublicProviderSource } from "../../protocol";
import {
  activateProviderSource,
  changeProviderBaseUrl,
  changeProviderProtocol,
  providerCatalogState,
  providerCatalogs,
  providerDirty,
  providerDraft,
  providerPresetState,
  providerPresets,
  providerProblems,
  providerSaving,
  providerSources,
  providerStatus,
  providerValidation,
  refreshProviderCatalog,
  removeProviderSource,
  resetProviderDraft,
  saveProviderSource,
  selectProviderPreset,
  selectProviderPresetRegion,
  selectProviderSource,
  selectedProviderSourceId,
  sourceActionBusy,
  sourceActionStatus,
  startNewProviderSource,
  updateProviderDraft,
} from "../../settings";
import { endpointProblem } from "../../settings/common";
import { coreSettings, settingsWritable } from "../../store";
import { intentRevealClass, textClasses } from "../../theme";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Icon } from "../../ui/icon";
import { OptionSelect } from "../../ui/select";
import { Surface } from "../../ui/surface";
import { Field, SaveStatusLine, SettingsGroup, SettingsInput, ValidationList } from "./SettingsControls";

const protocolOptions: readonly { value: ProviderProtocol; title: string }[] = [
  { value: "chat-completions", title: "Chat Completions" },
  { value: "responses", title: "Responses" },
  { value: "anthropic", title: "Anthropic Messages" },
  { value: "gemini", title: "Gemini" },
];

function protocolTitle(protocol: ProviderProtocol | undefined): string {
  return protocolOptions.find((item) => item.value === (protocol ?? "chat-completions"))?.title ?? protocol ?? "Chat Completions";
}

function compactEndpoint(value: string): string {
  return value.replace(/^https?:\/\//, "") || "—";
}

function sourceKeyLabel(source: PublicProviderSource): string {
  if (source.hasApiKey) return "Key saved";
  if (source.credentials?.some((credential) => credential.type === "account")) return "Account";
  return "No key";
}

function canWrite(): boolean {
  return settingsWritable() && !providerSaving() && !sourceActionBusy();
}

function SourceCard(props: { source: PublicProviderSource }) {
  const id = props.source.id;
  const selected = () => selectedProviderSourceId() === id;
  const active = () => coreSettings()?.activeSourceId === id;
  const catalogState = () => providerCatalogState()[id];
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <Surface
      variant={selected() ? "bordered" : "soft"}
      class={`group gap-3 p-6 ${active() && selected() ? "border-primary" : ""}`}
    >
      <Button
        variant="ghost"
        class="w-full items-start justify-start px-0 py-0 text-left enabled:hover:bg-transparent"
        onPress={() => void selectProviderSource(id)}
        accessibilityLabel={`Edit provider source ${props.source.label}`}
      >
        <View class="min-w-0 flex-1 gap-2">
          <View class="flex-row flex-wrap items-center gap-2">
            <Text
              class="text-[16px] font-semibold leading-6 text-foreground"
              style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
            >
              {props.source.label}
            </Text>
            <If when={active()}>
              <Badge tone="primary" label="Active" />
            </If>
            <Badge tone="neutral" label={sourceKeyLabel(props.source)} />
          </View>
          <Text class={textClasses.secondary} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {compactEndpoint(props.source.baseUrl)} · {protocolTitle(props.source.apiMode)} · {props.source.model || "—"}
          </Text>
        </View>
      </Button>
      <View class={`flex-row flex-wrap items-center justify-end gap-2 ${isRegular() ? intentRevealClass : ""}`}>
        <If when={catalogState()?.error !== undefined}>
          <Text class="flex-1 text-[14px] leading-5 text-danger-foreground" style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {catalogState()?.error}
          </Text>
        </If>
        <Button
          variant="outline"
          size="sm"
          icon="refresh"
          label={catalogState()?.loading ? "Refreshing…" : "Refresh models"}
          busy={catalogState()?.loading === true}
          disabled={!canWrite() || catalogState()?.loading === true}
          onPress={() => void refreshProviderCatalog(id, true)}
        />
        <If when={!active()}>
          <Button
            variant="secondary"
            size="sm"
            label="Set active"
            disabled={!canWrite()}
            onPress={() => void activateProviderSource(id)}
          />
        </If>
      </View>
    </Surface>
  );
}

function SourceList() {
  return (
    <View class="gap-4">
      <If
        when={providerSources().length > 0}
        else={(
          <Surface variant="soft" class="items-center gap-4 p-8">
            <Text class={textClasses.body}>No provider sources</Text>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              label="Add source"
              disabled={!canWrite()}
              onPress={startNewProviderSource}
            />
          </Surface>
        )}
      >
        <Each of={providerSources()} key={(source) => source.id}>
          {(source) => <SourceCard source={source()} />}
        </Each>
      </If>
    </View>
  );
}

function CatalogPicker() {
  const draft = () => providerDraft();
  const id = () => draft()?.id ?? "";
  const models = () => providerCatalogs()[id()] ?? [];
  const state = () => providerCatalogState()[id()];
  const items = () => models().map((model) => ({ value: model.id, title: model.id }));
  const selectedValue = () => items().some((item) => item.value === draft()?.model) ? draft()?.model ?? null : null;
  return (
    <View class="gap-3">
      <View class="flex-row items-center justify-between gap-3">
        <Text class="text-[14px] font-medium leading-5 text-foreground">Catalog</Text>
        <Button
          variant="outline"
          size="sm"
          icon="refresh"
          label={state()?.loading ? "Refreshing…" : "Refresh"}
          busy={state()?.loading === true}
          disabled={!canWrite() || draft()?.isNew === true || state()?.loading === true}
          onPress={() => void refreshProviderCatalog(id(), true)}
        />
      </View>
      <If when={state()?.error !== undefined}>
        <Text class="text-[14px] leading-5 text-danger-foreground" role="alert">{state()?.error}</Text>
      </If>
      <If when={items().length > 0}>
        <OptionSelect
          accessibilityLabel="Choose a catalog model"
          items={items()}
          value={selectedValue()}
          placeholder="Select a model…"
          searchable
          disabled={!canWrite()}
          onChange={(value) => {
            if (value) updateProviderDraft({ model: value });
          }}
        />
      </If>
    </View>
  );
}

function ProviderEditor() {
  const draft = () => providerDraft();
  const disabled = () => !canWrite();
  const isRegular = () => horizontalSizeClass() === "regular";
  const visibleProblems = () => providerValidation().length ? providerValidation() : (providerDirty() ? providerProblems() : []);
  const endpointError = () => {
    const value = draft()?.baseUrl ?? "";
    return value.trim() ? endpointProblem(value) : "";
  };
  const canSave = () => providerDirty() && providerProblems().length === 0 && canWrite();
  const chosenPreset = () => providerPresets().find((item) => item.id === (draft()?.preset ?? ""));
  const presetItems = () => [
    { value: "", title: "Custom endpoint" },
    ...providerPresets().map((item) => ({ value: item.id, title: item.name })),
  ];
  const regionItems = () => [
    { value: "", title: "Default" },
    ...(chosenPreset()?.regions ?? []).map((item) => ({ value: item.id, title: item.name })),
  ];
  return (
    <If when={draft() !== undefined}>
      <Surface variant="soft" class="group gap-6 p-8">
        <View class="flex-row flex-wrap items-center justify-between gap-3">
          <Text class={textClasses.title}>{draft()?.isNew ? "New source" : draft()?.label || "Source"}</Text>
          <View class="flex-row flex-wrap gap-2">
            <If when={!draft()?.isNew}>
              <Badge tone="neutral" label={`rev ${draft()?.revision ?? 0}`} />
            </If>
            <If when={coreSettings()?.activeSourceId === draft()?.id}>
              <Badge tone="primary" label="Active" />
            </If>
          </View>
        </View>

        <ValidationList errors={visibleProblems()} />

        <View class="flex-row flex-wrap gap-4">
          <View class="min-w-[220px] flex-1">
            <Field
              label="Preset"
              error={providerPresetState().error}
            >
              <OptionSelect
                accessibilityLabel="Provider preset"
                items={presetItems()}
                value={draft()?.preset ?? ""}
                disabled={disabled()}
                searchable
                placeholder={providerPresetState().loading ? "Loading…" : "Preset"}
                onChange={(value) => selectProviderPreset(value ?? "")}
              />
            </Field>
          </View>
          <If when={(chosenPreset()?.regions?.length ?? 0) > 0}>
            <View style={{ width: 220, maxWidth: "100%" }}>
              <Field label={chosenPreset()?.regionLabel ?? "Region"}>
                <OptionSelect
                  accessibilityLabel="Provider region"
                  items={regionItems()}
                  value={draft()?.region ?? ""}
                  disabled={disabled()}
                  onChange={(value) => selectProviderPresetRegion(value ?? "")}
                />
              </Field>
            </View>
          </If>
        </View>

        <View class="flex-row flex-wrap gap-4">
          <View class="min-w-[220px] flex-1">
            <Field label="Name">
              <SettingsInput
                value={draft()?.label ?? ""}
                readonly={disabled()}
                placeholder="OpenAI, Anthropic…"
                autoCorrect={false}
                autoCapitalize="words"
                accessibilityLabel="Provider source name"
                onChange={(event) => updateProviderDraft({ label: event.value })}
              />
            </Field>
          </View>
          <View style={{ width: 240, maxWidth: "100%" }}>
            <Field label="Protocol">
              <OptionSelect
                accessibilityLabel="Provider protocol"
                items={protocolOptions}
                value={draft()?.apiMode ?? "chat-completions"}
                disabled={disabled()}
                onChange={(value) => changeProviderProtocol((value ?? "chat-completions") as ProviderProtocol)}
              />
            </Field>
          </View>
        </View>

        <Field
          label="API base URL"
          error={endpointError() || undefined}
        >
          <SettingsInput
            value={draft()?.baseUrl ?? ""}
            readonly={disabled()}
            invalid={endpointError().length > 0}
            placeholder="https://api.example.com/v1"
            keyboardType="url"
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="url"
            accessibilityLabel="Provider API base URL"
            onChange={(event) => changeProviderBaseUrl(event.value)}
          />
        </Field>

        <Field label="Model">
          <SettingsInput
            value={draft()?.model ?? ""}
            readonly={disabled()}
            placeholder="model-id"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Provider model ID"
            onChange={(event) => updateProviderDraft({ model: event.value })}
          />
        </Field>

        <CatalogPicker />

        <View class="gap-3">
          <Field label="API key">
            <SettingsInput
              value={draft()?.apiKey ?? ""}
              readonly={disabled() || !draft()?.canEditKey || draft()?.clearKey === true}
              masked
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder={draft()?.canEditKey
                ? draft()?.originalHasApiKey
                  ? "Leave blank to keep saved key"
                  : "API key"
                : "Managed credential"}
              accessibilityLabel="Provider API key"
              onChange={(event) => updateProviderDraft({ apiKey: event.value, clearKey: false })}
            />
          </Field>
          <If when={draft()?.canEditKey === true && draft()?.originalHasApiKey === true}>
            <Checkbox
              checked={draft()?.clearKey === true}
              disabled={disabled()}
              label="Clear saved key"
              onChange={(event) => updateProviderDraft({ clearKey: event.checked, apiKey: event.checked ? "" : draft()?.apiKey ?? "" })}
            />
          </If>
          <If when={draft()?.credentialNote !== undefined}>
            <Text class={textClasses.secondary}>{draft()?.credentialNote}</Text>
          </If>
        </View>

        <View class="flex-row flex-wrap items-center justify-between gap-4 pt-2">
          <SaveStatusLine status={providerStatus()} idleText={providerDirty() ? "Unsaved changes" : ""} />
          <View class="flex-row flex-wrap items-center justify-end gap-3">
            <View class={`flex-row gap-3 ${isRegular() ? intentRevealClass : ""}`}>
              <If when={!draft()?.isNew}>
                <Button
                  variant="danger"
                  size="sm"
                  icon="trash"
                  label="Delete"
                  disabled={!canWrite()}
                  onPress={() => void removeProviderSource(draft()?.id ?? "")}
                />
              </If>
              <Button
                variant="outline"
                size="sm"
                label="Reset"
                disabled={!providerDirty() || disabled()}
                onPress={resetProviderDraft}
              />
            </View>
            <Button
              variant="primary"
              size="md"
              label={providerStatus().state === "saving" ? "Saving…" : "Save"}
              busy={providerStatus().state === "saving"}
              disabled={!canSave()}
              onPress={() => void saveProviderSource()}
            />
          </View>
        </View>
      </Surface>
    </If>
  );
}

export function ProviderSettings() {
  return (
    <View class="gap-12">
      <If when={coreSettings()?.environmentOverride === true}>
        <Surface variant="soft" class="flex-row items-center gap-3 p-4" role="alert">
          <Icon name="alert" tone="accent" />
          <Text class="flex-1 text-[14px] leading-5 text-foreground">
            FORGE_* environment override is active.
          </Text>
        </Surface>
      </If>

      <SettingsGroup
        title="Provider sources"
        actions={(
          <If when={providerSources().length > 0}>
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              label="Add source"
              disabled={!canWrite()}
              onPress={startNewProviderSource}
            />
          </If>
        )}
      >
        <SourceList />
        <SaveStatusLine status={sourceActionStatus()} />
      </SettingsGroup>

      <ProviderEditor />
    </View>
  );
}
