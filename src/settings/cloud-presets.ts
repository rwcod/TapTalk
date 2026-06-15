import {
  CloudBodyFormat,
  CloudPresetName,
  CloudProviderConfig
} from "../core/types";

export interface CloudPresetDefinition {
  preset: CloudPresetName;
  label: string;
  url: string;
  authHeader: string;
  authValueTemplate: string;
  bodyFormat: CloudBodyFormat;
  audioFieldName: string;
  model: string;
  language: string;
  extraFormFields: Record<string, string>;
  queryParams: Record<string, string>;
  textFieldHints: string[];
}

const DEFAULT_HINTS = ["text", "transcript", "result", "content", "output"];

function sanitizeApiKeys(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const out = Object.create(null) as Record<string, string>;
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
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
    out[key] = rawValue.trim();
  }
  return out;
}

export const CLOUD_PRESETS: Record<CloudPresetName, CloudPresetDefinition> = {
  openai: {
    preset: "openai",
    label: "OpenAI",
    url: "https://api.openai.com/v1/audio/transcriptions",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "formdata",
    audioFieldName: "file",
    model: "whisper-1",
    language: "",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  },
  groq: {
    preset: "groq",
    label: "Groq",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "formdata",
    audioFieldName: "file",
    model: "whisper-large-v3-turbo",
    language: "pl",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  },
  elevenlabs: {
    preset: "elevenlabs",
    label: "ElevenLabs",
    url: "https://api.elevenlabs.io/v1/speech-to-text",
    authHeader: "xi-api-key",
    authValueTemplate: "{{key}}",
    bodyFormat: "formdata",
    audioFieldName: "audio",
    model: "scribe_v1",
    language: "",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  },
  deepgram: {
    preset: "deepgram",
    label: "Deepgram",
    url: "https://api.deepgram.com/v1/listen",
    authHeader: "Authorization",
    authValueTemplate: "Token {{key}}",
    bodyFormat: "binary",
    audioFieldName: "",
    model: "nova-2",
    language: "",
    extraFormFields: {},
    queryParams: {
      model: "{{model}}",
      language: "{{language}}"
    },
    textFieldHints: DEFAULT_HINTS
  },
  huggingface: {
    preset: "huggingface",
    label: "HuggingFace",
    url: "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "binary",
    audioFieldName: "",
    model: "",
    language: "",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  },
  deapi: {
    preset: "deapi",
    label: "deAPI",
    url: "https://api.deapi.ai/api/v1/client/audiofile2txt",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "formdata",
    audioFieldName: "audio",
    model: "WhisperLargeV3",
    language: "",
    extraFormFields: {
      include_ts: "false"
    },
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  },
  custom: {
    preset: "custom",
    label: "Custom",
    url: "",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "formdata",
    audioFieldName: "file",
    model: "",
    language: "",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: DEFAULT_HINTS
  }
};

export function getDefaultCloudConfig(
  preset: CloudPresetName = "groq"
): CloudProviderConfig {
  const source = CLOUD_PRESETS[preset];
  return {
    preset,
    apiKey: "",
    apiKeys: {},
    url: source.url,
    authHeader: source.authHeader,
    authValueTemplate: source.authValueTemplate,
    bodyFormat: source.bodyFormat,
    audioFieldName: source.audioFieldName,
    model: source.model,
    language: source.language,
    extraFormFields: { ...source.extraFormFields },
    queryParams: { ...source.queryParams },
    textFieldHints: [...source.textFieldHints]
  };
}

export function applyPreset(
  current: CloudProviderConfig,
  preset: CloudPresetName
): CloudProviderConfig {
  const base = getDefaultCloudConfig(preset);
  const apiKeys = sanitizeApiKeys(current.apiKeys);
  const currentPreset = current.preset;
  const currentKey = current.apiKey.trim();

  if (currentPreset && currentKey) {
    apiKeys[currentPreset] = currentKey;
  }

  return {
    ...base,
    apiKey: apiKeys[preset] || "",
    apiKeys
  };
}
