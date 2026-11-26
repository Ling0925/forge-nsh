import { coreSettings, refreshCoreConfig } from "../store";
import { adoptGeneralSettings } from "./general";
import { adoptProviderSettings, refreshProviderPresets } from "./provider";

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
