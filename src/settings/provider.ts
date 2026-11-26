import { batch, computed, signal } from "nsh";
import { AlertDialog } from "nsh/base";
import { errorText } from "../format";
import type {
  ModelCatalog,
  ProviderEndpoints,
  ProviderProtocol,
  PublicProviderPreset,
  PublicProviderSource,
  PublicSettings,
} from "../protocol";
import {
  coreSettings,
  listProviderCatalog,
  listProviderPresets,
  saveSettings,
  sessions,
} from "../store";
import { endpointProblem, idleStatus, type SaveStatus } from "./common";
import { adoptGeneralSettings } from "./general";

export interface ProviderDraft {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiMode: ProviderProtocol;
  apiKey: string;
  clearKey: boolean;
  endpoints: ProviderEndpoints;
  preset: string;
  region: string;
  revision?: number;
  isNew: boolean;
  originalBaseUrl: string;
  originalHasApiKey: boolean;
  canEditKey: boolean;
  keyCredentialLabel?: string;
  credentialNote?: string;
}

export interface CatalogState {
  loading: boolean;
  error?: string;
  loaded: boolean;
  stale?: boolean;
  fetchedAt?: string;
}

export const providerDraft = signal<ProviderDraft | undefined>();
export const selectedProviderSourceId = signal<string | undefined>();
export const providerStatus = signal<SaveStatus>(idleStatus);
export const sourceActionStatus = signal<SaveStatus>(idleStatus);
export const providerValidation = signal<readonly string[]>([]);
export const providerCatalogs = signal<Record<string, ModelCatalog>>({});
export const providerCatalogState = signal<Record<string, CatalogState>>({});
export const providerPresets = signal<readonly PublicProviderPreset[]>([]);
export const providerPresetState = signal<CatalogState>({ loading: false, loaded: false });

const providerBaselineSignature = signal<string>("");
const pendingCatalogs = new Map<string, { promise: Promise<boolean>; forced: boolean }>();
let providerSavedTimer: number | undefined;
let actionSavedTimer: number | undefined;

export const providerSources = computed<readonly PublicProviderSource[]>(() =>
  coreSettings()?.providerSources ?? []
);

export const providerDirty = computed(() => {
  const draft = providerDraft();
  return draft !== undefined && draftSignature(draft) !== providerBaselineSignature();
});

export const providerProblems = computed<readonly string[]>(() => {
  const draft = providerDraft();
  return draft ? validateProviderDraft(draft) : [];
});

export const providerSaving = computed(() => providerStatus().state === "saving");
export const sourceActionBusy = computed(() => sourceActionStatus().state === "saving");

function protocolOf(source: PublicProviderSource): ProviderProtocol {
  return source.apiMode ?? "chat-completions";
}

function endpointFor(source: PublicProviderSource, protocol: ProviderProtocol): string {
  return source.endpoints?.[protocol] ?? source.baseUrl;
}

function keyTarget(source: PublicProviderSource): {
  editable: boolean;
  label?: string;
  note?: string;
} {
  const credentials = source.credentials ?? [];
  if (!credentials.length) return { editable: true, label: "default credential" };
  const target = credentials.find((item) => item.id === source.activeCredentialId) ?? credentials[0];
  if (!target) return { editable: false, note: "This source has no editable credential." };
  if (target.type !== "api-key") {
    return {
      editable: false,
      note: `The active credential “${target.label}” is account-based. Existing credentials are preserved; edit them in the full Forge Web UI.`,
    };
  }
  return {
    editable: true,
    label: target.label,
    note: credentials.length > 1
      ? `Only the “${target.label}” API-key credential is changed here; the other ${credentials.length - 1} credential(s) are preserved.`
      : undefined,
  };
}

function draftFromSource(source: PublicProviderSource): ProviderDraft {
  const protocol = protocolOf(source);
  const baseUrl = endpointFor(source, protocol);
  const key = keyTarget(source);
  return {
    id: source.id,
    label: source.label,
    baseUrl,
    model: source.model,
    apiMode: protocol,
    apiKey: "",
    clearKey: false,
    endpoints: { ...(source.endpoints ?? {}) },
    preset: source.preset ?? "",
    region: "",
    revision: source.revision,
    isNew: false,
    originalBaseUrl: baseUrl,
    originalHasApiKey: source.hasApiKey,
    canEditKey: key.editable,
    ...(key.label ? { keyCredentialLabel: key.label } : {}),
    ...(key.note ? { credentialNote: key.note } : {}),
  };
}

