import { app, ipcMain, nativeTheme } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

function applyNativeTheme(theme: string | undefined): void {
  if (theme === "light" || theme === "dark") {
    nativeTheme.themeSource = theme;
  } else {
    nativeTheme.themeSource = "system";
  }
}

export function registerSettingsIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.settingsGet, async (event) => {
    deps.assertTrustedIpcSender(event);
    const cached = deps.getSettingsCache();
    if (cached) {
      applyNativeTheme(cached.theme);
      return cached;
    }

    const next = await deps.readSettings();
    deps.setSettingsCache(next);
    applyNativeTheme(next.theme);
    return next;
  });

  ipcMain.handle(IPC_CHANNELS.presetsGet, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.getCloudPresets();
  });

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (event, patch: unknown) => {
    deps.assertTrustedIpcSender(event);
    const safePatch = deps.sanitizeSettingsPatchFromRenderer(patch);
    const next = await deps.updateSettings(safePatch);
    deps.setSettingsCache(next);
    applyNativeTheme(next.theme);
    if (next.launchAtLogin !== undefined) {
      try { app.setLoginItemSettings({ openAtLogin: next.launchAtLogin === true }); } catch {}
    }
    await deps.reloadSettingsAndHotkeys();
    return next;
  });

  ipcMain.handle(IPC_CHANNELS.settingsResetOnboarding, async (event) => {
    deps.assertTrustedIpcSender(event);
    const next = await deps.updateSettings({ onboardingCompleted: false });
    deps.setSettingsCache(next);
    await deps.reloadSettingsAndHotkeys();
    return next;
  });
}
