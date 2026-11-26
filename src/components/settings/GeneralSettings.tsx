import { horizontalSizeClass, Text, View } from "nsh";
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
import { intentRevealClass, textClasses } from "../../theme";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
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
}[] = [
  { value: "readonly", title: "Read only" },
  { value: "workspace", title: "Workspace" },
  { value: "unrestricted", title: "Unrestricted" },
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
      class="w-fit flex-row flex-wrap gap-1 rounded-(--radius-lg) bg-surface-soft p-1"
      role="group"
      accessibilityLabel={props.accessibilityLabel}
    >
      {props.options.map((option) => {
        const active = () => props.value === option.value;
        return (
          <Button
            variant={active() ? "secondary" : "ghost"}
            size="sm"
            class={`min-w-[64px] ${active() ? "bg-surface-raised font-semibold" : ""}`}
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
    <View class="flex-row flex-wrap gap-3" role="radiogroup" accessibilityLabel="Default permission">
      {permissionOptions.map((option) => {
        const active = () => generalDraft().defaultPermission === option.value;
        return (
          <Button
            variant="outline"
            size="md"
            selected={active()}
            disabled={props.disabled}
            onPress={() => updateGeneralDraft({ defaultPermission: option.value })}
            class={`min-w-[160px] flex-1 items-center justify-between px-4 py-3 ${
              active() ? "border-primary bg-primary-soft" : "border-border bg-surface-soft"
            }`}
            accessibilityLabel={`${option.title} permission`}
          >
            <Text class={`text-[14px] leading-5 ${active() ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
              {option.title}
            </Text>
            <If when={active()}>
              <Icon name="check" tone="accent" />
            </If>
          </Button>
        );
      })}
    </View>
  );
}

export function GeneralSettings() {
  const disabled = () => !generalLoaded() || !settingsWritable() || generalStatus().state === "saving";
  const isRegular = () => horizontalSizeClass() === "regular";
  return (
    <View class="gap-12">
      <ValidationList errors={generalValidation()} />

      <SettingsGroup title="Appearance">
        <Field label="Theme">
          <SegmentedChoice
            accessibilityLabel="Theme"
            value={generalDraft().theme}
            options={themeOptions}
            disabled={disabled()}
            onChange={(value) => updateGeneralDraft({ theme: value as ThemePreference })}
          />
        </Field>
      </SettingsGroup>

      <SettingsGroup title="Default permission">
        <PermissionCards disabled={disabled()} />
        <If when={generalDraft().defaultPermission === "unrestricted"}>
          <Surface variant="danger" class="flex-row items-center gap-3 p-4">
            <Icon name="alert" tone="danger" />
            <Text class="flex-1 text-[14px] leading-5 text-danger-foreground">
              Commands execute without per-command approval.
            </Text>
          </Surface>
        </If>
      </SettingsGroup>

      <SettingsGroup title="Generation">
        <Field label="Reasoning effort">
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
          error={generalFieldErrors().requestTimeoutMs}
        >
          <View class="gap-3">
            <SegmentedChoice
              accessibilityLabel="Request timeout presets"
              value={generalDraft().requestTimeoutMs}
              options={timeoutPresets}
              disabled={disabled()}
              onChange={(value) => updateGeneralDraft({ requestTimeoutMs: value })}
            />
            <View class="flex-row items-center gap-3">
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
              <Text class={textClasses.secondary}>ms</Text>
            </View>
          </View>
        </Field>
      </SettingsGroup>

      <SettingsGroup title="Context">
        <Field
          label="Token compression budget"
          error={generalFieldErrors().contextBudgetTokens}
        >
          <View class="flex-row items-center gap-3">
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
            <Text class={textClasses.secondary}>tokens</Text>
          </View>
        </Field>
        <Field
          label="Character fallback"
          error={generalFieldErrors().contextBudgetChars}
        >
          <View class="flex-row items-center gap-3">
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
            <Text class={textClasses.secondary}>chars</Text>
          </View>
        </Field>
      </SettingsGroup>

      <View class="group flex-row flex-wrap items-center justify-between gap-4 pt-4">
        <SaveStatusLine status={generalStatus()} idleText={generalDirty() ? "Unsaved changes" : ""} />
        <View class="flex-row flex-wrap items-center justify-end gap-3">
          <View class={isRegular() && !generalDirty() ? intentRevealClass : ""}>
            <Button
              variant="outline"
              size="sm"
              label="Reset"
              disabled={!generalDirty() || disabled()}
              onPress={resetGeneralDraft}
            />
          </View>
          <Button
            variant="primary"
            size="md"
            label={generalStatus().state === "saving" ? "Saving…" : "Save"}
            busy={generalStatus().state === "saving"}
            disabled={!generalDirty() || disabled()}
            onPress={() => void saveGeneralSettings()}
          />
        </View>
      </View>
    </View>
  );
}
