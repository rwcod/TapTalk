import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerSystemIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.systemOpenAccessibilitySettings, async (event) => {
    deps.assertTrustedIpcSender(event);
    if (process.platform !== "darwin") {
      return false;
    }

    await deps.openMacPrivacySettings();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.systemCheckPermissions, async (event, rawOptions: unknown) => {
    deps.assertTrustedIpcSender(event);
    return deps.collectPermissionSnapshot(rawOptions);
  });

  ipcMain.handle(IPC_CHANNELS.systemRequestMicrophone, async (event) => {
    deps.assertTrustedIpcSender(event);
    if (process.platform !== "darwin") {
      return true;
    }
    return deps.askForMicrophoneAccess();
  });

  ipcMain.handle(IPC_CHANNELS.systemOpenAccessibility, async (event) => {
    deps.assertTrustedIpcSender(event);
    if (process.platform !== "darwin") {
      return false;
    }
    await deps.openAccessibilitySettingsUrl();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.systemOpenInputMonitoring, async (event) => {
    deps.assertTrustedIpcSender(event);
    if (process.platform !== "darwin") {
      return false;
    }
    await deps.openInputMonitoringSettingsUrl();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.systemOpenMicrophone, async (event) => {
    deps.assertTrustedIpcSender(event);
    if (process.platform !== "darwin") {
      return false;
    }
    await deps.openMicrophoneSettingsUrl();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.systemRefreshPermissions, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.refreshPermissionsAndStatus();
  });
}
