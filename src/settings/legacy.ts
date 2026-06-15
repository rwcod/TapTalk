import { getDefaultCloudConfig } from "./cloud-presets";
import { DEFAULT_SETTINGS, ProviderMode, Settings } from "../core/types";
import {
  mergeSettings,
  parsePositiveInteger,
  parseStringArray,
  sanitizeShortcutList
} from "./merge";

type LegacyProviderName = "deapi" | "local-whisper" | "local-faster-whisper" | "groq";

const LEGACY_PROVIDER_NAMES: LegacyProviderName[] = [
  "deapi",
  "local-whisper",
  "local-faster-whisper",
  "groq"
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderMode(value: unknown): value is ProviderMode {
  return value === "local" || value === "cloud";
}

function isLegacyProviderName(value: unknown): value is LegacyProviderName {
  return typeof value === "string" && LEGACY_PROVIDER_NAMES.includes(value as LegacyProviderName);
}

function legacyProviderMode(provider: LegacyProviderName): ProviderMode {
  return provider === "local-faster-whisper" || provider === "local-whisper"
    ? "local"
    : "cloud";
}

function parseLegacyFallbackEnabled(
  value: unknown,
  primaryMode: ProviderMode
): boolean {
  if (!isObject(value) || value.enabled !== true) {
    return false;
  }

  if (!isLegacyProviderName(value.provider)) {
    return false;
  }

  return legacyProviderMode(value.provider) !== primaryMode;
}

function pickLegacyCloudSettings(
  legacy: Record<string, unknown>,
  provider: LegacyProviderName
): Settings["cloud"] {
  if (provider === "groq" && isObject(legacy.groq)) {
    const groq = legacy.groq;
    const base = getDefaultCloudConfig("groq");

    const extraFormFields = { ...base.extraFormFields };
    if (typeof groq.prompt === "string" && groq.prompt.trim().length > 0) {
      extraFormFields.prompt = groq.prompt;
    }
    if (typeof groq.responseFormat === "string" && groq.responseFormat.trim().length > 0) {
      extraFormFields.response_format = groq.responseFormat;
    }
    if (typeof groq.temperature === "number" && Number.isFinite(groq.temperature)) {
      extraFormFields.temperature = String(groq.temperature);
    }

    return {
      ...base,
      url: typeof groq.url === "string" ? groq.url : base.url,
      model: typeof groq.model === "string" ? groq.model : base.model,
      language: typeof groq.language === "string" ? groq.language : base.language,
      textFieldHints: parseStringArray(groq.textFieldHints, base.textFieldHints),
      extraFormFields
    };
  }

  if (provider === "deapi" && isObject(legacy.deapi)) {
    const deapi = legacy.deapi;
    const base = getDefaultCloudConfig("deapi");

    const extraFormFields: Record<string, string> = {
      ...base.extraFormFields
    };
    if (typeof deapi.includeTs === "boolean") {
      extraFormFields.include_ts = String(deapi.includeTs);
    }
    if (typeof deapi.returnResultInResponse === "boolean") {
      extraFormFields.return_result_in_response = String(deapi.returnResultInResponse);
    }

    return {
      ...base,
      url:
        typeof deapi.audiofileUrl === "string"
          ? deapi.audiofileUrl
          : typeof deapi.url === "string"
            ? deapi.url
            : base.url,
      authHeader: "Authorization",
      authValueTemplate: "Bearer {{key}}",
      bodyFormat: "formdata",
      audioFieldName: "audio",
      model:
        typeof deapi.model === "string" && deapi.model.trim().length > 0
          ? deapi.model
          : base.model,
      textFieldHints: parseStringArray(deapi.textFieldHints, base.textFieldHints),
      extraFormFields
    };
  }

  if (isObject(legacy.groq)) {
    return pickLegacyCloudSettings(legacy, "groq");
  }

  return getDefaultCloudConfig("groq");
}

export function migrateLegacySettings(value: unknown): Settings {
  const legacy = isObject(value) ? value : {};
  const provider = isLegacyProviderName(legacy.provider)
    ? legacy.provider
    : "local-faster-whisper";

  const mode = legacyProviderMode(provider);

  const merged = mergeSettings(DEFAULT_SETTINGS, {
    onboardingCompleted: true,
    mode,
    fallback: {
      enabled: parseLegacyFallbackEnabled(legacy.fallback, mode)
    },
    autoPaste:
      typeof legacy.autoPaste === "boolean" ? legacy.autoPaste : DEFAULT_SETTINGS.autoPaste,
    hotkey: isObject(legacy.hotkey)
      ? {
          preferred:
            typeof legacy.hotkey.preferred === "string"
              ? legacy.hotkey.preferred
              : DEFAULT_SETTINGS.hotkey.preferred,
          fallbacks: sanitizeShortcutList(
            legacy.hotkey.fallbacks,
            DEFAULT_SETTINGS.hotkey.fallbacks
          )
        }
      : DEFAULT_SETTINGS.hotkey,
    cloud: pickLegacyCloudSettings(legacy, provider),
    localFasterWhisper: isObject(legacy.localFasterWhisper)
      ? {
          pythonPath:
            typeof legacy.localFasterWhisper.pythonPath === "string"
              ? legacy.localFasterWhisper.pythonPath
              : DEFAULT_SETTINGS.localFasterWhisper.pythonPath,
          model:
            typeof legacy.localFasterWhisper.model === "string"
              ? legacy.localFasterWhisper.model
              : DEFAULT_SETTINGS.localFasterWhisper.model,
          device:
            typeof legacy.localFasterWhisper.device === "string"
              ? legacy.localFasterWhisper.device
              : DEFAULT_SETTINGS.localFasterWhisper.device,
          computeType:
            typeof legacy.localFasterWhisper.computeType === "string"
              ? legacy.localFasterWhisper.computeType
              : DEFAULT_SETTINGS.localFasterWhisper.computeType,
          language:
            typeof legacy.localFasterWhisper.language === "string"
              ? legacy.localFasterWhisper.language
              : DEFAULT_SETTINGS.localFasterWhisper.language,
          beamSize: parsePositiveInteger(
            legacy.localFasterWhisper.beamSize,
            DEFAULT_SETTINGS.localFasterWhisper.beamSize
          ),
          vadFilter:
            typeof legacy.localFasterWhisper.vadFilter === "boolean"
              ? legacy.localFasterWhisper.vadFilter
              : DEFAULT_SETTINGS.localFasterWhisper.vadFilter,
          cpuThreads: parsePositiveInteger(
            legacy.localFasterWhisper.cpuThreads,
            DEFAULT_SETTINGS.localFasterWhisper.cpuThreads
          )
        }
      : DEFAULT_SETTINGS.localFasterWhisper
  });

  if (provider === "local-whisper") {
    merged.localFasterWhisper.model = "small";
  }

  return merged;
}

export function shouldTreatAsLegacySettings(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  if (isProviderMode(value.mode)) {
    return false;
  }

  return isLegacyProviderName(value.provider);
}
