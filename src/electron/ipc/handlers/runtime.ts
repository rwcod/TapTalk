import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerRuntimeIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(
    IPC_CHANNELS.localProbeRuntime,
    async (event, pythonPath?: string, modelName?: string) => {
      deps.assertTrustedIpcSender(event);
      const settings = deps.getSettingsCache() ?? (await deps.readSettings());
      const effectivePythonPath = deps.sanitizeProbePythonPath(
        pythonPath,
        settings.localFasterWhisper.pythonPath
      );
      const trimmedModel =
        typeof modelName === "string" && modelName.trim().length > 0
          ? modelName.trim().slice(0, 128)
          : settings.localFasterWhisper.model;

      return deps.probeLocalRuntime(effectivePythonPath, trimmedModel);
    }
  );

  ipcMain.handle(IPC_CHANNELS.localPrepareWhisper, async (event, input: unknown) => {
    deps.assertTrustedIpcSender(event);
    const safeInput = deps.sanitizePrepareLocalWhisperInput(input);
    return deps.prepareLocalWhisper(safeInput, (msg) => {
      deps.sendSetupProgress(msg);
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.localProbeWhisperCpp,
    async (event, modelName?: string) => {
      deps.assertTrustedIpcSender(event);
      const settings = deps.getSettingsCache() ?? (await deps.readSettings());
      const trimmedModel =
        typeof modelName === "string" && modelName.trim().length > 0
          ? modelName.trim().slice(0, 128)
          : settings.localWhisperCpp.model;
      return deps.probeWhisperCpp(trimmedModel);
    }
  );

  ipcMain.handle(IPC_CHANNELS.localPrepareWhisperCpp, async (event, model: unknown) => {
    deps.assertTrustedIpcSender(event);
    const settings = deps.getSettingsCache() ?? (await deps.readSettings());
    const safeModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim().slice(0, 128)
        : settings.localWhisperCpp.model;
    return deps.prepareWhisperCpp(safeModel, (msg) => {
      deps.sendSetupProgress(msg);
    });
  });

  ipcMain.handle(IPC_CHANNELS.localFindOrInstallPython, async (event) => {
    deps.assertTrustedIpcSender(event);
    return deps.findOrInstallPython((msg) => {
      deps.sendSetupProgress(msg);
    });
  });
}
