import { getDefaultCloudConfig } from "./cloud-presets";
import {
  CloudBodyFormat,
  CloudSecretBackend,
  CloudPresetName,
  DEFAULT_SETTINGS,
  EditProviderKind,
  LocalEngine,
  ProviderMode,
  Settings,
  VaultCaptureDestination,
  VaultKnowledgeSource,
  VaultKnowledgeSourceKind
} from "../core/types";
import { ensureSafeCloudHttpProtocol } from "../core/url-security";
import {
  parsePositiveInteger,
  parseStringArray,
  parseStringMap,
  sanitizeShortcutList
} from "./merge";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// whisper.cpp takes a single language code; drop faster-whisper's "pl+en" suffix.
function whisperCppLanguage(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.localWhisperCpp.language;
  return value.trim().split("+")[0] || DEFAULT_SETTINGS.localWhisperCpp.language;
}

function isProviderMode(value: unknown): value is ProviderMode {
  return value === "local" || value === "cloud";
}

function isLocalEngine(value: unknown): value is LocalEngine {
  return value === "faster-whisper" || value === "whisper-cpp";
}

function isCloudPresetName(value: unknown): value is CloudPresetName {
  return (
    value === "openai" ||
    value === "groq" ||
    value === "elevenlabs" ||
    value === "deepgram" ||
    value === "huggingface" ||
    value === "deapi" ||
    value === "custom"
  );
}

function isLikelyDeapiEndpoint(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const raw = value.trim();
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    return (
      parsed.hostname.toLowerCase() === "api.deapi.ai" &&
      parsed.pathname.toLowerCase().startsWith("/api/v1/client/")
    );
  } catch {
    return false;
  }
}

function isCloudBodyFormat(value: unknown): value is CloudBodyFormat {
  return value === "formdata" || value === "binary";
}

function isCloudSecretBackend(value: unknown): value is CloudSecretBackend {
  return value === "safeStorage" || value === "settings";
}

function isEditProviderKind(value: unknown): value is EditProviderKind {
  return value === "rule-based" || value === "openai-compatible";
}

function isVaultCaptureDestination(value: unknown): value is VaultCaptureDestination {
  return value === "taptalk" || value === "folder";
}

function isVaultKnowledgeSourceKind(value: unknown): value is VaultKnowledgeSourceKind {
  return value === "folder" || value === "obsidian";
}

function pathLabel(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

function sanitizeVaultKnowledgeSources(value: unknown): VaultKnowledgeSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: VaultKnowledgeSource[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (out.length >= 16 || !isObject(raw) || typeof raw.path !== "string") {
      continue;
    }
    const sourcePath = raw.path.trim();
    if (!sourcePath || sourcePath.length > 4096 || seen.has(sourcePath)) {
      continue;
    }
    seen.add(sourcePath);
    const label =
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim().slice(0, 128)
        : pathLabel(sourcePath).slice(0, 128);
    out.push({
      id:
        typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim().slice(0, 128)
          : `source-${index + 1}`,
      label,
      path: sourcePath,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
      kind: isVaultKnowledgeSourceKind(raw.kind) ? raw.kind : "obsidian"
    });
  }
  return out;
}

function normalizeEditEndpoint(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    ensureSafeCloudHttpProtocol(parsed, "settings.editing.endpoint");
    return trimmed;
  } catch {
    return fallback;
  }
}

function migrateCloudSecretBackend(value: unknown): CloudSecretBackend {
  if (value === "keychain") return "safeStorage";
  if (isCloudSecretBackend(value)) return value;
  return DEFAULT_SETTINGS.cloudSecretBackend;
}

function normalizeStoredCloudUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    ensureSafeCloudHttpProtocol(parsed, "settings.cloud.url");
    return trimmed;
  } catch {
    return fallback;
  }
}

