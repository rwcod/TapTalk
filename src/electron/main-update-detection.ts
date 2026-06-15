import type { Settings } from "../core/types";
import type { DictationStatusPayload } from "./ipc/contracts";

interface DetectAppUpdateOptions {
  appVersion: string;
  readSettings: () => Promise<Settings>;
  getSettingsCache: () => Settings | null;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  setStatus: (next: Partial<DictationStatusPayload>) => DictationStatusPayload;
  logError: (message: string, error: unknown) => void;
}

export async function detectAppUpdate(options: DetectAppUpdateOptions): Promise<void> {
  const current = options.appVersion;
  const settings = options.getSettingsCache() ?? (await options.readSettings());
  const stored = settings.lastSeenVersion;

  options.setStatus({ appVersion: current });

  if (stored && stored !== current) {
    options.setStatus({ appUpdatedFromVersion: stored });
  }

  if (stored !== current) {
    try {
      await options.updateSettings({ lastSeenVersion: current });
    } catch (error) {
      options.logError("Failed to persist lastSeenVersion:", error);
    }
  }
}
