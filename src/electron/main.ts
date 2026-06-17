import {
  app,
  BrowserWindow,
  globalShortcut,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  systemPreferences,
  Tray
} from "electron";
import path from "node:path";
import {
  DictationSessionManager
} from "../runtime/dictation-session";
import { CLOUD_PRESETS } from "../settings/cloud-presets";
import {
  prepareLocalWhisper,
  prepareWhisperCpp,
  probeLocalRuntime,
  probeWhisperCpp
} from "../local/local-runtime";
import { findOrInstallPython } from "../local/python-setup";
import { sanitizeSettingsPatchFromRenderer } from "./ipc/validators/settings";
import {
  sanitizePrepareLocalWhisperInput,
  sanitizeProbePythonPath
} from "./ipc/validators/runtime";
import {
  DictationStatusPayload,
  IPC_EVENTS,
  PermissionsStatus
} from "./ipc/contracts";
import { setSafeStorageProvider } from "../settings/secret-store";
import { getVaultDir } from "../runtime/vault";
import { CaptureDeps, runCapture } from "./main-capture";
import { mkdirSync } from "node:fs";
import { readSettings, updateSettings } from "../settings";
import {
  appendAndSaveTranscript,
  appendRecentTranscript,
  clearTranscriptHistory,
  readTranscriptHistory
} from "../runtime/transcript-history";
import { DEFAULT_SETTINGS, Settings } from "../core/types";
import {
  resolveAssetPath,
  resolveKeyspyServerPath,
  resolvePasteHelperPath,
  resolveUiPath
} from "./main-paths";
import {
  assertTrustedIpcSender,
  hardenWindowNavigation
} from "./main-security";
import {
  createTrayIconFromAppIcon,
  loadAppIcon
} from "./main-tray";
import { requestQuit as requestQuitFlow } from "./main-lifecycle";
import {
  createIndicatorWindow as createIndicatorWindowShell,
  createMainWindow as createMainWindowShell,
  createWizardWindow as createWizardWindowShell,
  positionIndicatorWindow,
  showWindow as showWindowShell
} from "./main-windows";
import {
  fallbackHotkeyCandidates,
  fnRequestedInSettings,
  FnHotkeyManager,
  RecordingControlMode
} from "./main-hotkeys";
import { reloadSettingsAndHotkeys as reloadSettingsAndHotkeysFromModule } from "./main-hotkey-setup";
import { createDictationController } from "./main-dictation";
import {
  collectPermissionSnapshot as collectPermissionSnapshotFromModule,
  parseCheckPermissionsOptions
} from "./main-permissions";
import { registerIpcHandlers } from "./ipc/handlers/register";
import {
  createMainStatusController,
  MainStatusController
} from "./main-status";
import { bootstrapMainProcess } from "./main-bootstrap";
import { mountMainAppShell, prepareSharedProcessUi } from "./main-ready";
import { detectAppUpdate } from "./main-update-detection";
type StatusPayload = DictationStatusPayload;
const INDICATOR_BAR_COUNT = 5;
const TRAY_IDLE_ALPHA = 0.72;
const FORCE_EXIT_TIMEOUT_MS = 3000;
const MAC_ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const MAC_INPUT_MONITORING_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";
const MAC_MICROPHONE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

const dictation = new DictationSessionManager({
  onAudioLevel: (level) => {
    pushIndicatorLevel(level);
  },
  getPasteHelperPath: () => resolvePasteHelperPath(),
  onThinking: () => {
    setStatus({ phase: "thinking", message: "Thinking…" });
  }
});

let mainWindow: BrowserWindow | null = null;
let indicatorWindow: BrowserWindow | null = null;
let wizardWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let mainShellMounted = false;
let trayIdleIcon: Electron.NativeImage | null = null;
let trayActiveIcon: Electron.NativeImage | null = null;
let appIcon: Electron.NativeImage | null = null;
let isQuitting = false;
let forceExitTimer: NodeJS.Timeout | null = null;
let settingsCache: Settings | null = null;

let status: StatusPayload = {
  phase: "idle",
  dictationMode: "dictation",
  provider: "-",
  message: "Ready",
  hotkeyPreferred: "Fn+Space",
  hotkeyActive: "not registered",
  fnPermissionRequired: false,
  recentTranscripts: []
};