function freshSourceId(): string {
  const taken = new Set(providerSources().map((source) => source.id));
  let id = "";
  do {
    const suffix = Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join("");
    id = `source-${suffix}`.slice(0, 32);
  } while (taken.has(id));
  return id;
}

function newSourceDraft(): ProviderDraft {
  return {
    id: freshSourceId(),
    label: "",
    baseUrl: "",
    model: "",
    apiMode: "chat-completions",
    apiKey: "",
    clearKey: false,
    endpoints: {},
    preset: "",
    region: "",
    isNew: true,
    originalBaseUrl: "",
    originalHasApiKey: false,
    canEditKey: true,
    keyCredentialLabel: "default credential",
  };
}

const endpointProtocols: readonly ProviderProtocol[] = ["chat-completions", "responses", "anthropic", "gemini"];

function normalizedEndpoints(draft: ProviderDraft): ProviderEndpoints {
  const endpoints: ProviderEndpoints = {};
  // Fixed key order makes dirty signatures independent of object insertion order.
  for (const protocol of endpointProtocols) {
    const trimmed = draft.endpoints[protocol]?.trim();
    if (trimmed) endpoints[protocol] = trimmed;
  }
  endpoints[draft.apiMode] = draft.baseUrl.trim();
  return endpoints;
}

/** Deliberately omits the secret itself; presence is enough for dirty tracking. */
function draftSignature(draft: ProviderDraft): string {
  return JSON.stringify({
    label: draft.label,
    baseUrl: draft.baseUrl,
    model: draft.model,
    apiMode: draft.apiMode,
    preset: draft.preset,
    endpoints: normalizedEndpoints(draft),
    hasKeyEntry: draft.apiKey.length > 0,
    clearKey: draft.clearKey,
  });
}

function adoptDraft(draft: ProviderDraft): void {
  batch(() => {
    providerDraft.set(draft);
    selectedProviderSourceId.set(draft.id);
    providerBaselineSignature.set(draftSignature(draft));
    providerValidation.set([]);
    providerStatus.set(idleStatus);
  });
}

function validateProviderDraft(draft: ProviderDraft): readonly string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(draft.id)) errors.push("Source id is invalid.");
  if (!draft.label.trim()) errors.push("Source name: enter a name.");
  else if (draft.label.trim().length > 80) errors.push("Source name: keep it at 80 characters or fewer.");
  const endpoint = endpointProblem(draft.baseUrl);
  if (endpoint) errors.push(`API base URL: ${endpoint}`);
  for (const protocol of endpointProtocols) {
    if (protocol === draft.apiMode) continue;
    const extra = draft.endpoints[protocol]?.trim();
    if (!extra) continue;
    const problem = endpointProblem(extra);
    if (problem) errors.push(`Endpoint (${protocol}): ${problem}`);
  }
  if (!draft.model.trim()) errors.push("Model: enter a model ID or choose one from the catalog.");
  else if (draft.model.trim().length > 256) errors.push("Model: keep the ID at 256 characters or fewer.");
  if (/[\r\n\0]/.test(draft.apiKey)) errors.push("API key: line breaks are not allowed.");
  if (draft.apiKey.length > 16384) errors.push("API key: the value is too long.");
  if (!draft.isNew && draft.originalHasApiKey && draft.baseUrl.trim() !== draft.originalBaseUrl && !draft.apiKey && !draft.clearKey) {
    errors.push(
      draft.canEditKey
        ? "API key: because the endpoint changed, enter the key for the new endpoint or choose Clear saved key."
        : "API key: this endpoint change needs credential confirmation, but this source uses advanced credentials. Edit it in the full Forge Web UI.",
    );
  }
  if ((draft.apiKey || draft.clearKey) && !draft.canEditKey) {
    errors.push("API key: advanced account or multi-credential sources are preserved here and cannot be edited.");
  }
  return errors;
}

