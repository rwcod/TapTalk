import { BrowserWindow, Tray } from "electron";
import { DictationSessionManager } from "../runtime/dictation-session";

interface RequestQuitOptions {
  isQuitting: boolean;
  forceExitTimer: NodeJS.Timeout | null;
  forceExitTimeoutMs: number;
  appExit: (code: number) => void;
  appQuit: () => void;
  runSerialized: <T>(action: () => Promise<T>) => Promise<T>;
  dictation: DictationSessionManager;
  unregisterAllShortcuts: () => void;
  disableFnKeyListener: () => void;
  resetIndicatorBars: () => void;
  tray: Tray | null;
  indicatorWindow: BrowserWindow | null;
  mainWindow: BrowserWindow | null;
  logError: (message: string, error: unknown) => void;
}

interface RequestQuitResult {
  isQuitting: boolean;
  forceExitTimer: NodeJS.Timeout | null;
  tray: Tray | null;
}

function scheduleForcedExit(
  forceExitTimer: NodeJS.Timeout | null,
  forceExitTimeoutMs: number,
  appExit: (code: number) => void
): NodeJS.Timeout {
  if (forceExitTimer) {
    return forceExitTimer;
  }

  const timer = setTimeout(() => {
    appExit(0);
  }, forceExitTimeoutMs);

  timer.unref();
  return timer;
}

export async function requestQuit(options: RequestQuitOptions): Promise<RequestQuitResult> {
  let isQuitting = options.isQuitting;
  let forceExitTimer = options.forceExitTimer;
  let tray = options.tray;

  if (isQuitting) {
    forceExitTimer = scheduleForcedExit(
      forceExitTimer,
      options.forceExitTimeoutMs,
      options.appExit
    );
    return {
      isQuitting,
      forceExitTimer,
      tray
    };
  }

  isQuitting = true;
  forceExitTimer = scheduleForcedExit(
    forceExitTimer,
    options.forceExitTimeoutMs,
    options.appExit
  );

  try {
    await options.runSerialized(async () => {
      if (options.dictation.isActive()) {
        await options.dictation.cancel();
      }
      return undefined;
    });
  } catch (error) {
    options.logError("Nie udało się zatrzymać sesji podczas zamykania:", error);
  }

  options.unregisterAllShortcuts();
  options.disableFnKeyListener();
  options.resetIndicatorBars();

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (options.indicatorWindow && !options.indicatorWindow.isDestroyed()) {
    options.indicatorWindow.destroy();
  }

  if (options.mainWindow && !options.mainWindow.isDestroyed()) {
    options.mainWindow.removeAllListeners("close");
    options.mainWindow.destroy();
  }

  options.appQuit();

  return {
    isQuitting,
    forceExitTimer,
    tray
  };
}
