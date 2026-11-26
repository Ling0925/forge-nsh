import { batch, computed, signal } from "nsh";
import type {
  PermissionPreference,
  PublicSettings,
  ReasoningEffort,
  SettingsPatch,
  ThemePreference,
} from "../protocol";
import { saveSettings } from "../store";
import { errorText } from "../format";
import { idleStatus, parseIntegerOption, type SaveStatus } from "./common";

export interface GeneralDraft {
  theme: ThemePreference;
  defaultPermission: PermissionPreference;
  reasoningEffort: ReasoningEffort;
  requestTimeoutMs: string;
  contextBudgetTokens: string;
  contextBudgetChars: string;
}

export interface GeneralFieldErrors {
  requestTimeoutMs?: string;
  contextBudgetTokens?: string;
  contextBudgetChars?: string;
}

const EMPTY_GENERAL: GeneralDraft = {
  theme: "system",
  defaultPermission: "workspace",
  reasoningEffort: "default",
  requestTimeoutMs: "60000",
  contextBudgetTokens: "",
  contextBudgetChars: "100000",
};

const original = signal<PublicSettings | undefined>();
const baseline = signal<GeneralDraft | undefined>();

export const generalDraft = signal<GeneralDraft>({ ...EMPTY_GENERAL });
export const generalStatus = signal<SaveStatus>(idleStatus);
export const generalValidation = signal<readonly string[]>([]);
export const generalFieldErrors = signal<GeneralFieldErrors>({});
export const generalDirty = computed(() =>
  baseline() !== undefined && JSON.stringify(generalDraft()) !== JSON.stringify(baseline())
);
export const generalLoaded = computed(() => baseline() !== undefined);

function draftFrom(settings: PublicSettings): GeneralDraft {
  return {
    theme: settings.theme ?? "system",
    defaultPermission: settings.defaultPermission ?? "workspace",
    reasoningEffort: settings.reasoningEffort ?? "default",
    requestTimeoutMs: String(settings.requestTimeoutMs),
    contextBudgetTokens: settings.contextBudgetTokens == null ? "" : String(settings.contextBudgetTokens),
    contextBudgetChars: String(settings.contextBudgetChars),
  };
}

/** Adopt authoritative settings unless the user has local unsaved edits. */
export function adoptGeneralSettings(settings: PublicSettings, force = false): boolean {
  if (!force && generalDirty()) return false;
  const next = draftFrom(settings);
  batch(() => {
    original.set(settings);
    baseline.set(next);
    generalDraft.set({ ...next });
    generalValidation.set([]);
    generalFieldErrors.set({});
  });
  return true;
}

export function updateGeneralDraft(patch: Partial<GeneralDraft>): void {
  generalDraft.set({ ...generalDraft(), ...patch });
  generalValidation.set([]);
  generalFieldErrors.set({});
  if (generalStatus().state === "error") generalStatus.set(idleStatus);
}

export function resetGeneralDraft(): void {
  const base = baseline();
  if (!base) return;
  generalDraft.set({ ...base });
  generalValidation.set([]);
  generalFieldErrors.set({});
  generalStatus.set(idleStatus);
}

function validateGeneralDraft(draft: GeneralDraft) {
  const timeout = parseIntegerOption(draft.requestTimeoutMs, "Request timeout", 1000, 600000);
  const budget = parseIntegerOption(draft.contextBudgetTokens, "Context budget", 4096, 10000000, true);
  const chars = parseIntegerOption(draft.contextBudgetChars, "Legacy character budget", 4096, 2000000);
  const fieldErrors: GeneralFieldErrors = {
    ...(timeout.error ? { requestTimeoutMs: timeout.error } : {}),
    ...(budget.error ? { contextBudgetTokens: budget.error } : {}),
    ...(chars.error ? { contextBudgetChars: chars.error } : {}),
  };
  const errors = [timeout.error, budget.error, chars.error].filter((error): error is string => !!error);
  return { timeout, budget, chars, fieldErrors, errors };
}

function buildGeneralPatch(): {
  patch: SettingsPatch;
  errors: readonly string[];
  fieldErrors: GeneralFieldErrors;
} {
  const current = original();
  const draft = generalDraft();
  if (!current) return { patch: {}, errors: ["Settings are not loaded yet."], fieldErrors: {} };

  const { timeout, budget, chars, fieldErrors, errors } = validateGeneralDraft(draft);
  if (errors.length) return { patch: {}, errors, fieldErrors };

  const patch: SettingsPatch = {};
  if (draft.theme !== current.theme) patch.theme = draft.theme;
  if (draft.defaultPermission !== current.defaultPermission) patch.defaultPermission = draft.defaultPermission;
  if (draft.reasoningEffort !== (current.reasoningEffort ?? "default")) patch.reasoningEffort = draft.reasoningEffort;
  if (timeout.value !== current.requestTimeoutMs) patch.requestTimeoutMs = timeout.value!;
  if ((budget.value ?? null) !== (current.contextBudgetTokens ?? null)) patch.contextBudgetTokens = budget.value ?? null;
  if (chars.value !== current.contextBudgetChars) patch.contextBudgetChars = chars.value!;
  return { patch, errors: [], fieldErrors: {} };
}

let savedTimer: number | undefined;

function markSaved(): void {
  if (savedTimer !== undefined) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedTimer = undefined;
    if (generalStatus().state === "saved") generalStatus.set(idleStatus);
  }, 2600);
}

/** Save only fields that changed, leaving unrelated Core settings untouched. */
export async function saveGeneralSettings(): Promise<boolean> {
  if (generalStatus().state === "saving") return false;
  const { patch, errors, fieldErrors } = buildGeneralPatch();
  if (errors.length) {
    generalValidation.set(errors);
    generalFieldErrors.set(fieldErrors);
    generalStatus.set({ state: "error", message: "Check the highlighted values." });
    return false;
  }
  if (!Object.keys(patch).length) {
    generalValidation.set([]);
    generalFieldErrors.set({});
    generalStatus.set(idleStatus);
    return true;
  }
  generalStatus.set({ state: "saving" });
  try {
    const settings = await saveSettings({ settings: patch });
    adoptGeneralSettings(settings, true);
    generalStatus.set({ state: "saved", message: "General settings saved." });
    markSaved();
    return true;
  } catch (error) {
    generalStatus.set({
      state: "error",
      message: `Not saved; your edits are still here. ${errorText(error)}`,
    });
    return false;
  }
}
