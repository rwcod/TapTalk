import { IpcMainInvokeEvent } from "electron";
import { CloudPresetDefinition } from "../../../settings/cloud-presets";
import {
  PrepareLocalWhisperInput,
  PrepareWhisperCppResult,
  WhisperCppProbeResult
} from "../../../local/local-runtime";
import { Settings } from "../../../core/types";
import { DictationStatusPayload, PermissionsStatus } from "../contracts";
import { RecordingControlMode } from "../../main-hotkeys";

export interface RegisterIpcDeps {
  assertTrustedIpcSender: (event: IpcMainInvokeEvent) => void;

  getSettingsCache: () => Settings | null;
  setSettingsCache: (next: Settings) => void;
  readSettings: () => Promise<Settings>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  reloadSettingsAndHotkeys: () => Promise<Settings>;
  sanitizeSettingsPatchFromRenderer: (patch: unknown) => Partial<Settings>;
  getCloudPresets: () => Record<string, CloudPresetDefinition>;

  sanitizeProbePythonPath: (value: unknown, fallback: string) => string;
  probeLocalRuntime: (pythonPath: string, modelName?: string) => Promise<unknown>;
  sanitizePrepareLocalWhisperInput: (value: unknown) => PrepareLocalWhisperInput;
  prepareLocalWhisper: (
    input: PrepareLocalWhisperInput,
    onProgress: (msg: string) => void
  ) => Promise<unknown>;
  probeWhisperCpp: (modelName?: string) => Promise<WhisperCppProbeResult>;
  prepareWhisperCpp: (
    model: string,
    onProgress: (msg: string) => void
  ) => Promise<PrepareWhisperCppResult>;
  findOrInstallPython: (onProgress: (msg: string) => void) => Promise<string>;
  sendSetupProgress: (msg: string) => void;

  getStatus: () => DictationStatusPayload;
  runSerialized: <T>(action: () => Promise<T>) => Promise<T>;
  startDictationWithMode: (
    mode: RecordingControlMode
  ) => Promise<DictationStatusPayload>;
  stopDictationAndResetMode: () => Promise<DictationStatusPayload>;

  clearTranscriptHistory: () => Promise<void>;
  setStatus: (next: Partial<DictationStatusPayload>) => DictationStatusPayload;

  openMacPrivacySettings: () => Promise<void>;
  collectPermissionSnapshot: (rawOptions: unknown) => Promise<PermissionsStatus>;
  askForMicrophoneAccess: () => Promise<boolean>;
  openAccessibilitySettingsUrl: () => Promise<void>;
  openInputMonitoringSettingsUrl: () => Promise<void>;
  openMicrophoneSettingsUrl: () => Promise<void>;
  refreshPermissionsAndStatus: () => Promise<DictationStatusPayload>;

  onWizardCompleted: () => Promise<void> | void;
  onWizardOpenRequested: () => Promise<void> | void;
  resizeMainWindowForView: (view: string) => void;
}
