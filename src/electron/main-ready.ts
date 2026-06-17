import { app, BrowserWindow, Menu, screen, session, Tray } from "electron";
import { Settings } from "../core/types";
import { createTrayActiveIcon, createTrayIdleIcon } from "./main-tray";

interface PrepareSharedProcessUiOptions {
  trayIdleAlpha: number;
  loadAppIconFromAssets: () => Electron.NativeImage | null;
  resolveAssetPath: (fileName: string) => string | null;
  createTrayIconFromAppIcon: (
    image: Electron.NativeImage,
    alpha?: number
  ) => Electron.NativeImage;
  setAppIcon: (next: Electron.NativeImage | null) => void;
  setTrayIdleIcon: (next: Electron.NativeImage | null) => void;
  setTrayActiveIcon: (next: Electron.NativeImage | null) => void;
  registerIpc: () => void;
  loadRecentTranscriptsAtStartup: () => Promise<void>;
}

interface MountMainAppShellOptions {
  createMainWindow: () => BrowserWindow;
  createIndicatorWindow: () => BrowserWindow;
  positionIndicatorWindow: (win: BrowserWindow) => void;
  getIndicatorWindow: () => BrowserWindow | null;
  setMainWindow: (next: BrowserWindow) => void;
  setIndicatorWindow: (next: BrowserWindow) => void;
  setTray: (next: Tray) => void;
  trayImageForCurrentState: () => Electron.NativeImage;
  buildTrayMenu: () => Menu;
  showWindow: () => void;
  reloadSettingsAndHotkeys: () => Promise<Settings>;
  broadcastStatus: () => void;
}

function extendDarwinPath(): void {
  if (process.platform !== "darwin") {
    return;
  }

  const extra = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];
  const current = (process.env.PATH || "").split(":");
  const missing = extra.filter((p) => !current.includes(p));
  if (missing.length > 0) {
    process.env.PATH = [...missing, ...current].join(":");
  }
}

export async function prepareSharedProcessUi(
  options: PrepareSharedProcessUiOptions
): Promise<void> {
  extendDarwinPath();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  const appIcon = options.loadAppIconFromAssets();
  options.setAppIcon(appIcon);

  if (process.platform === "darwin" && appIcon) {
    app.dock?.setIcon(appIcon);
  }

  if (process.platform === "darwin") {
    options.setTrayIdleIcon(createTrayIdleIcon(options.resolveAssetPath));
    options.setTrayActiveIcon(createTrayActiveIcon(options.resolveAssetPath));
  } else if (appIcon) {
    options.setTrayIdleIcon(options.createTrayIconFromAppIcon(appIcon, options.trayIdleAlpha));
    options.setTrayActiveIcon(options.createTrayIconFromAppIcon(appIcon));
  }

  options.registerIpc();
  await options.loadRecentTranscriptsAtStartup();
}

export async function mountMainAppShell(options: MountMainAppShellOptions): Promise<void> {
  const mainWindow = options.createMainWindow();
  options.setMainWindow(mainWindow);

  const indicatorWindow = options.createIndicatorWindow();
  options.setIndicatorWindow(indicatorWindow);

  const tray = new Tray(options.trayImageForCurrentState());
  options.setTray(tray);
  tray.setToolTip("TapTalk");
  tray.setContextMenu(options.buildTrayMenu());
  tray.on("click", () => {
    options.showWindow();
  });

  screen.on("display-metrics-changed", () => {
    const current = options.getIndicatorWindow();
    if (current && !current.isDestroyed()) {
      options.positionIndicatorWindow(current);
    }
  });

  await options.reloadSettingsAndHotkeys();
  options.broadcastStatus();
}