let fallbackHotkey = "not registered";
let recordingMode: RecordingControlMode = "none";
let indicatorBars: number[] = Array.from({ length: INDICATOR_BAR_COUNT }, () => 0);
let statusController: MainStatusController;

const captureDeps: CaptureDeps = {
  isIdle: () => status.phase === "idle",
  getPasteHelperPath: () => resolvePasteHelperPath(),
  getEditingConfig: () => (settingsCache ?? DEFAULT_SETTINGS).editing,
  flashPill: (label) => statusController.flashIndicator(label),
  toErrorMessage,
  runSerialized
};
let hotkeyRecoveryTimer: NodeJS.Timeout | null = null;

function requestHotkeyRecovery(reason: string): void {
  if (hotkeyRecoveryTimer) {
    clearTimeout(hotkeyRecoveryTimer);
  }

  hotkeyRecoveryTimer = setTimeout(() => {
    hotkeyRecoveryTimer = null;
    void runSerialized(async () => {
      try {
        await reloadSettingsAndHotkeys();
      } catch (error) {
        console.error(`Failed to recover hotkeys after ${reason}:`, error);
      }
      broadcastStatus();
    });
  }, 450);
}

const hotkeyManager = new FnHotkeyManager({
  resolveKeyspyServerPath,
  toErrorMessage,
  getStatusPhase: () => status.phase,
  getRecordingMode: () => recordingMode,
  runSerialized,
  startWithMode: (mode) => startDictationWithMode(mode),
  stopAndResetMode: () => stopDictationAndResetMode(),
  switchHoldToToggleMode,
  triggerCapture: () => runCapture(captureDeps),
  triggerCancel: () => void runSerialized(() => dictationController.cancelDictation()),
  requestListenerReload: (reason) => requestHotkeyRecovery(reason)
});

const dictationController = createDictationController({
  dictation,
  getStatus: () => status,
  setStatus,
  replaceStatusSilently: (next) => {
    status = next;
  },
  getSettingsCache: () => settingsCache,
  resetIndicatorBars,
  getRecordingMode: () => recordingMode,
  setRecordingMode: (mode) => {
    recordingMode = mode;
  },
  isFnDown: () => hotkeyManager.isFnDown(),
  consumeHoldReleasePendingStop: () => hotkeyManager.consumeHoldReleasePendingStop(),
  clearHoldReleasePendingStop: () => hotkeyManager.clearHoldReleasePendingStop(),
  toErrorMessage,
  appendAndSaveTranscript,
  appendRecentTranscript,
  readTranscriptHistory
});

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resetIndicatorBars(): void {
  statusController.resetIndicatorBars();
}

function pushIndicatorLevel(level: number): void {
  statusController.pushIndicatorLevel(level);
}

async function openMacPrivacySettings(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  await shell.openExternal(MAC_ACCESSIBILITY_SETTINGS_URL);
  await shell.openExternal(MAC_INPUT_MONITORING_SETTINGS_URL);
}

function loadAppIconFromAssets(): Electron.NativeImage | null {
  return loadAppIcon(resolveAssetPath);
}

function updateIndicatorOverlay(): void {
  statusController.updateIndicatorOverlay();
}

function runPrimaryDictationAction(): void {
  void runSerialized(async () => {
    if (status.phase === "idle") {
      return startDictationWithMode("manual");
    }

    if (status.phase === "recording") {
      return stopDictationAndResetMode();
    }

    return status;
  });
}

statusController = createMainStatusController({
  indicatorBarCount: INDICATOR_BAR_COUNT,
  getStatus: () => status,
  setStatusRaw: (next) => {
    status = next;
  },
  getRecordingMode: () => recordingMode,
  getIndicatorBars: () => indicatorBars,
  setIndicatorBars: (next) => {
    indicatorBars = next;
  },
  getMainWindow: () => mainWindow,
  getIndicatorWindow: () => indicatorWindow,
  getShowIndicator: () => settingsCache?.showIndicator !== false,
  getTray: () => tray,
  getTrayIdleIcon: () => trayIdleIcon,
  getTrayActiveIcon: () => trayActiveIcon,
  positionIndicatorWindow,
  onPrimaryAction: runPrimaryDictationAction,
  onShowWindow: showWindow,
  onRevealVault: () => {
    const dir = getVaultDir();
    mkdirSync(dir, { recursive: true });
    void shell.openPath(dir);
  },
  onRequestQuit: requestQuit,
  onIndicatorRecoveryNeeded: recreateIndicatorWindow
});

