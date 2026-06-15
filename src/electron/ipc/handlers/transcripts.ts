import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerTranscriptIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.transcriptsClear, async (event) => {
    deps.assertTrustedIpcSender(event);
    await deps.clearTranscriptHistory();

    const status = deps.getStatus();
    return deps.setStatus({
      recentTranscripts: [],
      lastText: "",
      message: status.phase === "idle" ? "History cleared" : status.message
    });
  });
}
