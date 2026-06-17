import { BrowserWindow, Menu, Tray, nativeTheme, screen } from "electron";
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
  onRevealVault: () => void;
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
  /** Briefly show the pill with custom text, then hide. For one-shot actions. */
  flashIndicator: (label: string) => void;
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

/** True when the window currently sits on the same display as the cursor. */
function isOnCursorDisplay(win: BrowserWindow): boolean {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = win.getBounds();
  const winDisplay = screen.getDisplayNearestPoint({
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2)
  });
  return cursorDisplay.id === winDisplay.id;
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

    if (!indicatorWindow.isVisible() || !isOnCursorDisplay(indicatorWindow)) {
      options.positionIndicatorWindow(indicatorWindow);
      indicatorWindow.setAlwaysOnTop(true, "screen-saver");
      indicatorWindow.showInactive();
      indicatorWindow.moveTop();
    }
  };

  let flashTimer: NodeJS.Timeout | null = null;
  const flashIndicator = (label: string): void => {
    const win = options.getIndicatorWindow();
    if (!win || win.isDestroyed() || win.webContents.isCrashed() || !options.getShowIndicator()) {
      return;
    }
    win.webContents.send(IPC_EVENTS.indicatorStatus, {
      phase: "saved",
      mode: options.getRecordingMode(),
      dictationMode: "dictation",
      label,
      lightMode: !nativeTheme.shouldUseDarkColors
    });
    if (!win.isVisible() || !isOnCursorDisplay(win)) {
      options.positionIndicatorWindow(win);
      win.setAlwaysOnTop(true, "screen-saver");
      win.showInactive();
      win.moveTop();
    }
    if (flashTimer) {
      clearTimeout(flashTimer);
    }
    flashTimer = setTimeout(() => {
      flashTimer = null;
      // A real dictation phase may have taken over — leave it alone if so.
      if (isIndicatorActivePhase(options.getStatus().phase)) {
        return;
      }
      const current = options.getIndicatorWindow();
      if (current && !current.isDestroyed() && current.isVisible()) {
        current.hide();
      }
    }, 1600);
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
      onRevealVault: options.onRevealVault,
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
    setStatus,
    flashIndicator
  };
}
