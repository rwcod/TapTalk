import {
  clearEncryptedCloudApiKeys,
  collectCloudApiKeys,
  clearEncryptedEditingApiKey,
  readEncryptedCloudApiKeys,
  readEncryptedEditingApiKey,
  writeEncryptedCloudApiKeys,
  writeEncryptedEditingApiKey
} from "./secret-store";
import { CloudSecretBackend, Settings } from "../core/types";

export interface HydratedSettingsResult {
  settings: Settings;
  migratedPlaintextToSafeStorage: boolean;
}

interface WriteSettingsOptions {
  previousCloudSecretBackend?: CloudSecretBackend;
}

export function syncCloudKeysForRuntime(settings: Settings): Settings {
  const apiKeys = collectCloudApiKeys(settings.cloud);
  const activeApiKey = apiKeys[settings.cloud.preset] ?? "";

  return {
    ...settings,
    cloud: {
      ...settings.cloud,
      apiKey: activeApiKey,
      apiKeys
    }
  };
}

export function stripCloudKeysForDisk(settings: Settings): Settings {
  return {
    ...settings,
    cloud: {
      ...settings.cloud,
      apiKey: "",
      apiKeys: {}
    },
    editing: {
      ...settings.editing,
      apiKey: ""
    }
  };
}

export async function hydrateCloudSecretsFromBackend(
  settings: Settings
): Promise<HydratedSettingsResult> {
  const runtime = syncCloudKeysForRuntime(settings);
  if (runtime.cloudSecretBackend !== "safeStorage") {
    return {
      settings: runtime,
      migratedPlaintextToSafeStorage: false
    };
  }

  const diskApiKeys = collectCloudApiKeys(runtime.cloud);
  const diskEditingApiKey = runtime.editing.apiKey.trim();

  let encryptedApiKeys: Record<string, string> = {};
  let encryptedEditingApiKey = "";
  try {
    encryptedApiKeys = await readEncryptedCloudApiKeys();
  } catch {
    // safeStorage not ready yet (e.g. CLI context)
  }
  try {
    encryptedEditingApiKey = await readEncryptedEditingApiKey();
  } catch {
    // safeStorage not ready yet (e.g. CLI context)
  }

  const mergedApiKeys = {
    ...diskApiKeys,
    ...encryptedApiKeys
  };
  const editingApiKey = encryptedEditingApiKey || diskEditingApiKey;

  if (Object.keys(diskApiKeys).length > 0) {
    try {
      await writeEncryptedCloudApiKeys(mergedApiKeys);
    } catch {
      // safeStorage not available – keys stay on disk for now
    }
  }
  if (diskEditingApiKey) {
    try {
      await writeEncryptedEditingApiKey(diskEditingApiKey);
    } catch {
      // safeStorage not available – key stays on disk for now
    }
  }

  const activeKey = mergedApiKeys[runtime.cloud.preset] ?? "";
  const hydrated = syncCloudKeysForRuntime({
    ...runtime,
    cloud: {
      ...runtime.cloud,
      apiKey: activeKey,
      apiKeys: mergedApiKeys
    },
    editing: {
      ...runtime.editing,
      apiKey: editingApiKey
    }
  });

  return {
    settings: hydrated,
    migratedPlaintextToSafeStorage:
      Object.keys(diskApiKeys).length > 0 || diskEditingApiKey.length > 0
  };
}

export async function persistSettingsWithSecrets(
  next: Settings,
  writeSettingsFile: (settings: Settings) => Promise<void>,
  options: WriteSettingsOptions = {}
): Promise<Settings> {
  const runtime = syncCloudKeysForRuntime(next);

  if (runtime.cloudSecretBackend === "safeStorage") {
    try {
      await writeEncryptedCloudApiKeys(runtime.cloud.apiKeys);
      await writeEncryptedEditingApiKey(runtime.editing.apiKey);
      await writeSettingsFile(stripCloudKeysForDisk(runtime));
    } catch {
      // safeStorage not available (CLI context) – save keys to disk as fallback
      await writeSettingsFile(runtime);
    }
    return runtime;
  }

  if (
    options.previousCloudSecretBackend === "safeStorage" &&
    runtime.cloudSecretBackend === "settings"
  ) {
    await clearEncryptedCloudApiKeys().catch(() => undefined);
    await clearEncryptedEditingApiKey().catch(() => undefined);
  }

  await writeSettingsFile(runtime);
  return runtime;
}