export function sanitizeLoadedSettings(value: unknown): Partial<Settings> {
  if (!isObject(value)) {
    return {};
  }

  const out: Partial<Settings> = {};

  if (isProviderMode(value.mode)) {
    out.mode = value.mode;
  }

  if (isLocalEngine(value.localEngine)) {
    out.localEngine = value.localEngine;
  }

  if (typeof value.onboardingCompleted === "boolean") {
    out.onboardingCompleted = value.onboardingCompleted;
  }

  if (typeof value.welcomeShown === "boolean") {
    out.welcomeShown = value.welcomeShown;
  }

  if (typeof value.lastSeenVersion === "string" && value.lastSeenVersion.trim().length > 0) {
    out.lastSeenVersion = value.lastSeenVersion.trim();
  }

  out.cloudSecretBackend = migrateCloudSecretBackend(value.cloudSecretBackend);

  if (isObject(value.hotkey)) {
    out.hotkey = {
      preferred:
        typeof value.hotkey.preferred === "string" && value.hotkey.preferred.trim().length > 0
          ? value.hotkey.preferred.trim()
          : DEFAULT_SETTINGS.hotkey.preferred,
      fallbacks: sanitizeShortcutList(value.hotkey.fallbacks, DEFAULT_SETTINGS.hotkey.fallbacks)
    };
  }

  if (typeof value.autoPaste === "boolean") {
    out.autoPaste = value.autoPaste;
  }

  if (value.theme === "system" || value.theme === "light" || value.theme === "dark") {
    out.theme = value.theme;
  }

  if (typeof value.showIndicator === "boolean") {
    out.showIndicator = value.showIndicator;
  }

  if (typeof value.launchAtLogin === "boolean") {
    out.launchAtLogin = value.launchAtLogin;
  }

  if (isObject(value.fallback)) {
    out.fallback = {
      enabled:
        typeof value.fallback.enabled === "boolean"
          ? value.fallback.enabled
          : DEFAULT_SETTINGS.fallback.enabled
    };
  }

  if (isObject(value.cloud)) {
    const rawPreset = isCloudPresetName(value.cloud.preset)
      ? value.cloud.preset
      : DEFAULT_SETTINGS.cloud.preset;
    const preset =
      rawPreset === "custom" && isLikelyDeapiEndpoint(value.cloud.url)
        ? "deapi"
        : rawPreset;

    const base = getDefaultCloudConfig(preset);
    const parsedExtraFormFields = parseStringMap(value.cloud.extraFormFields, base.extraFormFields);
    const parsedApiKeys = parseStringMap(value.cloud.apiKeys, base.apiKeys);
    const parsedApiKey =
      typeof value.cloud.apiKey === "string" ? value.cloud.apiKey.trim() : base.apiKey;

    if (parsedApiKey && !parsedApiKeys[preset]) {
      parsedApiKeys[preset] = parsedApiKey;
    }

    let parsedModel =
      typeof value.cloud.model === "string" ? value.cloud.model : base.model;

    if (preset === "deapi" && parsedModel.trim().length === 0) {
      parsedModel = base.model;
    }

    if (preset === "deapi" && !Object.hasOwn(parsedExtraFormFields, "include_ts")) {
      parsedExtraFormFields.include_ts = base.extraFormFields.include_ts;
    }

    out.cloud = {
      preset,
      url: normalizeStoredCloudUrl(value.cloud.url, base.url),
      apiKey: parsedApiKeys[preset] ?? parsedApiKey,
      apiKeys: parsedApiKeys,
      authHeader:
        typeof value.cloud.authHeader === "string"
          ? value.cloud.authHeader
          : base.authHeader,
      authValueTemplate:
        typeof value.cloud.authValueTemplate === "string"
          ? value.cloud.authValueTemplate
          : base.authValueTemplate,
      bodyFormat: isCloudBodyFormat(value.cloud.bodyFormat)
        ? value.cloud.bodyFormat
        : base.bodyFormat,
      audioFieldName:
        typeof value.cloud.audioFieldName === "string"
          ? value.cloud.audioFieldName
          : base.audioFieldName,
      model: parsedModel,
      language:
        typeof value.cloud.language === "string" ? value.cloud.language : base.language,
      extraFormFields: parsedExtraFormFields,
      queryParams: parseStringMap(value.cloud.queryParams, base.queryParams),
      textFieldHints: parseStringArray(value.cloud.textFieldHints, base.textFieldHints)
    };
  }

  if (isObject(value.localFasterWhisper)) {
    out.localFasterWhisper = {
      pythonPath:
        typeof value.localFasterWhisper.pythonPath === "string"
          ? value.localFasterWhisper.pythonPath
          : DEFAULT_SETTINGS.localFasterWhisper.pythonPath,
      model:
        typeof value.localFasterWhisper.model === "string"
          ? value.localFasterWhisper.model
          : DEFAULT_SETTINGS.localFasterWhisper.model,
      device:
        typeof value.localFasterWhisper.device === "string"
          ? value.localFasterWhisper.device
          : DEFAULT_SETTINGS.localFasterWhisper.device,
      computeType:
        typeof value.localFasterWhisper.computeType === "string"
          ? value.localFasterWhisper.computeType
          : DEFAULT_SETTINGS.localFasterWhisper.computeType,
      language:
        typeof value.localFasterWhisper.language === "string"
          ? value.localFasterWhisper.language
          : DEFAULT_SETTINGS.localFasterWhisper.language,
      beamSize: parsePositiveInteger(
        value.localFasterWhisper.beamSize,
        DEFAULT_SETTINGS.localFasterWhisper.beamSize
      ),
      vadFilter:
        typeof value.localFasterWhisper.vadFilter === "boolean"
          ? value.localFasterWhisper.vadFilter
          : DEFAULT_SETTINGS.localFasterWhisper.vadFilter,
      cpuThreads: parsePositiveInteger(
        value.localFasterWhisper.cpuThreads,
        DEFAULT_SETTINGS.localFasterWhisper.cpuThreads
      )
    };
  }

  if (isObject(value.localWhisperCpp)) {
    out.localWhisperCpp = {
      binaryPath:
        typeof value.localWhisperCpp.binaryPath === "string"
          ? value.localWhisperCpp.binaryPath
          : DEFAULT_SETTINGS.localWhisperCpp.binaryPath,
      model:
        typeof value.localWhisperCpp.model === "string"
          ? value.localWhisperCpp.model
          : DEFAULT_SETTINGS.localWhisperCpp.model,
      language: whisperCppLanguage(value.localWhisperCpp.language),
      threads: parsePositiveInteger(
        value.localWhisperCpp.threads,
        DEFAULT_SETTINGS.localWhisperCpp.threads
      ),
      useGpu:
        typeof value.localWhisperCpp.useGpu === "boolean"
          ? value.localWhisperCpp.useGpu
          : DEFAULT_SETTINGS.localWhisperCpp.useGpu
    };
  }

  if (isObject(value.recording)) {
    out.recording = {
      commandTemplate:
        typeof value.recording.commandTemplate === "string" &&
        value.recording.commandTemplate.trim().length > 0
          ? value.recording.commandTemplate.trim()
          : DEFAULT_SETTINGS.recording.commandTemplate
    };
  }

  if (isObject(value.editing)) {
    out.editing = {
      enabled:
        typeof value.editing.enabled === "boolean"
          ? value.editing.enabled
          : DEFAULT_SETTINGS.editing.enabled,
      provider: isEditProviderKind(value.editing.provider)
        ? value.editing.provider
        : DEFAULT_SETTINGS.editing.provider,
      endpoint: normalizeEditEndpoint(value.editing.endpoint, DEFAULT_SETTINGS.editing.endpoint),
      model:
        typeof value.editing.model === "string"
          ? value.editing.model.trim()
          : DEFAULT_SETTINGS.editing.model,
      apiKey:
        typeof value.editing.apiKey === "string"
          ? value.editing.apiKey
          : DEFAULT_SETTINGS.editing.apiKey
    };
  }

  if (isObject(value.vault)) {
    out.vault = {
      captureDestination: isVaultCaptureDestination(value.vault.captureDestination)
        ? value.vault.captureDestination
        : DEFAULT_SETTINGS.vault.captureDestination,
      captureFolder:
        typeof value.vault.captureFolder === "string"
          ? value.vault.captureFolder.trim().slice(0, 4096)
          : DEFAULT_SETTINGS.vault.captureFolder,
      includeTapTalkVault:
        typeof value.vault.includeTapTalkVault === "boolean"
          ? value.vault.includeTapTalkVault
          : DEFAULT_SETTINGS.vault.includeTapTalkVault,
      knowledgeSources: sanitizeVaultKnowledgeSources(value.vault.knowledgeSources)
    };
  }

  return out;
}
