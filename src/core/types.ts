export type ProviderMode = "local" | "cloud";

export type LocalEngine = "faster-whisper" | "whisper-cpp";

export type CloudPresetName =
  | "openai"
  | "groq"
  | "elevenlabs"
  | "deepgram"
  | "huggingface"
  | "deapi"
  | "custom";

export type CloudBodyFormat = "formdata" | "binary";
export type CloudSecretBackend = "safeStorage" | "settings";
export type ThemePreference = "system" | "light" | "dark";

export type EditProviderKind = "rule-based" | "openai-compatible";
export type VaultCaptureDestination = "taptalk" | "folder";
export type VaultKnowledgeSourceKind = "folder" | "obsidian";

export interface EditingConfig {
  /** Enable context-aware selected-text editing (no selection still = dictation). */
  enabled: boolean;
  /** Which CommandTransformProvider handles non-trivial edit commands. */
  provider: EditProviderKind;
  /** OpenAI-compatible chat-completions endpoint (e.g. Ollama or OpenAI). */
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface VaultKnowledgeSource {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  kind: VaultKnowledgeSourceKind;
}

export interface VaultConfig {
  captureDestination: VaultCaptureDestination;
  captureFolder: string;
  includeTapTalkVault: boolean;
  knowledgeSources: VaultKnowledgeSource[];
}

export interface LocalWhisperCppConfig {
  /** Path to whisper-cpp binary (auto-resolved from extraResources when empty) */
  binaryPath: string;
  /** GGML model path or short name (e.g. "small", "medium") */
  model: string;
  language: string;
  /** Number of threads for inference */
  threads: number;
  /** Use GPU acceleration (Metal on macOS) */
  useGpu: boolean;
}

export interface CloudProviderConfig {
  preset: CloudPresetName;
  url: string;
  apiKey: string;
  apiKeys: Record<string, string>;
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

export interface Settings {
  onboardingCompleted: boolean;
  welcomeShown?: boolean;
  lastSeenVersion?: string;
  mode: ProviderMode;
  localEngine: LocalEngine;
  hotkey: {
    preferred: string;
    fallbacks: string[];
  };
  fallback: {
    enabled: boolean;
  };
  theme?: ThemePreference;
  showIndicator?: boolean;
  launchAtLogin?: boolean;
  autoPaste: boolean;
  cloudSecretBackend: CloudSecretBackend;
  cloud: CloudProviderConfig;
  localFasterWhisper: {
    pythonPath: string;
    model: string;
    device: string;
    computeType: string;
    language: string;
    beamSize: number;
    vadFilter: boolean;
    cpuThreads: number;
  };
  localWhisperCpp: LocalWhisperCppConfig;
  recording: {
    commandTemplate: string;
  };
  editing: EditingConfig;
  vault: VaultConfig;
}

export const DEFAULT_CLOUD_SECRET_BACKEND: CloudSecretBackend = "settings";

export const DEFAULT_SETTINGS: Settings = {
  onboardingCompleted: false,
  mode: "local",
  localEngine: "whisper-cpp",
  hotkey: {
    preferred: "Fn+Space",
    fallbacks: ["CommandOrControl+Space", "CommandOrControl+Shift+Space"]
  },
  fallback: {
    enabled: false
  },
  autoPaste: true,
  cloudSecretBackend: DEFAULT_CLOUD_SECRET_BACKEND,
  cloud: {
    preset: "groq",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    apiKey: "",
    apiKeys: {},
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{key}}",
    bodyFormat: "formdata",
    audioFieldName: "file",
    model: "whisper-large-v3-turbo",
    language: "pl",
    extraFormFields: {},
    queryParams: {},
    textFieldHints: ["text", "transcript", "result", "content", "output"]
  },
  localFasterWhisper: {
    pythonPath: "python3",
    model: "small",
    device: "cpu",
    computeType: "int8",
    language: "pl",
    beamSize: 1,
    vadFilter: true,
    cpuThreads: 4
  },
  localWhisperCpp: {
    binaryPath: "",
    model: "small",
    language: "pl",
    threads: 4,
    useGpu: true,
  },
  recording: {
    commandTemplate:
      'ffmpeg -loglevel error -f avfoundation -i ":default" -map 0:a -ac 1 -ar 16000 -c:a pcm_s16le -f tee "[f=wav]{{output}}|[f=s16le]pipe:1"'
  },
  editing: {
    enabled: true,
    provider: "rule-based",
    endpoint: "",
    model: "",
    apiKey: ""
  },
  vault: {
    captureDestination: "taptalk",
    captureFolder: "",
    includeTapTalkVault: true,
    knowledgeSources: []
  }
};
