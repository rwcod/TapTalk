import {
  CloudSecretBackend,
  DEFAULT_SETTINGS,
  ProviderMode,
  Settings
} from "../core/types";
import { mergeSettings } from "./merge";
import {
  migrateLegacySettings,
  shouldTreatAsLegacySettings
} from "./legacy";
import {
  getAppDataDirPath as getAppDataDirPathFromRepository,
  getSettingsPath as getSettingsPathFromRepository,
  readRawLegacySettingsFile,
  readRawSettingsFile,
  writeSettingsFile
} from "./repository";
import {
  hydrateCloudSecretsFromBackend,
  persistSettingsWithSecrets,
  stripCloudKeysForDisk
} from "./secrets";
import { sanitizeLoadedSettings } from "./sanitize";

export async function getSettingsPath(): Promise<string> {
  return getSettingsPathFromRepository();
}

export function getAppDataDirPath(): string {
  return getAppDataDirPathFromRepository();
}

function parseStoredSettings(parsed: unknown): Settings {
  if (shouldTreatAsLegacySettings(parsed)) {
    return migrateLegacySettings(parsed);
  }

  return mergeSettings(DEFAULT_SETTINGS, sanitizeLoadedSettings(parsed));
}

interface WriteSettingsOptions {
  previousCloudSecretBackend?: CloudSecretBackend;
}

export async function readSettings(): Promise<Settings> {
  try {
    const loaded = parseStoredSettings(await readRawSettingsFile());
    const hydrated = await hydrateCloudSecretsFromBackend(loaded);

    if (hydrated.migratedPlaintextToSafeStorage) {
      await writeSettingsFile(stripCloudKeysForDisk(hydrated.settings));
    }

    return hydrated.settings;
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException;
    if (maybe.code !== "ENOENT") {
      throw error;
    }

    try {
      const migrated = parseStoredSettings(await readRawLegacySettingsFile());
      return await writeSettings(migrated);
    } catch (legacyError) {
      const legacy = legacyError as NodeJS.ErrnoException;
      if (legacy.code === "ENOENT") {
        const initial = mergeSettings(DEFAULT_SETTINGS, { onboardingCompleted: false });
        const hydrated = await hydrateCloudSecretsFromBackend(initial);
        return hydrated.settings;
      }
      throw legacyError;
    }
  }
}

export async function writeSettings(
  next: Settings,
  options: WriteSettingsOptions = {}
): Promise<Settings> {
  return persistSettingsWithSecrets(next, writeSettingsFile, options);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const merged = mergeSettings(current, patch);
  return writeSettings(merged, {
    previousCloudSecretBackend: current.cloudSecretBackend
  });
}

export async function setMode(mode: ProviderMode): Promise<Settings> {
  return updateSettings({ mode });
}
