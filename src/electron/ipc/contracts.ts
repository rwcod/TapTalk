import type { CloudPresetDefinition } from "../../settings/cloud-presets";
import type {
  LocalRuntimeProbeResult,
  PrepareLocalWhisperInput,
  PrepareLocalWhisperResult,
  PrepareWhisperCppResult,
  WhisperCppProbeResult
} from "../../local/local-runtime";
import type { Settings } from "../../core/types";
import type { TranscriptEntry } from "../../runtime/transcript-history";
import type { VaultEntry } from "../../runtime/vault";
import type { VaultLinkSuggestion } from "../../runtime/vault-links";

export type { VaultEntry, VaultLinkSuggestion };

export type DictationPhase = "idle" | "starting" | "recording" | "transcribing" | "editing" | "thinking";
export type DictationMode = "dictation" | "edit";

export type DictationStatusPayload = {
  phase: DictationPhase;
  dictationMode: DictationMode;
  provider: string;
  message: string;
  hotkeyPreferred: string;
  hotkeyActive: string;
  fnPermissionRequired: boolean;
  lastText?: string;
  recentTranscripts: TranscriptEntry[];
  error?: string;
  appUpdatedFromVersion?: string;
  appVersion?: string;
};

export type PermissionsStatus = {
  accessibility: boolean;
  microphone: "not-determined" | "granted" | "denied" | "restricted";
  fnRequired: boolean;
  fnState:
    | "not-required"
    | "ready"
    | "needs-accessibility"
    | "needs-input-monitoring-or-restart";
  fnListenerReady: boolean;
  fnFailureReason?: string;
};

export type CheckPermissionsOptions = {
  probeFnListener?: boolean;
};

export type IndicatorStatusPayload = {
  phase: "idle" | "recording" | "transcribing" | "editing" | "thinking" | "saved";
  /** Hotkey/control mode: hold, toggle, manual, or none. */
  mode: string;
  /** What the current recording/transformation is for. */
  dictationMode?: DictationMode;
  provider?: string;
  bars?: number[];
  elapsedMs?: number;
  lightMode?: boolean;
  /** Free text shown for transient flashes (e.g. the "saved" phase). */
  label?: string;
};

export interface McpLaunchConfig {
  name: string;
  command: string;
  args: string[];
}

export interface TapTalkBridge {
  getSettings(): Promise<Settings>;
  getCloudPresets(): Promise<Record<string, CloudPresetDefinition>>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  resetOnboarding(): Promise<Settings>;
  probeLocalRuntime(pythonPath?: string, modelName?: string): Promise<LocalRuntimeProbeResult>;
  prepareLocalWhisper(input: PrepareLocalWhisperInput): Promise<PrepareLocalWhisperResult>;
  probeWhisperCpp(modelName?: string): Promise<WhisperCppProbeResult>;
  prepareWhisperCpp(model: string): Promise<PrepareWhisperCppResult>;
  getStatus(): Promise<DictationStatusPayload>;
  startDictation(): Promise<DictationStatusPayload>;
  stopDictation(): Promise<DictationStatusPayload>;
  toggleDictation(): Promise<DictationStatusPayload>;
  clearTranscriptHistory(): Promise<DictationStatusPayload>;
  listVault(): Promise<VaultEntry[]>;
  readVaultBody(file: string): Promise<string | null>;
  suggestVaultLinks(file: string): Promise<VaultLinkSuggestion[]>;
  applyVaultLink(file: string, targetFile: string): Promise<boolean>;
  openVaultEntry(file: string): Promise<void>;
  deleteVaultEntry(file: string): Promise<boolean>;
  revealVault(): Promise<void>;
  openAccessibilitySettings(): Promise<boolean>;
  chooseFolder(): Promise<string | null>;
  getMcpLaunchConfig(vaultPath?: string): Promise<McpLaunchConfig>;
  onStatus(listener: (payload: DictationStatusPayload) => void): () => void;
  findOrInstallPython(): Promise<string>;
  onSetupProgress(listener: (msg: string) => void): () => void;
  checkPermissions(options?: CheckPermissionsOptions): Promise<PermissionsStatus>;
  requestMicrophone(): Promise<boolean>;
  openAccessibility(): Promise<boolean>;
  openInputMonitoring(): Promise<boolean>;
  openMicrophone(): Promise<boolean>;
  refreshPermissionStatus(): Promise<DictationStatusPayload>;
  resizeForView(view: string): Promise<void>;
}

export const IPC_CHANNELS = {
  settingsGet: "settings:get",
  presetsGet: "presets:get",
  settingsUpdate: "settings:update",
  settingsResetOnboarding: "settings:reset-onboarding",

  localProbeRuntime: "local:probe-runtime",
  localPrepareWhisper: "local:prepare-whisper",
  localProbeWhisperCpp: "local:probe-whisper-cpp",
  localPrepareWhisperCpp: "local:prepare-whisper-cpp",
  localFindOrInstallPython: "local:find-or-install-python",

  dictationGetStatus: "dictation:get-status",
  dictationStart: "dictation:start",
  dictationStop: "dictation:stop",
  dictationToggle: "dictation:toggle",

  transcriptsClear: "transcripts:clear",

  vaultList: "vault:list",
  vaultReadBody: "vault:read-body",
  vaultSuggestLinks: "vault:suggest-links",
  vaultApplyLink: "vault:apply-link",
  vaultOpenEntry: "vault:open-entry",
  vaultDelete: "vault:delete",
  vaultReveal: "vault:reveal",

  systemOpenAccessibilitySettings: "system:open-accessibility-settings",
  systemChooseFolder: "system:choose-folder",
  systemMcpLaunchConfig: "system:mcp-launch-config",
  systemCheckPermissions: "system:check-permissions",
  systemRequestMicrophone: "system:request-microphone",
  systemOpenAccessibility: "system:open-accessibility",
  systemOpenInputMonitoring: "system:open-input-monitoring",
  systemOpenMicrophone: "system:open-microphone",
  systemRefreshPermissions: "system:refresh-permissions",

  uiResizeForView: "ui:resize-for-view"
} as const;

export const IPC_EVENTS = {
  dictationStatus: "dictation:status",
  setupProgress: "setup-progress",
  indicatorStatus: "indicator:status"
} as const;
