import { BrowserWindow, screen } from "electron";

const MAIN_WINDOW_WIDTH = 900;
const MAIN_WINDOW_HEIGHT = 640;
const INDICATOR_WIDTH = 280;
const INDICATOR_HEIGHT = 112;
const WIZARD_WINDOW_WIDTH = 820;
const WIZARD_WINDOW_HEIGHT = 600;

interface CreateMainWindowOptions {
  appIcon: Electron.NativeImage | null;
  isQuitting: () => boolean;
  hardenWindowNavigation: (win: BrowserWindow) => void;
  resolveUiPath: (fileName: string) => string;
  preloadPath: string;
  onFocus?: () => void;
}

interface CreateIndicatorWindowOptions {
  hardenWindowNavigation: (win: BrowserWindow) => void;
  resolveUiPath: (fileName: string) => string;
  preloadPath: string;
  positionIndicatorWindow: (win: BrowserWindow) => void;
  onDidFinishLoad: () => void;
  onRecoveryNeeded?: (reason: string) => void;
}

interface CreateWizardWindowOptions {
  appIcon: Electron.NativeImage | null;
  hardenWindowNavigation: (win: BrowserWindow) => void;
  resolveUiPath: (fileName: string) => string;
  preloadPath: string;
  onClosed?: () => void;
}

export function showWindow(win: BrowserWindow | null): void {
  if (!win) {
    return;
  }

  if (!win.isVisible()) {
    win.show();
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.focus();
}

export function positionIndicatorWindow(win: BrowserWindow): void {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const area = display.workArea;
  const x = Math.round(area.x + (area.width - INDICATOR_WIDTH) / 2);
  const y = Math.round(area.y + area.height - INDICATOR_HEIGHT - 24);
  win.setPosition(x, y, false);
}

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: 680,
    minHeight: 480,
    title: "TapTalk",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    icon: options.appIcon ?? undefined,
    backgroundColor: "#1A1A2E",
    transparent: false,
    roundedCorners: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  options.hardenWindowNavigation(win);
  win.loadFile(options.resolveUiPath("index.html")).catch((error) => {
    console.error("Nie udało się załadować UI:", error);
  });

  win.on("close", (event) => {
    if (!options.isQuitting()) {
      event.preventDefault();
      win.hide();
    }
  });

  if (options.onFocus) {
    win.on("focus", options.onFocus);
  }

  return win;
}

export function createIndicatorWindow(options: CreateIndicatorWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    frame: false,
    show: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  options.hardenWindowNavigation(win);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  options.positionIndicatorWindow(win);

  win.loadFile(options.resolveUiPath("indicator.html")).catch((error) => {
    console.error("Nie udało się załadować indicatora:", error);
  });

  win.webContents.on("did-finish-load", () => {
    options.onDidFinishLoad();
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    options.onRecoveryNeeded?.(`indicator render-process-gone: ${details.reason}`);
  });

  win.webContents.on("unresponsive", () => {
    options.onRecoveryNeeded?.("indicator webContents unresponsive");
  });

  return win;
}

export function createWizardWindow(options: CreateWizardWindowOptions): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const x = Math.round(area.x + (area.width - WIZARD_WINDOW_WIDTH) / 2);
  const y = Math.round(area.y + (area.height - WIZARD_WINDOW_HEIGHT) / 2);

  const win = new BrowserWindow({
    width: WIZARD_WINDOW_WIDTH,
    height: WIZARD_WINDOW_HEIGHT,
    x,
    y,
    title: "TapTalk Setup",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 14 },
    icon: options.appIcon ?? undefined,
    backgroundColor: "#1A1A2E",
    transparent: false,
    roundedCorners: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    show: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  options.hardenWindowNavigation(win);
  win.loadFile(options.resolveUiPath("wizard.html")).catch((error) => {
    console.error("Failed to load wizard UI:", error);
  });

  if (options.onClosed) {
    win.on("closed", options.onClosed);
  }

  return win;
}
