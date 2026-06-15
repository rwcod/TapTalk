import {
  CloudBodyFormat,
  CloudPresetName,
  CloudSecretBackend,
  EditProviderKind,
  LocalEngine,
  ProviderMode,
  Settings
} from "../../../core/types";
import { ensureSafeCloudHttpProtocol } from "../../../core/url-security";
import {
  asRecord,
  toOptionalPositiveInt,
  toOptionalStringArray,
  toOptionalStringMap,
  toOptionalTrimmedString
} from "./primitives";

const TOP_LEVEL_SETTINGS_FIELDS = new Set([
  "onboardingCompleted",
  "welcomeShown",
  "lastSeenVersion",
  "mode",
  "hotkey",
  "fallback",
  "theme",
  "showIndicator",
  "launchAtLogin",
  "autoPaste",
  "cloudSecretBackend",
  "cloud",
  "localFasterWhisper",
  "localWhisperCpp",
  "localEngine",
  "editing"
]);

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

function isCloudBodyFormat(value: unknown): value is CloudBodyFormat {
  return value === "formdata" || value === "binary";
}

function isCloudSecretBackend(value: unknown): value is CloudSecretBackend {
  return value === "safeStorage" || value === "settings";
}

function isEditProviderKind(value: unknown): value is EditProviderKind {
  return value === "rule-based" || value === "openai-compatible";
}

function sanitizeEditingPatch(value: unknown): Partial<Settings["editing"]> {
  const editing = asRecord(value);
  const out: Partial<Settings["editing"]> = {};

  if (editing.enabled !== undefined) {
    if (typeof editing.enabled !== "boolean") {
      throw new Error("Invalid editing.enabled value.");
    }
    out.enabled = editing.enabled;
  }

  if (editing.provider !== undefined) {
    if (!isEditProviderKind(editing.provider)) {
      throw new Error("Invalid editing.provider value.");
    }
    out.provider = editing.provider;
  }

  const endpoint = toOptionalTrimmedString(editing.endpoint, "editing.endpoint", {
    maxLength: 2048,
    allowEmpty: true
  });
  if (endpoint !== undefined) {
    if (endpoint) {
      let parsed: URL;
      try {
        parsed = new URL(endpoint);
      } catch {
        throw new Error("Invalid editing.endpoint: invalid URL.");
      }
      ensureSafeCloudHttpProtocol(parsed, "editing.endpoint");
    }
    out.endpoint = endpoint;
  }

  const model = toOptionalTrimmedString(editing.model, "editing.model", {
    maxLength: 256,
    allowEmpty: true
  });
  if (model !== undefined) {
    out.model = model;
  }

  const apiKey = toOptionalTrimmedString(editing.apiKey, "editing.apiKey", {
    maxLength: 2048,
    allowEmpty: true
  });
  if (apiKey !== undefined) {
    out.apiKey = apiKey;
  }

  return out;
}

function sanitizeCloudPatch(value: unknown): Partial<Settings["cloud"]> {
  const cloud = asRecord(value);
  const out: Partial<Settings["cloud"]> = {};

  if (cloud.preset !== undefined) {
    if (!isCloudPresetName(cloud.preset)) {
      throw new Error("Invalid cloud.preset.");
    }
    out.preset = cloud.preset;
  }

  const url = toOptionalTrimmedString(cloud.url, "cloud.url", {
    maxLength: 2048,
    allowEmpty: true
  });
  if (url !== undefined) {
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("Invalid cloud.url: invalid URL.");
      }
      ensureSafeCloudHttpProtocol(parsed, "cloud.url");
    }
    out.url = url;
  }

  const apiKey = toOptionalTrimmedString(cloud.apiKey, "cloud.apiKey", {
    maxLength: 2048,
    allowEmpty: true
  });
  if (apiKey !== undefined) {
    out.apiKey = apiKey;
  }

  const apiKeys = toOptionalStringMap(cloud.apiKeys, "cloud.apiKeys", {
    maxEntries: 32,
    maxKeyLength: 64,
    maxValueLength: 2048
  });
  if (apiKeys !== undefined) {
    out.apiKeys = apiKeys;
  }

  const authHeader = toOptionalTrimmedString(cloud.authHeader, "cloud.authHeader", {
    maxLength: 128,
    allowEmpty: true
  });
  if (authHeader !== undefined) {
    out.authHeader = authHeader;
  }

  const authValueTemplate = toOptionalTrimmedString(
    cloud.authValueTemplate,
    "cloud.authValueTemplate",
    { maxLength: 1024, allowEmpty: true }
  );
  if (authValueTemplate !== undefined) {
    out.authValueTemplate = authValueTemplate;
  }

  if (cloud.bodyFormat !== undefined) {
    if (!isCloudBodyFormat(cloud.bodyFormat)) {
      throw new Error("Invalid cloud.bodyFormat.");
    }
    out.bodyFormat = cloud.bodyFormat;
  }

  const audioFieldName = toOptionalTrimmedString(cloud.audioFieldName, "cloud.audioFieldName", {
    maxLength: 128,
    allowEmpty: true
  });
  if (audioFieldName !== undefined) {
    out.audioFieldName = audioFieldName;
  }

  const model = toOptionalTrimmedString(cloud.model, "cloud.model", {
    maxLength: 256,
    allowEmpty: true
  });
  if (model !== undefined) {
    out.model = model;
  }

  const language = toOptionalTrimmedString(cloud.language, "cloud.language", {
    maxLength: 64,
    allowEmpty: true
  });
  if (language !== undefined) {
    out.language = language;
  }

  const extraFormFields = toOptionalStringMap(cloud.extraFormFields, "cloud.extraFormFields", {
    maxEntries: 64,
    maxKeyLength: 64,
    maxValueLength: 512
  });
  if (extraFormFields !== undefined) {
    out.extraFormFields = extraFormFields;
  }

  const queryParams = toOptionalStringMap(cloud.queryParams, "cloud.queryParams", {
    maxEntries: 64,
    maxKeyLength: 64,
    maxValueLength: 512
  });
  if (queryParams !== undefined) {
    out.queryParams = queryParams;
  }

  const textFieldHints = toOptionalStringArray(cloud.textFieldHints, "cloud.textFieldHints", {
    maxItems: 32,
    maxLength: 64
  });
  if (textFieldHints !== undefined) {
    out.textFieldHints = textFieldHints;
  }

  return out;
}

