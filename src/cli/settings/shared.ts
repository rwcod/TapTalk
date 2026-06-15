import { getSettingsPath, readSettings, updateSettings } from "../../settings";
import { Settings } from "../../core/types";

export function redactSettingsForDisplay(settings: Settings): Settings {
  const apiKeys = Object.fromEntries(
    Object.entries(settings.cloud.apiKeys).map(([key, value]) => [key, value ? "***" : ""])
  );

  return {
    ...settings,
    cloud: {
      ...settings.cloud,
      apiKey: settings.cloud.apiKey ? "***" : "",
      apiKeys
    }
  };
}

export async function printSettings(): Promise<void> {
  const [settings, path] = await Promise.all([readSettings(), getSettingsPath()]);
  console.log(`settings file: ${path}`);
  console.log(JSON.stringify(redactSettingsForDisplay(settings), null, 2));
}

export async function updateCloudSettings(patch: Partial<Settings["cloud"]>): Promise<Settings> {
  const current = await readSettings();
  return updateSettings({
    cloud: {
      ...current.cloud,
      ...patch
    }
  });
}

export async function updateLocalFasterWhisperSettings(
  patch: Partial<Settings["localFasterWhisper"]>
): Promise<Settings> {
  const current = await readSettings();
  return updateSettings({
    localFasterWhisper: {
      ...current.localFasterWhisper,
      ...patch
    }
  });
}