async function confirmDiscard(): Promise<boolean> {
  const result = await AlertDialog.show({
    title: "Discard provider edits?",
    description: "The unsaved provider changes in this editor will be lost.",
    actions: [
      { id: "stay", label: "Keep editing", role: "cancel" },
      { id: "discard", label: "Discard edits", role: "destructive" },
    ],
    closeOnEscape: true,
    closeOnBackdropPress: true,
  });
  return result.action === "discard";
}

export async function selectProviderSource(id: string | null, ask = true): Promise<void> {
  if (ask && providerDirty() && !(await confirmDiscard())) return;
  if (id === null) {
    adoptDraft(newSourceDraft());
    return;
  }
  const source = providerSources().find((item) => item.id === id);
  if (!source) return;
  adoptDraft(draftFromSource(source));
  if (!providerCatalogs()[source.id] && !pendingCatalogs.has(source.id)) {
    void refreshProviderCatalog(source.id, false);
  }
}

export function startNewProviderSource(): void {
  void selectProviderSource(null);
}

/** Adopt source settings after a reload, without clobbering a dirty editor. */
export function adoptProviderSettings(settings: PublicSettings, force = false): void {
  const sources = settings.providerSources ?? [];
  const current = providerDraft();
  if (!current || (!current.isNew && !sources.some((source) => source.id === current.id))) {
    const preferred = sources.find((source) => source.id === settings.activeSourceId) ?? sources[0];
    if (preferred) {
      adoptDraft(draftFromSource(preferred));
      if (!providerCatalogs()[preferred.id] && !pendingCatalogs.has(preferred.id)) {
        void refreshProviderCatalog(preferred.id, false);
      }
    } else {
      batch(() => {
        if (current && !current.isNew) providerDraft.set(undefined);
        selectedProviderSourceId.set(undefined);
        providerBaselineSignature.set("");
      });
    }
    return;
  }
  if (current.isNew) return;
  const fresh = sources.find((source) => source.id === current.id);
  if (!fresh) return;
  if (force || !providerDirty()) {
    adoptDraft(draftFromSource(fresh));
    return;
  }
  // A dirty editor keeps both its text and the revision it was opened from.
  // If someone else saves meanwhile, Core rejects the later overwrite and the
  // user can reload instead of silently clobbering that other edit.
}

export function updateProviderDraft(patch: Partial<ProviderDraft>): void {
  const current = providerDraft();
  if (!current) return;
  providerDraft.set({ ...current, ...patch });
  providerValidation.set([]);
  if (providerStatus().state === "error") providerStatus.set(idleStatus);
}

export function changeProviderBaseUrl(value: string): void {
  const current = providerDraft();
  if (!current) return;
  const endpoints = { ...current.endpoints, [current.apiMode]: value };
  updateProviderDraft({ baseUrl: value, endpoints });
}

export function changeProviderProtocol(protocol: ProviderProtocol): void {
  const current = providerDraft();
  if (!current) return;
  const endpoints = { ...current.endpoints };
  const trimmed = current.baseUrl.trim();
  if (trimmed && !endpointProblem(trimmed)) endpoints[current.apiMode] = trimmed;
  else delete endpoints[current.apiMode];
  const baseUrl = endpoints[protocol] ?? current.baseUrl;
  const nextTrimmed = baseUrl.trim();
  if (nextTrimmed && !endpointProblem(nextTrimmed)) endpoints[protocol] = nextTrimmed;
  updateProviderDraft({ apiMode: protocol, baseUrl, endpoints });
}

function presetEndpointMap(preset: PublicProviderPreset, regionId: string): ProviderEndpoints {
  const region = regionId ? preset.regions?.find((item) => item.id === regionId) : undefined;
  return { ...preset.endpoints, ...(region?.endpoints ?? {}) };
}

function preferredPresetProtocol(preset: PublicProviderPreset, endpoints: ProviderEndpoints, current: ProviderProtocol): ProviderProtocol {
  // Google's native Gemini adapter is preferred over its OpenAI-compatible shim.
  if (preset.id === "google" && endpoints.gemini?.trim()) return "gemini";
  if (endpoints[current]?.trim()) return current;
  return endpointProtocols.find((protocol) => endpoints[protocol]?.trim()) ?? current;
}