function sanitizeLocalFasterWhisperPatch(
  value: unknown
): Partial<Settings["localFasterWhisper"]> {
  const local = asRecord(value);
  const out: Partial<Settings["localFasterWhisper"]> = {};

  const pythonPath = toOptionalTrimmedString(local.pythonPath, "localFasterWhisper.pythonPath", {
    maxLength: 1024
  });
  if (pythonPath !== undefined) {
    out.pythonPath = pythonPath;
  }

  const model = toOptionalTrimmedString(local.model, "localFasterWhisper.model", {
    maxLength: 256
  });
  if (model !== undefined) {
    out.model = model;
  }

  const device = toOptionalTrimmedString(local.device, "localFasterWhisper.device", {
    maxLength: 64
  });
  if (device !== undefined) {
    out.device = device;
  }

  const computeType = toOptionalTrimmedString(
    local.computeType,
    "localFasterWhisper.computeType",
    { maxLength: 64 }
  );
  if (computeType !== undefined) {
    out.computeType = computeType;
  }

  const language = toOptionalTrimmedString(local.language, "localFasterWhisper.language", {
    maxLength: 64,
    allowEmpty: true
  });
  if (language !== undefined) {
    out.language = language;
  }

  const beamSize = toOptionalPositiveInt(local.beamSize, "localFasterWhisper.beamSize", {
    min: 1,
    max: 32
  });
  if (beamSize !== undefined) {
    out.beamSize = beamSize;
  }

  if (local.vadFilter !== undefined) {
    if (typeof local.vadFilter !== "boolean") {
      throw new Error("Invalid localFasterWhisper.vadFilter.");
    }
    out.vadFilter = local.vadFilter;
  }

  const cpuThreads = toOptionalPositiveInt(
    local.cpuThreads,
    "localFasterWhisper.cpuThreads",
    {
      min: 1,
      max: 128
    }
  );
  if (cpuThreads !== undefined) {
    out.cpuThreads = cpuThreads;
  }

  return out;
}

function sanitizeLocalWhisperCppPatch(
  value: unknown
): Partial<Settings["localWhisperCpp"]> {
  const local = asRecord(value);
  const out: Partial<Settings["localWhisperCpp"]> = {};

  const binaryPath = toOptionalTrimmedString(local.binaryPath, "localWhisperCpp.binaryPath", {
    maxLength: 1024,
    allowEmpty: true
  });
  if (binaryPath !== undefined) {
    out.binaryPath = binaryPath;
  }

  const model = toOptionalTrimmedString(local.model, "localWhisperCpp.model", {
    maxLength: 256
  });
  if (model !== undefined) {
    out.model = model;
  }

  const language = toOptionalTrimmedString(local.language, "localWhisperCpp.language", {
    maxLength: 64,
    allowEmpty: true
  });
  if (language !== undefined) {
    out.language = language;
  }

  const threads = toOptionalPositiveInt(local.threads, "localWhisperCpp.threads", {
    min: 1,
    max: 128
  });
  if (threads !== undefined) {
    out.threads = threads;
  }

  if (local.useGpu !== undefined) {
    if (typeof local.useGpu !== "boolean") {
      throw new Error("Invalid localWhisperCpp.useGpu.");
    }
    out.useGpu = local.useGpu;
  }

  return out;
}

