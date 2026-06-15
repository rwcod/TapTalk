import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerDictationIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.dictationGetStatus, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.dictationStart, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.runSerialized(async () => deps.startDictationWithMode("manual"));
  });

  ipcMain.handle(IPC_CHANNELS.dictationStop, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.runSerialized(async () => deps.stopDictationAndResetMode());
  });

  ipcMain.handle(IPC_CHANNELS.dictationToggle, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.runSerialized(async () => {
      const status = deps.getStatus();
      if (status.phase === "idle") {
        return deps.startDictationWithMode("manual");
      }

      if (status.phase === "recording") {
        return deps.stopDictationAndResetMode();
      }

      return status;
    });
  });
}
