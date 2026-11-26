import { Text, View } from "nsh";
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
  providerSources,
} from "../../settings";
import { endpointProblem } from "../../settings/common";
import { coreSettings, settingsWritable } from "../../store";
import { textClasses } from "../../theme";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
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
  return value.replace(/^https?:\/\//, "") || "no endpoint";
}

function sourceKeyTone(source: PublicProviderSource): "success" | "warning" | "neutral" {
  if (source.hasApiKey) return "success";
  if (source.credentials?.some((credential) => credential.type === "account")) return "neutral";
  return "warning";
}

function canWrite(): boolean {
  return settingsWritable() && !providerSaving() && !sourceActionBusy();
}

function SourceCard(props: { source: PublicProviderSource }) {
  const id = props.source.id;
  const selected = () => selectedProviderSourceId() === id;
  const active = () => coreSettings()?.activeSourceId === id;
  const catalog = () => providerCatalogs()[id];
  const catalogState = () => providerCatalogState()[id];
  return (
    <Surface
      variant={selected() ? "soft" : "panel"}
      class={`gap-2.5 p-3 ${active() ? "border-primary-border" : ""}`}
    >
      <Button
        variant="ghost"
        class="w-full items-start justify-start px-0 py-0 text-left"
        onPress={() => void selectProviderSource(id)}
        accessibilityLabel={`Edit provider source ${props.source.label}`}
      >
        <View class="min-w-0 flex-1 gap-1.5">
          <View class="flex-row flex-wrap items-center gap-1.5">
            <Text
              class="text-sm font-bold leading-5 text-foreground"
              style={{ numberOfLines: 1, textOverflow: "ellipsis" }}
            >
              {props.source.label}
            </Text>
            <If when={active()}>
              <Badge tone="primary" label="Active" />
            </If>
            <Badge
              tone={sourceKeyTone(props.source)}
              label={props.source.hasApiKey ? "Key saved" : "No key"}
            />
          </View>
          <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {compactEndpoint(props.source.baseUrl)}
          </Text>
          <Text class={textClasses.dim} style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {protocolTitle(props.source.apiMode)} · {props.source.model || "no model"}
            {catalog() !== undefined ? ` · ${catalog()?.length ?? 0} catalog model(s)` : ""}
          </Text>
        </View>
      </Button>
      <View class="flex-row flex-wrap items-center justify-end gap-2">
        <If when={catalogState()?.error !== undefined}>
          <Text class="flex-1 text-xs leading-4 text-danger-foreground" style={{ numberOfLines: 1, textOverflow: "ellipsis" }}>
            {catalogState()?.error}
          </Text>
        </If>
        <Button
          variant="outline"
          size="sm"
          label={catalogState()?.loading ? "Refreshing…" : "Refresh models"}
          busy={catalogState()?.loading === true}
          disabled={!canWrite() || catalogState()?.loading === true}
          onPress={() => void refreshProviderCatalog(id, true)}
        />
        <If when={!active()}>
          <Button
            variant="soft"
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
    <View class="gap-2.5">
      <If
        when={providerSources().length > 0}
        else={(
          <Surface variant="inset" class="items-center gap-2 px-4 py-6">
            <Text class="text-sm font-semibold leading-5 text-muted-foreground">No provider sources yet</Text>
            <Text class={`${textClasses.dim} text-center`}>
              Add a source with an endpoint, API key and model to configure Forge.
            </Text>
            <Button
              variant="soft"
              size="sm"
              label="Add provider source"
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
    <Surface variant="inset" class="gap-3 px-3 py-3">
      <View class="flex-row flex-wrap items-center justify-between gap-2">
        <View class="gap-0.5">
          <Text class="text-xs font-bold uppercase leading-4 tracking-wider text-dim-foreground">Model catalog</Text>
          <Text class={textClasses.dim}>
            {draft()?.isNew
              ? "Save the source before refreshing its catalog."
              : state()?.loaded
                ? `${models().length} model(s) available${state()?.stale ? " (cached; refresh failed)" : ""}`
                : "Refresh to list models from this endpoint"}
          </Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          label={state()?.loading ? "Refreshing…" : "Refresh"}
          busy={state()?.loading === true}
          disabled={!canWrite() || draft()?.isNew === true || state()?.loading === true}
          onPress={() => void refreshProviderCatalog(id(), true)}
        />
      </View>
      <If when={state()?.error !== undefined}>
        <Text class="text-xs leading-4 text-danger-foreground" role="alert">{state()?.error}</Text>
      </If>
      <If when={items().length > 0}>
        <OptionSelect
          accessibilityLabel="Choose a catalog model"
          items={items()}
          value={selectedValue()}
          placeholder="Choose a catalog model…"
          searchable
          disabled={!canWrite()}
          onChange={(value) => {
            if (value) updateProviderDraft({ model: value });
          }}
        />
      </If>
      <If when={state()?.loaded === true && items().length === 0}>
        <Text class={textClasses.dim}>The provider returned no models. Manual entry is still available.</Text>
      </If>
    </Surface>
  );
}

function ProviderEditor() {
  const draft = () => providerDraft();
  const disabled = () => !canWrite();
  const visibleProblems = () => providerValidation().length ? providerValidation() : (providerDirty() ? providerProblems() : []);
  const endpointError = () => {
    const value = draft()?.baseUrl ?? "";
    return value.trim() ? endpointProblem(value) : "";
  };
  const canSave = () => providerDirty() && providerProblems().length === 0 && canWrite();
  const chosenPreset = () => providerPresets().find((item) => item.id === (draft()?.preset ?? ""));
  const presetItems = () => [
    { value: "", title: "Manual / custom endpoint" },
    ...providerPresets().map((item) => ({ value: item.id, title: item.name })),
  ];
  const regionItems = () => [
    { value: "", title: "Default" },
    ...(chosenPreset()?.regions ?? []).map((item) => ({ value: item.id, title: item.name })),
  ];
  return (
    <If
      when={draft() !== undefined}
      else={(
        <Surface variant="panel" class="items-center gap-2 px-5 py-8">
          <Text class={textClasses.title}>Select or add a provider source</Text>
          <Text class={`${textClasses.small} text-center`}>
            Source configuration is explicit and revision-checked, so concurrent CLI or desktop edits are not silently overwritten.
          </Text>
        </Surface>
      )}
    >
      <Surface variant="panel" class="gap-5 p-5">
        <View class="flex-row flex-wrap items-start justify-between gap-3">
          <View class="min-w-0 flex-1 gap-1">
            <Text class={textClasses.title}>{draft()?.isNew ? "Add provider source" : "Edit provider source"}</Text>
            <Text class={textClasses.small}>
              Keys are write-only and never echoed. Leave the key field blank to keep the saved credential.
            </Text>
          </View>
          <View class="flex-row flex-wrap gap-1.5">
            <If when={!draft()?.isNew}>
              <Badge tone="neutral" label={`revision ${draft()?.revision ?? 0}`} />
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
              description={providerPresetState().error
                ? `Preset list unavailable: ${providerPresetState().error}`
                : "Choosing a preset fills standard endpoints; every endpoint remains editable."}
            >
              <OptionSelect
                accessibilityLabel="Provider preset"
                items={presetItems()}
                value={draft()?.preset ?? ""}
                disabled={disabled()}
                searchable
                placeholder={providerPresetState().loading ? "Loading presets…" : "Choose a preset"}
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
            <Field label="Source name">
              <SettingsInput
                value={draft()?.label ?? ""}
                readonly={disabled()}
                placeholder="OpenAI, Anthropic, local proxy…"
                autoCorrect={false}
                autoCapitalize="words"
                accessibilityLabel="Provider source name"
                onChange={(event) => updateProviderDraft({ label: event.value })}
              />
            </Field>
          </View>
          <View style={{ width: 240, maxWidth: "100%" }}>
            <Field label="Protocol / API mode">
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
          description="A complete HTTP(S) base URL without embedded credentials, query parameters or fragments."
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

        <Field
          label="Model ID"
          description="Manual entry is always supported; after saving, refresh the catalog to choose from provider-reported models."
        >
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
          <Field
            label="API key"
            description={draft()?.canEditKey
              ? `Write-only${draft()?.keyCredentialLabel ? ` · updates ${draft()?.keyCredentialLabel}` : ""}. Blank keeps the saved key.`
              : draft()?.credentialNote ?? "This source's credentials are managed outside this compact editor."}
          >
            <SettingsInput
              value={draft()?.apiKey ?? ""}
              readonly={disabled() || !draft()?.canEditKey || draft()?.clearKey === true}
              masked
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder={draft()?.canEditKey
                ? draft()?.originalHasApiKey
                  ? "Saved key is hidden — enter to replace"
                  : "Enter API key (optional)"
                : "Managed credential — preserved"}
              accessibilityLabel="Provider API key"
              onChange={(event) => updateProviderDraft({ apiKey: event.value, clearKey: false })}
            />
          </Field>
          <If when={draft()?.canEditKey === true && draft()?.originalHasApiKey === true}>
            <Checkbox
              checked={draft()?.clearKey === true}
              disabled={disabled()}
              label="Clear saved key"
              description="Save with an empty credential instead of replacing it."
              onChange={(event) => updateProviderDraft({ clearKey: event.checked, apiKey: event.checked ? "" : draft()?.apiKey ?? "" })}
            />
          </If>
          <If when={draft()?.credentialNote !== undefined}>
            <Surface variant="warning" class="px-3 py-2.5">
              <Text class="text-xs leading-4 text-warning-foreground">{draft()?.credentialNote}</Text>
            </Surface>
          </If>
        </View>

        <View class="flex-row flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <SaveStatusLine status={providerStatus()} idleText={providerDirty() ? "Unsaved provider changes" : "No unsaved provider changes"} />
          <View class="flex-row flex-wrap justify-end gap-2">
            <If when={!draft()?.isNew}>
              <Button
                variant="danger"
                size="sm"
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
            <Button
              variant="primary"
              size="sm"
              label={providerStatus().state === "saving" ? "Saving…" : "Save provider source"}
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
  const active = () => providerSources().find((source) => source.id === coreSettings()?.activeSourceId);
  return (
    <View class="gap-5">
      <If when={coreSettings()?.environmentOverride === true}>
        <Surface variant="warning" class="gap-1 px-4 py-3" role="alert">
          <Text class="text-xs font-bold leading-4 text-warning-foreground">Environment override active</Text>
          <Text class="text-xs leading-4 text-muted-foreground">
            FORGE_BASE_URL, FORGE_MODEL or FORGE_API_KEY is set. Saved provider changes may not affect runtime requests until the override is removed.
          </Text>
        </Surface>
      </If>

      <If when={coreSettings()?.providerSources === undefined}>
        <Surface variant="warning" class="gap-1 px-4 py-3">
          <Text class="text-xs font-bold leading-4 text-warning-foreground">Legacy settings contract</Text>
          <Text class="text-xs leading-4 text-muted-foreground">
            This Core did not report provider sources. The compact source editor is available with the modern Forge Core contract bundled with Forge NSH.
          </Text>
        </Surface>
      </If>

      <SettingsGroup
        title="Provider sources"
        description={active()
          ? `Active: ${active()?.label ?? ""} · ${active()?.model || "no model"} · ${compactEndpoint(active()?.baseUrl ?? "")}`
          : "Endpoints, credentials and models are grouped into explicit sources."}
        actions={(
          <Button
            variant="secondary"
            size="sm"
            label="+ Add source"
            disabled={!canWrite()}
            onPress={startNewProviderSource}
          />
        )}
      >
        <SourceList />
        <SaveStatusLine status={sourceActionStatus()} />
      </SettingsGroup>

      <ProviderEditor />
    </View>
  );
}
