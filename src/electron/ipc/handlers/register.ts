import { registerDictationIpcHandlers } from "./dictation";
import { registerRuntimeIpcHandlers } from "./runtime";
import { registerSettingsIpcHandlers } from "./settings";
import { registerSystemIpcHandlers } from "./system";
import { registerTranscriptIpcHandlers } from "./transcripts";
import { registerWizardIpcHandlers } from "./wizard";
import { registerUiIpcHandlers } from "./ui";
import { RegisterIpcDeps } from "./types";

export function registerIpcHandlers(deps: RegisterIpcDeps): void {
  registerSettingsIpcHandlers(deps);
  registerRuntimeIpcHandlers(deps);
  registerDictationIpcHandlers(deps);
  registerTranscriptIpcHandlers(deps);
  registerSystemIpcHandlers(deps);
  registerWizardIpcHandlers(deps);
  registerUiIpcHandlers(deps);
}