export function selectProviderPreset(presetId: string): void {
  const current = providerDraft();
  if (!current) return;
  if (!presetId) {
    updateProviderDraft({ preset: "", region: "" });
    return;
  }
  const preset = providerPresets().find((item) => item.id === presetId);
  if (!preset) return;
  const endpoints = presetEndpointMap(preset, "");
  const protocol = preferredPresetProtocol(preset, endpoints, current.apiMode);
  updateProviderDraft({
    preset: preset.id,
    region: "",
    endpoints,
    label: current.label.trim() ? current.label : preset.name,
    ...(endpoints[protocol] !== undefined || preset.id === "azure"
      ? { apiMode: protocol, baseUrl: endpoints[protocol] ?? "" }
      : {}),
  });
}

export function selectProviderPresetRegion(regionId: string): void {
  const current = providerDraft();
  const preset = providerPresets().find((item) => item.id === current?.preset);
  if (!current || !preset) return;
  const endpoints = presetEndpointMap(preset, regionId);
  const baseUrl = endpoints[current.apiMode] ?? current.baseUrl;
  if (baseUrl.trim()) endpoints[current.apiMode] = baseUrl;
  updateProviderDraft({ region: regionId, endpoints, baseUrl });
}

let presetRequest: Promise<boolean> | undefined;

export function refreshProviderPresets(refresh = false): Promise<boolean> {
  if (presetRequest) return presetRequest;
  if (!refresh && providerPresetState().loaded) return Promise.resolve(true);
  providerPresetState.set({ ...providerPresetState(), loading: true, error: undefined });
  presetRequest = (async () => {
    try {
      const presets = await listProviderPresets();
      batch(() => {
        providerPresets.set(presets);
        providerPresetState.set({ loading: false, loaded: true });
      });
      return true;
    } catch (error) {
      providerPresetState.set({
        loading: false,
        loaded: providerPresetState().loaded,
        error: errorText(error),
      });
      return false;
    } finally {
      presetRequest = undefined;
    }
  })();
  return presetRequest;
}

export function resetProviderDraft(): void {
  const current = providerDraft();
  if (!current) return;
  if (current.isNew) {
    adoptDraft(newSourceDraft());
    return;
  }
  const source = providerSources().find((item) => item.id === current.id);
  if (source) adoptDraft(draftFromSource(source));
}

function markProviderSaved(): void {
  if (providerSavedTimer !== undefined) clearTimeout(providerSavedTimer);
  providerSavedTimer = setTimeout(() => {
    providerSavedTimer = undefined;
    if (providerStatus().state === "saved") providerStatus.set(idleStatus);
  }, 3000);
}

function markActionSaved(): void {
  if (actionSavedTimer !== undefined) clearTimeout(actionSavedTimer);
  actionSavedTimer = setTimeout(() => {
    actionSavedTimer = undefined;
    if (sourceActionStatus().state === "saved") sourceActionStatus.set(idleStatus);
  }, 3000);
}

function adoptAuthoritativeSettings(settings: PublicSettings, savedSourceId?: string): void {
  adoptGeneralSettings(settings);
  if (savedSourceId) {
    const source = settings.providerSources?.find((item) => item.id === savedSourceId);
    if (source) {
      adoptDraft(draftFromSource(source));
      return;
    }
  }
  adoptProviderSettings(settings);
}

/** Save the visible fields only. Core merges the operation into the stored source,
 * so credentials, connection options, model selection, aliases and routing metadata
 * that this compact editor does not expose remain intact.
 */
export async function saveProviderSource(): Promise<boolean> {
  const draft = providerDraft();
  if (!draft || providerStatus().state === "saving") return false;
  const errors = validateProviderDraft(draft);
  if (errors.length) {
    providerValidation.set(errors);
    providerStatus.set({ state: "error", message: "Check the provider values." });
    return false;
  }
  const endpoints = normalizedEndpoints(draft);
  const operation = {
    type: "save" as const,
    source: {
      id: draft.id,
      label: draft.label.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      apiMode: draft.apiMode,
      ...(draft.preset ? { preset: draft.preset } : {}),
      endpoints,
    },
    ...(draft.revision === undefined ? {} : { expectedRevision: draft.revision }),
    ...(draft.canEditKey && (draft.apiKey || draft.clearKey)
      ? { apiKey: draft.clearKey ? "" : draft.apiKey }
      : {}),
  };
  providerStatus.set({ state: "saving" });
  providerValidation.set([]);
  try {
    const settings = await saveSettings({ source: operation });
    adoptAuthoritativeSettings(settings, draft.id);
    providerStatus.set({ state: "saved", message: "Provider source saved." });
    markProviderSaved();
    void refreshProviderCatalog(draft.id, true);
    return true;
  } catch (error) {
    providerStatus.set({
      state: "error",
      message: `Not saved; your edits are still here. ${errorText(error)}`,
    });
    return false;
  }
}