async function requestQuit(): Promise<void> {
  const next = await requestQuitFlow({
    isQuitting,
    forceExitTimer,
    forceExitTimeoutMs: FORCE_EXIT_TIMEOUT_MS,
    appExit: (code) => app.exit(code),
    appQuit: () => app.quit(),
    runSerialized,
    dictation,
    unregisterAllShortcuts: () => globalShortcut.unregisterAll(),
    disableFnKeyListener,
    resetIndicatorBars,
    tray,
    indicatorWindow,
    mainWindow,
    logError: (message, error) => {
      console.error(message, error);
    }
  });

  isQuitting = next.isQuitting;
  forceExitTimer = next.forceExitTimer;
  tray = next.tray;
}

function broadcastStatus(): void {
  statusController.broadcastStatus();
}

function setStatus(next: Partial<StatusPayload>): StatusPayload {
  return statusController.setStatus(next);
}

function showWindow(): void {
  showWindowShell(mainWindow);
}

function createMainWindow(): BrowserWindow {
  return createMainWindowShell({
    appIcon,
    isQuitting: () => isQuitting,
    hardenWindowNavigation,
    resolveUiPath,
    preloadPath: path.resolve(__dirname, "preload.js"),
    onFocus: () => requestHotkeyRecovery("main window focused")
  });
}

function createIndicatorWindow(): BrowserWindow {
  return createIndicatorWindowShell({
    hardenWindowNavigation,
    resolveUiPath,
    preloadPath: path.resolve(__dirname, "preload-indicator.js"),
    positionIndicatorWindow,
    onDidFinishLoad: updateIndicatorOverlay,
    onRecoveryNeeded: recreateIndicatorWindow
  });
}

function recreateIndicatorWindow(reason: string): void {
  console.warn(`Recreating indicator window: ${reason}`);
  const previous = indicatorWindow;
  indicatorWindow = null;
  if (previous && !previous.isDestroyed()) {
    try { previous.destroy(); } catch (error) { console.error("destroy indicator:", error); }
  }
  indicatorWindow = createIndicatorWindow();
}

function createWizardWindow(): BrowserWindow {
  return createWizardWindowShell({
    appIcon,
    hardenWindowNavigation,
    resolveUiPath,
    preloadPath: path.resolve(__dirname, "preload.js"),
    onClosed: () => {
      wizardWindow = null;
    }
  });
}

function openOrFocusWizardWindow(): void {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    if (wizardWindow.isMinimized()) {
      wizardWindow.restore();
    }
    wizardWindow.show();
    wizardWindow.focus();
    return;
  }
  wizardWindow = createWizardWindow();
}

async function handleWizardCompleted(): Promise<void> {
  const previous = wizardWindow;
  wizardWindow = null;
  if (previous && !previous.isDestroyed()) {
    try {
      previous.close();
    } catch (error) {
      console.error("close wizard window:", error);
    }
  }

  if (!mainShellMounted) {
    try {
      await mountMainShellWithSideEffects();
    } catch (error) {
      console.error("Failed to mount main shell after wizard:", error);
    }
  } else {
    showWindow();
  }
}

function registerFallbackShortcuts(settings: Settings): string {
  globalShortcut.unregisterAll();

  for (const accelerator of fallbackHotkeyCandidates(settings)) {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        void runSerialized(async () => {
          if (status.phase === "idle") {
            return startDictationWithMode("manual");
          }

          if (status.phase === "recording") {
            return stopDictationAndResetMode();
          }

          return status;
        });
      });

      if (ok) {
        return accelerator;
      }
    } catch {
      // invalid accelerator for current platform
    }
  }

  return "not registered";
}

function switchHoldToToggleMode(): StatusPayload {
  if (recordingMode !== "hold" || status.phase !== "recording") {
    return status;
  }

  hotkeyManager.clearHoldReleasePendingStop();
  recordingMode = "toggle";
  return setStatus({
    message: `Recording${recordingModeSuffix()}...`
  });
}

