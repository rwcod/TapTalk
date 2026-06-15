import { Settings } from "../core/types";
import { ensureSafeCloudHttpProtocol } from "../core/url-security";

const MAC_LEGACY_RECORDING_TEMPLATE_SIMPLE =
  'ffmpeg -loglevel error -f avfoundation -i ":0" -ac 1 -ar 16000 -y "{{output}}"';
const MAC_DEFAULT_RECORDING_TEMPLATE_SIMPLE =
  'ffmpeg -loglevel error -f avfoundation -i ":default" -ac 1 -ar 16000 -y "{{output}}"';
const MAC_DEFAULT_RECORDING_TEMPLATE_TEE =
  'ffmpeg -loglevel error -f avfoundation -i ":default" -map 0:a -ac 1 -ar 16000 -c:a pcm_s16le -f tee "[f=wav]{{output}}|[f=s16le]pipe:1"';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeShortcutList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const next = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return next.length > 0 ? next : [...fallback];
}

export function parsePositiveInteger(value: unknown, fallback: number): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  ) {
    return value;
  }

  return fallback;
}

export function parseStringMap(
  value: unknown,
  fallback: Record<string, string>
): Record<string, string> {
  if (!isObject(value)) {
    return { ...fallback };
  }

  const out = Object.create(null) as Record<string, string>;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (
      !key ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor" ||
      typeof rawValue !== "string"
    ) {
      continue;
    }

    out[key] = rawValue;
  }

  return out;
}

export function parseStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const out = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return out.length > 0 ? out : [...fallback];
}

function normalizeCloudUrlForMerge(value: unknown, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = new URL(trimmed);
  ensureSafeCloudHttpProtocol(parsed, "settings.cloud.url");
  return trimmed;
}

function normalizeEditEndpointForMerge(value: unknown, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = new URL(trimmed);
  ensureSafeCloudHttpProtocol(parsed, "settings.editing.endpoint");
  return trimmed;
}

function normalizeRecordingCommandTemplate(value: unknown, fallback: string): string {
  const template =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

  if (process.platform === "darwin") {
    if (
      template === MAC_LEGACY_RECORDING_TEMPLATE_SIMPLE ||
      template === MAC_DEFAULT_RECORDING_TEMPLATE_SIMPLE
    ) {
      return MAC_DEFAULT_RECORDING_TEMPLATE_TEE;
    }
  }

  return template;
}

export function mergeSettings(base: Settings, incoming: Partial<Settings>): Settings {
  const mergedCloudPreset = incoming.cloud?.preset ?? base.cloud.preset;
  const mergedCloudUrl = normalizeCloudUrlForMerge(incoming.cloud?.url, base.cloud.url);
  const mergedCloudApiKeys = parseStringMap(
    incoming.cloud?.apiKeys,
    base.cloud.apiKeys
  );
  const mergedCloudApiKey = (incoming.cloud?.apiKey ?? base.cloud.apiKey).trim();

  if (mergedCloudApiKey) {
    mergedCloudApiKeys[mergedCloudPreset] = mergedCloudApiKey;
  }

  const activeCloudApiKey = mergedCloudApiKeys[mergedCloudPreset] ?? mergedCloudApiKey;

  return {
    onboardingCompleted:
      incoming.onboardingCompleted ?? base.onboardingCompleted,
    welcomeShown: incoming.welcomeShown ?? base.welcomeShown,
    lastSeenVersion: incoming.lastSeenVersion ?? base.lastSeenVersion,
    mode: incoming.mode ?? base.mode,
    localEngine: incoming.localEngine ?? base.localEngine,
    hotkey: {
      preferred:
        typeof incoming.hotkey?.preferred === "string" && incoming.hotkey.preferred.trim().length > 0
          ? incoming.hotkey.preferred.trim()
          : base.hotkey.preferred,
      fallbacks: sanitizeShortcutList(incoming.hotkey?.fallbacks, base.hotkey.fallbacks)
    },
    fallback: {
      enabled: incoming.fallback?.enabled ?? base.fallback.enabled
    },
    autoPaste: incoming.autoPaste ?? base.autoPaste,
    theme: incoming.theme ?? base.theme,
    showIndicator: incoming.showIndicator ?? base.showIndicator,
    launchAtLogin: incoming.launchAtLogin ?? base.launchAtLogin,
    cloudSecretBackend: incoming.cloudSecretBackend ?? base.cloudSecretBackend,
    cloud: {
      preset: mergedCloudPreset,
      url: mergedCloudUrl,
      apiKey: activeCloudApiKey,
      apiKeys: mergedCloudApiKeys,
      authHeader: incoming.cloud?.authHeader ?? base.cloud.authHeader,
      authValueTemplate: incoming.cloud?.authValueTemplate ?? base.cloud.authValueTemplate,
      bodyFormat: incoming.cloud?.bodyFormat ?? base.cloud.bodyFormat,
      audioFieldName: incoming.cloud?.audioFieldName ?? base.cloud.audioFieldName,
      model: incoming.cloud?.model ?? base.cloud.model,
      language: incoming.cloud?.language ?? base.cloud.language,
      extraFormFields: incoming.cloud?.extraFormFields ?? base.cloud.extraFormFields,
      queryParams: incoming.cloud?.queryParams ?? base.cloud.queryParams,
      textFieldHints: incoming.cloud?.textFieldHints ?? base.cloud.textFieldHints
    },
    localFasterWhisper: {
      pythonPath:
        incoming.localFasterWhisper?.pythonPath ?? base.localFasterWhisper.pythonPath,
      model: incoming.localFasterWhisper?.model ?? base.localFasterWhisper.model,
      device: incoming.localFasterWhisper?.device ?? base.localFasterWhisper.device,
      computeType:
        incoming.localFasterWhisper?.computeType ?? base.localFasterWhisper.computeType,
      language:
        incoming.localFasterWhisper?.language ?? base.localFasterWhisper.language,
      beamSize:
        incoming.localFasterWhisper?.beamSize ?? base.localFasterWhisper.beamSize,
      vadFilter:
        incoming.localFasterWhisper?.vadFilter ?? base.localFasterWhisper.vadFilter,
      cpuThreads:
        incoming.localFasterWhisper?.cpuThreads ?? base.localFasterWhisper.cpuThreads
    },
    localWhisperCpp: {
      binaryPath:
        incoming.localWhisperCpp?.binaryPath ?? base.localWhisperCpp.binaryPath,
      model: incoming.localWhisperCpp?.model ?? base.localWhisperCpp.model,
      language: incoming.localWhisperCpp?.language ?? base.localWhisperCpp.language,
      threads: incoming.localWhisperCpp?.threads ?? base.localWhisperCpp.threads,
      useGpu: incoming.localWhisperCpp?.useGpu ?? base.localWhisperCpp.useGpu
    },
    recording: {
      commandTemplate: normalizeRecordingCommandTemplate(
        incoming.recording?.commandTemplate,
        base.recording.commandTemplate
      )
    },
    editing: {
      enabled: incoming.editing?.enabled ?? base.editing.enabled,
      provider: incoming.editing?.provider ?? base.editing.provider,
      endpoint: normalizeEditEndpointForMerge(incoming.editing?.endpoint, base.editing.endpoint),
      model: incoming.editing?.model ?? base.editing.model,
      apiKey: (incoming.editing?.apiKey ?? base.editing.apiKey).trim()
    }
  };
}
