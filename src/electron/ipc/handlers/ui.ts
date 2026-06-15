import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerUiIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.uiResizeForView, async (event, view: unknown) => {
    deps.assertTrustedIpcSender(event);
    if (typeof view === "string") {
      deps.resizeMainWindowForView(view);
    }
  });
}