async function enableFnKeyListener(): Promise<boolean> {
  return hotkeyManager.enableListener();
}

function disableFnKeyListener(): void {
  hotkeyManager.disableListener();
}

function recordingModeSuffix(): string {
  if (recordingMode === "hold") {
    return " [hold Fn]";
  }
  if (recordingMode === "toggle") {
    return " [hands-free]";
  }
  return "";
}

async function loadRecentTranscriptsAtStartup(): Promise<void> {
  await dictationController.loadRecentTranscriptsAtStartup();
}

function runSerialized<T>(action: () => Promise<T>): Promise<T> {
  return dictationController.runSerialized(action);
}

async function startDictationWithMode(mode: RecordingControlMode): Promise<StatusPayload> {
  return dictationController.startDictationWithMode(mode);
}

async function stopDictationAndResetMode(): Promise<StatusPayload> {
  return dictationController.stopDictationAndResetMode();
}

async function reloadSettingsAndHotkeys(): Promise<Settings> {
  return reloadSettingsAndHotkeysFromModule({
    readSettings,
    setSettingsCache: (next) => {
      settingsCache = next;
    },
    unregisterAllShortcuts: () => globalShortcut.unregisterAll(),
    disableFnKeyListener,
    registerFallbackShortcuts,
    shouldEnableFnForSettings: fnRequestedInSettings,
    enableFnKeyListener,
    isFnListenerEnabled: () => hotkeyManager.isListenerEnabled(),
    getFnFailureReason: () => hotkeyManager.getFailureReason(),
    getFallbackHotkey: () => fallbackHotkey,
    setFallbackHotkey: (value) => {
      fallbackHotkey = value;
    },
    getStatus: () => status,
    setStatus
  });
}

async function collectPermissionSnapshot(rawOptions: unknown): Promise<PermissionsStatus> {
  const options = parseCheckPermissionsOptions(rawOptions);
  const settings = settingsCache ?? (await readSettings());

  return collectPermissionSnapshotFromModule({
    settings,
    probeFnListener: options.probeFnListener,
    platform: process.platform,
    fnRequestedInSettings,
    isAccessibilityEnabled: () => systemPreferences.isTrustedAccessibilityClient(false),
    getMicrophoneAccessStatus: () => systemPreferences.getMediaAccessStatus("microphone"),
    isFnListenerEnabled: () => hotkeyManager.isListenerEnabled(),
    getFnFailureReason: () => hotkeyManager.getFailureReason(),
    enableFnKeyListener,
    disableFnKeyListener
  });
}