export async function activateProviderSource(id: string): Promise<boolean> {
  if (sourceActionStatus().state === "saving") return false;
  sourceActionStatus.set({ state: "saving", message: "Activating source…" });
  try {
    const settings = await saveSettings({ source: { type: "activate", id } });
    adoptAuthoritativeSettings(settings);
    sourceActionStatus.set({ state: "saved", message: "Active provider updated." });
    markActionSaved();
    return true;
  } catch (error) {
    sourceActionStatus.set({ state: "error", message: errorText(error) });
    return false;
  }
}

export async function removeProviderSource(id: string): Promise<boolean> {
  const target = providerSources().find((item) => item.id === id);
  if (!target || sourceActionStatus().state === "saving") return false;
  const pinned = sessions().filter((session) => session.providerSourceId === id).map((session) => session.id);
  const confirmation = await AlertDialog.show({
    title: `Delete “${target.label}”?`,
    description: pinned.length
      ? `${pinned.length} session(s) still reference this source. Deleting it cannot be undone, and those sessions will need another provider.`
      : "The endpoint, saved key and model choice for this source will be deleted. This cannot be undone.",
    actions: [
      { id: "cancel", label: "Cancel", role: "cancel" },
      { id: "delete", label: "Delete source", role: "destructive" },
    ],
    closeOnEscape: true,
    closeOnBackdropPress: true,
  });
  if (confirmation.action !== "delete") return false;
  sourceActionStatus.set({ state: "saving", message: "Deleting source…" });
  try {
    const settings = await saveSettings({
      source: {
        type: "remove",
        id,
        ...(pinned.length ? { forgottenSessionIds: pinned } : {}),
      },
    });
    batch(() => {
      if (selectedProviderSourceId() === id) selectedProviderSourceId.set(undefined);
      if (providerDraft()?.id === id) providerDraft.set(undefined);
    });
    adoptAuthoritativeSettings(settings);
    sourceActionStatus.set({ state: "saved", message: "Provider source deleted." });
    markActionSaved();
    return true;
  } catch (error) {
    sourceActionStatus.set({ state: "error", message: errorText(error) });
    return false;
  }
}

/** Load or refresh a source model catalog. Errors never include the API key. */
export function refreshProviderCatalog(sourceId: string, refresh = true): Promise<boolean> {
  const pending = pendingCatalogs.get(sourceId);
  if (pending && (!refresh || pending.forced)) return pending.promise;
  providerCatalogState.set({
    ...providerCatalogState(),
    [sourceId]: { ...(providerCatalogState()[sourceId] ?? { loaded: false }), loading: true, error: undefined },
  });
  const entry: { promise: Promise<boolean>; forced: boolean } = {
    promise: Promise.resolve(false),
    forced: refresh,
  };
  const request = (async () => {
    try {
      const result = await listProviderCatalog(sourceId, refresh);
      batch(() => {
        providerCatalogs.set({ ...providerCatalogs(), [sourceId]: result.models });
        providerCatalogState.set({
          ...providerCatalogState(),
          [sourceId]: {
            loading: false,
            loaded: true,
            stale: result.stale === true,
            ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
            ...(result.error ? { error: result.error } : {}),
          },
        });
      });
      return !result.error;
    } catch (error) {
      const cached = providerCatalogs()[sourceId] !== undefined;
      providerCatalogState.set({
        ...providerCatalogState(),
        [sourceId]: {
          loading: false,
          loaded: cached,
          stale: cached,
          error: errorText(error),
        },
      });
      return false;
    } finally {
      if (pendingCatalogs.get(sourceId) === entry) {
        pendingCatalogs.delete(sourceId);
      }
    }
  })();
  entry.promise = request;
  pendingCatalogs.set(sourceId, entry);
  return request;
}
