import { AlertDialog } from "nsh/base";
import { closeSettings, coreSettings, refreshCoreConfig } from "../store";
import { adoptGeneralSettings, generalDirty, resetGeneralDraft } from "./general";
import {
  adoptProviderSettings,
  providerDirty,
  refreshProviderPresets,
  resetProviderDraft,
} from "./provider";

export * from "./common";
export * from "./general";
export * from "./provider";

/** Load the authoritative settings once when the page opens, then seed clean drafts. */
export async function prepareSettingsPage(): Promise<void> {
  const fresh = await refreshCoreConfig();
  if (!fresh) return;
  const settings = coreSettings();
  if (!settings) return;
  adoptGeneralSettings(settings);
  adoptProviderSettings(settings);
  // Presets are helper metadata, not a prerequisite for manual configuration.
  void refreshProviderPresets();
}

/** Seed forms immediately from an already loaded snapshot (used on remount). */
export function seedSettingsFormsFromCache(): void {
  const settings = coreSettings();
  if (!settings) return;
  adoptGeneralSettings(settings);
  adoptProviderSettings(settings);
}

let closingSettings = false;

/** Confirm discarding unsaved edits and clear any typed write-only API key before leaving. */
export async function requestCloseSettings(): Promise<void> {
  if (closingSettings) return;
  if (providerDirty() || generalDirty()) {
    closingSettings = true;
    try {
      const result = await AlertDialog.show({
        title: "Discard unsaved settings?",
        description: "Your unsaved changes will be lost.",
        actions: [
          { id: "stay", label: "Keep editing", role: "cancel" },
          { id: "discard", label: "Discard & leave", role: "destructive" },
        ],
        closeOnEscape: true,
        closeOnBackdropPress: true,
      });
      if (result.action !== "discard") return;
    } finally {
      closingSettings = false;
    }
  }
  resetGeneralDraft();
  resetProviderDraft();
  closeSettings();
}
