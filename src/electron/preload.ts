import { contextBridge, ipcRenderer } from "electron";
import {
  CheckPermissionsOptions,
  IPC_CHANNELS,
  IPC_EVENTS,
  TapTalkBridge
} from "./ipc/contracts";

const bridge: TapTalkBridge = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  getCloudPresets: () => ipcRenderer.invoke(IPC_CHANNELS.presetsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
  resetOnboarding: () => ipcRenderer.invoke(IPC_CHANNELS.settingsResetOnboarding),
  probeLocalRuntime: (pythonPath, modelName) =>
    ipcRenderer.invoke(IPC_CHANNELS.localProbeRuntime, pythonPath, modelName),
  prepareLocalWhisper: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.localPrepareWhisper, input),
  probeWhisperCpp: (modelName) =>
    ipcRenderer.invoke(IPC_CHANNELS.localProbeWhisperCpp, modelName),
  prepareWhisperCpp: (model) =>
    ipcRenderer.invoke(IPC_CHANNELS.localPrepareWhisperCpp, model),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.dictationGetStatus),
  startDictation: () => ipcRenderer.invoke(IPC_CHANNELS.dictationStart),
  stopDictation: () => ipcRenderer.invoke(IPC_CHANNELS.dictationStop),
  toggleDictation: () => ipcRenderer.invoke(IPC_CHANNELS.dictationToggle),
  clearTranscriptHistory: () => ipcRenderer.invoke(IPC_CHANNELS.transcriptsClear),
  listVault: () => ipcRenderer.invoke(IPC_CHANNELS.vaultList),
  readVaultBody: (file) => ipcRenderer.invoke(IPC_CHANNELS.vaultReadBody, file),
  openVaultEntry: (file) => ipcRenderer.invoke(IPC_CHANNELS.vaultOpenEntry, file),
  deleteVaultEntry: (file) => ipcRenderer.invoke(IPC_CHANNELS.vaultDelete, file),
  revealVault: () => ipcRenderer.invoke(IPC_CHANNELS.vaultReveal),
  openAccessibilitySettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.systemOpenAccessibilitySettings),
  onStatus: (listener) => {
    const wrapped = (_event: unknown, payload: Parameters<typeof listener>[0]) =>
      listener(payload);
    ipcRenderer.on(IPC_EVENTS.dictationStatus, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_EVENTS.dictationStatus, wrapped);
    };
  },
  findOrInstallPython: () => ipcRenderer.invoke(IPC_CHANNELS.localFindOrInstallPython),
  onSetupProgress: (listener) => {
    const wrapped = (_event: unknown, msg: string) => listener(msg);
    ipcRenderer.on(IPC_EVENTS.setupProgress, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_EVENTS.setupProgress, wrapped);
    };
  },
  checkPermissions: (options: CheckPermissionsOptions = {}) =>
    ipcRenderer.invoke(IPC_CHANNELS.systemCheckPermissions, options),
  requestMicrophone: () => ipcRenderer.invoke(IPC_CHANNELS.systemRequestMicrophone),
  openAccessibility: () => ipcRenderer.invoke(IPC_CHANNELS.systemOpenAccessibility),
  openInputMonitoring: () => ipcRenderer.invoke(IPC_CHANNELS.systemOpenInputMonitoring),
  openMicrophone: () => ipcRenderer.invoke(IPC_CHANNELS.systemOpenMicrophone),
  refreshPermissionStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.systemRefreshPermissions),
  notifyWizardCompleted: () => ipcRenderer.invoke(IPC_CHANNELS.wizardCompleted),
  openWizardWindow: () => ipcRenderer.invoke(IPC_CHANNELS.wizardOpen),
  resizeForView: (view: string) => ipcRenderer.invoke(IPC_CHANNELS.uiResizeForView, view)
};

contextBridge.exposeInMainWorld("tapTalk", bridge);
