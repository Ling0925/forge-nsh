import { Text, View } from "nsh";
import type { PermissionPreference, ReasoningEffort, ThemePreference } from "../../protocol";
import {
  generalDirty,
  generalDraft,
  generalFieldErrors,
  generalLoaded,
  generalStatus,
  generalValidation,
  resetGeneralDraft,
  saveGeneralSettings,
  updateGeneralDraft,
} from "../../settings";
import { settingsWritable } from "../../store";
import { textClasses } from "../../theme";
import { Button } from "../../ui/button";
import { OptionSelect } from "../../ui/select";
import { Surface } from "../../ui/surface";
import { Field, SaveStatusLine, SettingsGroup, SettingsInput, ValidationList } from "./SettingsControls";

const themeOptions: readonly { value: ThemePreference; title: string }[] = [
  { value: "system", title: "System" },
  { value: "light", title: "Light" },
  { value: "dark", title: "Dark" },
];

const reasoningOptions: readonly { value: ReasoningEffort; title: string }[] = [
  { value: "default", title: "Model default" },
  { value: "none", title: "Off" },
  { value: "minimal", title: "Minimal" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
  { value: "xhigh", title: "Extra high" },
  { value: "max", title: "Maximum" },
];

const timeoutPresets = [
  { value: "15000", title: "15s" },
  { value: "30000", title: "30s" },
  { value: "60000", title: "1m" },
  { value: "120000", title: "2m" },
  { value: "300000", title: "5m" },
  { value: "600000", title: "10m" },
] as const;

const permissionOptions: readonly {
  value: PermissionPreference;
  title: string;
  subtitle: string;
  detail: string;
}[] = [
  {
    value: "readonly",
    title: "Read only",
    subtitle: "Inspect and plan",
    detail: "File reads are allowed. Writes and commands are blocked.",
  },
  {
    value: "workspace",
    title: "Workspace",
    subtitle: "Recommended",
    detail: "Workspace writes are allowed. Commands ask for approval.",
  },
  {
    value: "unrestricted",
    title: "Unrestricted",
    subtitle: "High privilege",
    detail: "Commands run directly as this user without per-command approval.",
  },
];

function SegmentedChoice(props: {
  value: string;
  options: readonly { value: string; title: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View
      class="w-fit flex-row flex-wrap gap-1 rounded-(--radius-lg) border border-border-subtle bg-surface-inset p-1"
      role="group"
      accessibilityLabel={props.accessibilityLabel}
    >
      {props.options.map((option) => {
        const active = () => props.value === option.value;
        return (
          <Button
            variant={active() ? "soft" : "ghost"}
            size="sm"
            class="min-w-[64px]"
            label={option.title}
            selected={active()}
            disabled={props.disabled}
            onPress={() => props.onChange(option.value)}
            accessibilityLabel={`${props.accessibilityLabel}: ${option.title}`}
          />
        );
      })}
    </View>
  );
}

function PermissionCards(props: { disabled?: boolean }) {
  return (
    <View class="flex-row flex-wrap gap-2" role="radiogroup" accessibilityLabel="Default permission">
      {permissionOptions.map((option) => {
        const active = () => generalDraft().defaultPermission === option.value;
        return (
          <Button
            variant="outline"
            size="md"
            selected={active()}
            disabled={props.disabled}
            onPress={() => updateGeneralDraft({ defaultPermission: option.value })}
            class={`min-w-[176px] flex-1 items-start justify-start px-3 py-3 text-left ${active() ? "border-primary-border bg-primary-soft" : ""}`}
            accessibilityLabel={`${option.title} permission`}
          >
            <View class="min-w-0 flex-1 gap-1.5">
              <View class="flex-row items-center justify-between gap-2">
                <Text class={`text-sm font-bold leading-5 ${active() ? "text-accent-foreground" : "text-foreground"}`}>
                  {option.title}
                </Text>
                <If when={active()}>
                  <Text class="text-xs font-bold leading-4 text-accent-foreground">✓</Text>
                </If>
              </View>
              <Text class={active() ? "text-xs font-semibold leading-4 text-accent-foreground" : textClasses.dim}>
                {option.subtitle}
              </Text>
              <Text class="text-xs leading-4 text-muted-foreground">{option.detail}</Text>
            </View>
          </Button>
        );
      })}
    </View>
  );
}

export function GeneralSettings() {
  const disabled = () => !generalLoaded() || !settingsWritable() || generalStatus().state === "saving";
  return (
    <View class="gap-5">
      <ValidationList errors={generalValidation()} />

      <SettingsGroup
        title="Appearance"
        description="Stored with Forge Core and shared with other Forge clients. This NSH shell applies it after saving."
      >
        <Field
          label="Theme"
          description="System follows the host appearance; light and dark use this app's token pair."
        >
          <SegmentedChoice
            accessibilityLabel="Theme"
            value={generalDraft().theme}
            options={themeOptions}
            disabled={disabled()}
            onChange={(value) => updateGeneralDraft({ theme: value as ThemePreference })}
          />
        </Field>
      </SettingsGroup>

      <SettingsGroup
        title="Default permission"
        description="Applies to new runs only; it never raises the permission of a run already in progress."
      >
        <PermissionCards disabled={disabled()} />
        <If when={generalDraft().defaultPermission === "unrestricted"}>
          <Surface variant="warning" class="gap-1 px-3 py-2.5">
            <Text class="text-xs font-bold leading-4 text-warning-foreground">High privilege</Text>
            <Text class="text-xs leading-4 text-muted-foreground">
              New runs can write files and execute terminal commands directly as this user, without per-command approval.
            </Text>
          </Surface>
        </If>
      </SettingsGroup>

      <SettingsGroup
        title="Generation"
        description="Provider-independent inference preferences. Per-model behavior can still override them inside Forge Core."
      >
        <View class="gap-4">
          <Field
            label="Reasoning effort"
            description="Used for models that accept a reasoning effort parameter. “Model default” sends no explicit preference."
          >
            <View style={{ width: 280, maxWidth: "100%" }}>
              <OptionSelect
                accessibilityLabel="Reasoning effort"
                items={reasoningOptions}
                value={generalDraft().reasoningEffort}
                disabled={disabled()}
                onChange={(value) => updateGeneralDraft({ reasoningEffort: (value ?? "default") as ReasoningEffort })}
              />
            </View>
          </Field>

          <Field
            label="Idle request timeout"
            description="How long a model stream may stay silent before the request fails. It does not cap total task duration."
            error={generalFieldErrors().requestTimeoutMs}
          >
            <View class="gap-2">
              <SegmentedChoice
                accessibilityLabel="Request timeout presets"
                value={generalDraft().requestTimeoutMs}
                options={timeoutPresets}
                disabled={disabled()}
                onChange={(value) => updateGeneralDraft({ requestTimeoutMs: value })}
              />
              <View class="flex-row items-center gap-2">
                <View style={{ width: 180 }}>
                  <SettingsInput
                    value={generalDraft().requestTimeoutMs}
                    readonly={disabled()}
                    invalid={generalFieldErrors().requestTimeoutMs !== undefined}
                    keyboardType="numeric"
                    autoCorrect={false}
                    autoCapitalize="none"
                    accessibilityLabel="Request timeout in milliseconds"
                    onChange={(event) => updateGeneralDraft({ requestTimeoutMs: event.value })}
                  />
                </View>
                <Text class={textClasses.dim}>ms · 1,000–600,000</Text>
              </View>
            </View>
          </Field>
        </View>
      </SettingsGroup>

      <SettingsGroup
        title="Context"
        description="When the conversation approaches the token budget, Forge compacts earlier context without deleting the transcript."
      >
        <View class="gap-4">
          <Field
            label="Token compression budget"
            description="Leave blank for automatic (about 80% of the model context window). Manual values are capped by the model window."
            error={generalFieldErrors().contextBudgetTokens}
          >
            <View class="flex-row items-center gap-2">
              <View style={{ width: 220 }}>
                <SettingsInput
                  value={generalDraft().contextBudgetTokens}
                  readonly={disabled()}
                  invalid={generalFieldErrors().contextBudgetTokens !== undefined}
                  keyboardType="numeric"
                  autoCorrect={false}
                  autoCapitalize="none"
                  placeholder="Automatic"
                  accessibilityLabel="Token compression budget"
                  onChange={(event) => updateGeneralDraft({ contextBudgetTokens: event.value })}
                />
              </View>
              <Text class={textClasses.dim}>tokens · optional</Text>
            </View>
          </Field>
          <Field
            label="Legacy character fallback"
            description="Used only when no token window is known. Normally this does not need to change."
            error={generalFieldErrors().contextBudgetChars}
          >
            <View class="flex-row items-center gap-2">
              <View style={{ width: 220 }}>
                <SettingsInput
                  value={generalDraft().contextBudgetChars}
                  readonly={disabled()}
                  invalid={generalFieldErrors().contextBudgetChars !== undefined}
                  keyboardType="numeric"
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Legacy character budget"
                  onChange={(event) => updateGeneralDraft({ contextBudgetChars: event.value })}
                />
              </View>
              <Text class={textClasses.dim}>chars · 4,096–2,000,000</Text>
            </View>
          </Field>
        </View>
      </SettingsGroup>

      <Surface variant="soft" class="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
        <SaveStatusLine status={generalStatus()} idleText={generalDirty() ? "Unsaved changes" : "No unsaved changes"} />
        <View class="flex-row flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Reset"
            disabled={!generalDirty() || disabled()}
            onPress={resetGeneralDraft}
          />
          <Button
            variant="primary"
            size="sm"
            label={generalStatus().state === "saving" ? "Saving…" : "Save general settings"}
            busy={generalStatus().state === "saving"}
            disabled={!generalDirty() || disabled()}
            onPress={() => void saveGeneralSettings()}
          />
        </View>
      </Surface>
    </View>
  );
}
