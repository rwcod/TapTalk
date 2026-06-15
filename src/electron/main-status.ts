import { BrowserWindow, Menu, Tray, nativeTheme } from "electron";
import {
  DictationPhase,
  DictationStatusPayload,
  IndicatorStatusPayload,
  IPC_EVENTS
} from "./ipc/contracts";
import { RecordingControlMode } from "./main-hotkeys";
import {
  buildTrayMenu as buildTrayMenuForState,
  trayImageForCurrentState as trayImageForCurrentStateFromShell
} from "./main-tray";

interface MainStatusControllerOptions {
  indicatorBarCount: number;
  getStatus: () => DictationStatusPayload;
  setStatusRaw: (next: DictationStatusPayload) => void;
  getRecordingMode: () => RecordingControlMode;
  getIndicatorBars: () => number[];
  setIndicatorBars: (next: number[]) => void;
  getMainWindow: () => BrowserWindow | null;
  getIndicatorWindow: () => BrowserWindow | null;
  getShowIndicator: () => boolean;
  getTray: () => Tray | null;
  getTrayIdleIcon: () => Electron.NativeImage | null;
  getTrayActiveIcon: () => Electron.NativeImage | null;
  positionIndicatorWindow: (win: BrowserWindow) => void;
  onPrimaryAction: () => void;
  onShowWindow: () => void;
  onRequestQuit: () => Promise<void>;
  onIndicatorRecoveryNeeded?: (reason: string) => void;
}

export interface MainStatusController {
  resetIndicatorBars: () => void;
  pushIndicatorLevel: (level: number) => void;
  updateIndicatorOverlay: () => void;
  trayImageForCurrentState: () => Electron.NativeImage;
  buildTrayMenu: () => Menu;
  broadcastStatus: () => void;
  setStatus: (next: Partial<DictationStatusPayload>) => DictationStatusPayload;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function isIndicatorActivePhase(phase: DictationPhase): boolean {
  return phase === "recording" || phase === "transcribing" || phase === "editing" || phase === "thinking";
}

function indicatorPhaseForStatus(status: DictationStatusPayload): IndicatorStatusPayload["phase"] {
  if (
    status.phase === "recording" ||
    status.phase === "transcribing" ||
    status.phase === "editing" ||
    status.phase === "thinking"
  ) {
    return status.phase;
  }
  return "idle";
}

export function createMainStatusController(
  options: MainStatusControllerOptions
): MainStatusController {
  const zeroBars = (): number[] => Array.from({ length: options.indicatorBarCount }, () => 0);
  let recordingStartedAt = 0;

  const updateIndicatorOverlay = (): void => {
    const indicatorWindow = options.getIndicatorWindow();
    const status = options.getStatus();

    if (!indicatorWindow || indicatorWindow.isDestroyed()) {
      const shouldShow = isIndicatorActivePhase(status.phase);
      if (shouldShow) {
        options.onIndicatorRecoveryNeeded?.("indicator missing during active phase");
      }
      return;
    }

    if (indicatorWindow.webContents.isCrashed()) {
      options.onIndicatorRecoveryNeeded?.("indicator webContents crashed");
      return;
    }

    const shouldShow = isIndicatorActivePhase(status.phase) && options.getShowIndicator();
    if (!shouldShow) {
      indicatorWindow.webContents.send(IPC_EVENTS.indicatorStatus, {
        phase: "idle",
        mode: options.getRecordingMode(),
        dictationMode: "dictation",
        elapsedMs: 0,
        lightMode: !nativeTheme.shouldUseDarkColors
      });
      if (indicatorWindow.isVisible()) {
        indicatorWindow.hide();
      }
      return;
    }

    const indicatorPhase = indicatorPhaseForStatus(status);
    indicatorWindow.webContents.send(IPC_EVENTS.indicatorStatus, {
      phase: indicatorPhase,
      mode: options.getRecordingMode(),
      dictationMode: status.dictationMode,
      provider: status.provider,
      bars: indicatorPhase === "recording" ? options.getIndicatorBars() : undefined,
      elapsedMs: recordingStartedAt > 0 ? Date.now() - recordingStartedAt : 0,
      lightMode: !nativeTheme.shouldUseDarkColors
    });

    if (!indicatorWindow.isVisible()) {
      options.positionIndicatorWindow(indicatorWindow);
      indicatorWindow.setAlwaysOnTop(true, "screen-saver");
      indicatorWindow.showInactive();
      indicatorWindow.moveTop();
    }
  };

  const trayImageForCurrentState = (): Electron.NativeImage => {
    const status = options.getStatus();
    return trayImageForCurrentStateFromShell({
      statusPhase: status.phase,
      trayIdleIcon: options.getTrayIdleIcon(),
      trayActiveIcon: options.getTrayActiveIcon()
    });
  };

  const buildTrayMenu = (): Menu => {
    return buildTrayMenuForState({
      status: options.getStatus(),
      onPrimaryAction: options.onPrimaryAction,
      onOpenTapTalk: options.onShowWindow,
      onQuit: () => {
        void options.onRequestQuit();
      }
    });
  };

  const broadcastStatus = (): void => {
    const status = options.getStatus();
    const mainWindow = options.getMainWindow();
    const tray = options.getTray();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_EVENTS.dictationStatus, status);
    }

    if (tray) {
      tray.setImage(trayImageForCurrentState());
      tray.setToolTip(`TapTalk: ${status.message}`);
      tray.setContextMenu(buildTrayMenu());
    }

    updateIndicatorOverlay();
  };

  const setStatus = (next: Partial<DictationStatusPayload>): DictationStatusPayload => {
    if (next.phase === "recording" && options.getStatus().phase !== "recording") {
      recordingStartedAt = Date.now();
    } else if (next.phase === "idle") {
      recordingStartedAt = 0;
    }
    const merged = {
      ...options.getStatus(),
      ...next
    };
    options.setStatusRaw(merged);
    broadcastStatus();
    return merged;
  };

  return {
    resetIndicatorBars: () => {
      options.setIndicatorBars(zeroBars());
    },
    pushIndicatorLevel: (level: number) => {
      const normalized = clamp01(level);
      const bars = options.getIndicatorBars();
      options.setIndicatorBars([...bars.slice(1), normalized]);

      if (options.getStatus().phase === "recording") {
        updateIndicatorOverlay();
      }
    },
    updateIndicatorOverlay,
    trayImageForCurrentState,
    buildTrayMenu,
    broadcastStatus,
    setStatus
  };
}