function registerIpc(): void {
  registerIpcHandlers({
    assertTrustedIpcSender,
    getSettingsCache: () => settingsCache,
    setSettingsCache: (next) => {
      settingsCache = next;
    },
    readSettings,
    updateSettings,
    reloadSettingsAndHotkeys,
    sanitizeSettingsPatchFromRenderer,
    getCloudPresets: () => CLOUD_PRESETS,
    sanitizeProbePythonPath,
    probeLocalRuntime,
    sanitizePrepareLocalWhisperInput,
    prepareLocalWhisper,
    probeWhisperCpp,
    prepareWhisperCpp: (model, onProgress) => prepareWhisperCpp({ model }, onProgress),
    findOrInstallPython,
    sendSetupProgress: (msg) => {
      if (wizardWindow && !wizardWindow.isDestroyed()) {
        wizardWindow.webContents.send(IPC_EVENTS.setupProgress, msg);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.setupProgress, msg);
      }
    },
    getStatus: () => status,
    runSerialized,
    startDictationWithMode,
    stopDictationAndResetMode,
    clearTranscriptHistory,
    setStatus,
    openMacPrivacySettings,
    collectPermissionSnapshot,
    askForMicrophoneAccess: () => systemPreferences.askForMediaAccess("microphone"),
    openAccessibilitySettingsUrl: () => shell.openExternal(MAC_ACCESSIBILITY_SETTINGS_URL),
    openInputMonitoringSettingsUrl: () => shell.openExternal(MAC_INPUT_MONITORING_SETTINGS_URL),
    openMicrophoneSettingsUrl: () => shell.openExternal(MAC_MICROPHONE_SETTINGS_URL),
    refreshPermissionsAndStatus: async () => {
      await reloadSettingsAndHotkeys();
      broadcastStatus();
      return status;
    },
    onWizardCompleted: handleWizardCompleted,
    onWizardOpenRequested: openOrFocusWizardWindow,
    resizeMainWindowForView: (view) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const sizes: Record<string, { width: number; height: number }> = {
        dashboard: { width: 744, height: 568 },
        history: { width: 744, height: 568 },
        vault: { width: 880, height: 600 },
        settings: { width: 792, height: 632 },
        wizard: { width: 820, height: 600 }
      };
      const size = sizes[view];
      if (!size) return;

      // Preserve current center on the same display instead of letting macOS
      // anchor the resize to the top-left corner (which can push the window
      // partially off a secondary display and trigger an OS reposition to the
      // primary display).
      const cur = mainWindow.getBounds();
      const display = screen.getDisplayNearestPoint({
        x: cur.x + Math.round(cur.width / 2),
        y: cur.y + Math.round(cur.height / 2)
      });
      const wa = display.workArea;
      const newX = Math.max(wa.x, Math.min(
        wa.x + wa.width - size.width,
        cur.x + Math.round((cur.width - size.width) / 2)
      ));
      const newY = Math.max(wa.y, Math.min(
        wa.y + wa.height - size.height,
        cur.y + Math.round((cur.height - size.height) / 2)
      ));
      mainWindow.setBounds({ x: newX, y: newY, ...size }, true);
    }
  });
}

async function mountMainShellWithSideEffects(): Promise<void> {
  await mountMainAppShell({
    createMainWindow,
    createIndicatorWindow,
    positionIndicatorWindow,
    getIndicatorWindow: () => indicatorWindow,
    setMainWindow: (next) => { mainWindow = next; },
    setIndicatorWindow: (next) => { indicatorWindow = next; },
    setTray: (next) => { tray = next; },
    trayImageForCurrentState: () => statusController.trayImageForCurrentState(),
    buildTrayMenu: () => statusController.buildTrayMenu(),
    showWindow,
    reloadSettingsAndHotkeys,
    broadcastStatus
  });
  mainShellMounted = true;
  showWindow();
}

async function handleAppReady(): Promise<void> {
  setSafeStorageProvider({
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (buf) => safeStorage.decryptString(buf)
  });

  await prepareSharedProcessUi({
    trayIdleAlpha: TRAY_IDLE_ALPHA,
    loadAppIconFromAssets,
    resolveAssetPath,
    createTrayIconFromAppIcon,
    setAppIcon: (next) => { appIcon = next; },
    setTrayIdleIcon: (next) => { trayIdleIcon = next; },
    setTrayActiveIcon: (next) => { trayActiveIcon = next; },
    registerIpc,
    loadRecentTranscriptsAtStartup
  });

  await detectAppUpdate({
    appVersion: app.getVersion(),
    readSettings, getSettingsCache: () => settingsCache, updateSettings, setStatus,
    logError: (m, e) => console.error(m, e)
  });

  await mountMainShellWithSideEffects();
  broadcastStatus();

  if (process.platform === "darwin") {
    powerMonitor.on("resume", () => {
      requestHotkeyRecovery("system resume");
      recreateIndicatorWindow("system resume");
    });
    powerMonitor.on("unlock-screen", () => {
      requestHotkeyRecovery("screen unlock");
      recreateIndicatorWindow("screen unlock");
    });
  }
}

function handleAppWillQuit(): void {
  if (hotkeyRecoveryTimer) {
    clearTimeout(hotkeyRecoveryTimer);
    hotkeyRecoveryTimer = null;
  }
  globalShortcut.unregisterAll();
  disableFnKeyListener();
  resetIndicatorBars();
  void dictation.cancel().catch(() => undefined);
}

bootstrapMainProcess({
  isQuitting: () => isQuitting,
  setIsQuitting: (next) => {
    isQuitting = next;
  },
  requestQuit,
  showWindow,
  onReady: handleAppReady,
  onWillQuit: handleAppWillQuit
});
