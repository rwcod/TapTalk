import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerWizardIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.wizardCompleted, async (event) => {
    deps.assertTrustedIpcSender(event);
    await deps.onWizardCompleted();
  });

  ipcMain.handle(IPC_CHANNELS.wizardOpen, async (event) => {
    deps.assertTrustedIpcSender(event);
    await deps.onWizardOpenRequested();
  });
}