export function sanitizeSettingsPatchFromRenderer(value: unknown): Partial<Settings> {
  const patch = asRecord(value);
  const out: Partial<Settings> = {};

  for (const key of Object.keys(patch)) {
    if (!TOP_LEVEL_SETTINGS_FIELDS.has(key)) {
      throw new Error(`Unsupported settings field: ${key}`);
    }
  }

  if (patch.onboardingCompleted !== undefined) {
    if (typeof patch.onboardingCompleted !== "boolean") {
      throw new Error("Invalid onboardingCompleted value.");
    }
    out.onboardingCompleted = patch.onboardingCompleted;
  }

  if (patch.welcomeShown !== undefined) {
    if (typeof patch.welcomeShown !== "boolean") {
      throw new Error("Invalid welcomeShown value.");
    }
    out.welcomeShown = patch.welcomeShown;
  }

  if (patch.lastSeenVersion !== undefined) {
    const trimmed = toOptionalTrimmedString(patch.lastSeenVersion, "lastSeenVersion", {
      maxLength: 64
    });
    if (trimmed !== undefined) {
      out.lastSeenVersion = trimmed;
    }
  }

  if (patch.mode !== undefined) {
    if (!isProviderMode(patch.mode)) {
      throw new Error("Invalid mode value.");
    }
    out.mode = patch.mode;
  }

  if (patch.localEngine !== undefined) {
    if (!isLocalEngine(patch.localEngine)) {
      throw new Error("Invalid localEngine value.");
    }
    out.localEngine = patch.localEngine;
  }

  if (patch.hotkey !== undefined) {
    const hotkey = asRecord(patch.hotkey);
    const hotkeyPatch: Partial<Settings["hotkey"]> = {};

    const preferred = toOptionalTrimmedString(hotkey.preferred, "hotkey.preferred", {
      maxLength: 128
    });
    if (preferred !== undefined) {
      hotkeyPatch.preferred = preferred;
    }

    const fallbacks = toOptionalStringArray(hotkey.fallbacks, "hotkey.fallbacks", {
      maxItems: 16,
      maxLength: 128
    });
    if (fallbacks !== undefined) {
      hotkeyPatch.fallbacks = fallbacks;
    }

    out.hotkey = hotkeyPatch as Settings["hotkey"];
  }

  if (patch.fallback !== undefined) {
    const fallback = asRecord(patch.fallback);
    if (typeof fallback.enabled !== "boolean") {
      throw new Error("Invalid fallback.enabled value.");
    }
    out.fallback = { enabled: fallback.enabled };
  }

  if (patch.theme !== undefined) {
    if (patch.theme !== "system" && patch.theme !== "light" && patch.theme !== "dark") {
      throw new Error("Invalid theme value.");
    }
    out.theme = patch.theme;
  }

  if (patch.showIndicator !== undefined) {
    if (typeof patch.showIndicator !== "boolean") {
      throw new Error("Invalid showIndicator value.");
    }
    out.showIndicator = patch.showIndicator;
  }

  if (patch.launchAtLogin !== undefined) {
    if (typeof patch.launchAtLogin !== "boolean") {
      throw new Error("Invalid launchAtLogin value.");
    }
    out.launchAtLogin = patch.launchAtLogin;
  }

  if (patch.autoPaste !== undefined) {
    if (typeof patch.autoPaste !== "boolean") {
      throw new Error("Invalid autoPaste value.");
    }
    out.autoPaste = patch.autoPaste;
  }

  if (patch.cloudSecretBackend !== undefined) {
    if (!isCloudSecretBackend(patch.cloudSecretBackend)) {
      throw new Error("Invalid cloudSecretBackend value.");
    }
    out.cloudSecretBackend = patch.cloudSecretBackend;
  }

  if (patch.cloud !== undefined) {
    out.cloud = sanitizeCloudPatch(patch.cloud) as Settings["cloud"];
  }

  if (patch.localFasterWhisper !== undefined) {
    out.localFasterWhisper = sanitizeLocalFasterWhisperPatch(
      patch.localFasterWhisper
    ) as Settings["localFasterWhisper"];
  }

  if (patch.localWhisperCpp !== undefined) {
    out.localWhisperCpp = sanitizeLocalWhisperCppPatch(
      patch.localWhisperCpp
    ) as Settings["localWhisperCpp"];
  }

  if (patch.editing !== undefined) {
    out.editing = sanitizeEditingPatch(patch.editing) as Settings["editing"];
  }

  return out;
}
