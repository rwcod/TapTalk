import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CloudProviderConfig } from "../core/types";

const ENCRYPTED_KEYS_PATH = path.join(homedir(), ".taptalk", "cloud-keys.enc");
const ENCRYPTED_EDITING_KEY_PATH = path.join(homedir(), ".taptalk", "editing-key.enc");
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export interface SafeStorageProvider {
  isAvailable(): boolean;
  encrypt(plainText: string): Buffer;
  decrypt(encrypted: Buffer): string;
}

let safeStorageProvider: SafeStorageProvider | null = null;

export function setSafeStorageProvider(provider: SafeStorageProvider): void {
  safeStorageProvider = provider;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeApiKeys(value: unknown): Record<string, string> {
  if (!isObject(value)) {
    return {};
  }

  const out = Object.create(null) as Record<string, string>;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || RESERVED_KEYS.has(key) || typeof rawValue !== "string") {
      continue;
    }

    out[key] = rawValue.trim();
  }

  return out;
}

export function collectCloudApiKeys(cloud: CloudProviderConfig): Record<string, string> {
  const next = sanitizeApiKeys(cloud.apiKeys);
  const preset = cloud.preset;
  const apiKey = cloud.apiKey.trim();

  if (!preset || RESERVED_KEYS.has(preset)) {
    return next;
  }

  if (!apiKey) {
    delete next[preset];
    return next;
  }

  next[preset] = apiKey;
  return next;
}

function ensureSafeStorageReady(): void {
  if (!safeStorageProvider) {
    throw new Error(
      "safeStorage provider not initialized. Call setSafeStorageProvider() first."
    );
  }
}

export async function readEncryptedCloudApiKeys(): Promise<Record<string, string>> {
  ensureSafeStorageReady();

  let encrypted: Buffer;
  try {
    encrypted = await readFile(ENCRYPTED_KEYS_PATH);
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException;
    if (maybe.code === "ENOENT") {
      return {};
    }
    throw new Error(`Failed to read encrypted keys file: ${maybe.message}`);
  }

  if (encrypted.length === 0) {
    return {};
  }

  try {
    const decrypted = safeStorageProvider!.decrypt(encrypted);
    const parsed: unknown = JSON.parse(decrypted);
    return sanitizeApiKeys(parsed);
  } catch {
    return {};
  }
}

export async function writeEncryptedCloudApiKeys(
  apiKeys: Record<string, string>
): Promise<void> {
  ensureSafeStorageReady();

  const payload = sanitizeApiKeys(apiKeys);

  if (Object.keys(payload).length === 0) {
    await clearEncryptedCloudApiKeys();
    return;
  }

  const serialized = JSON.stringify(payload);
  const encrypted = safeStorageProvider!.encrypt(serialized);

  await mkdir(path.dirname(ENCRYPTED_KEYS_PATH), { recursive: true });
  await writeFile(ENCRYPTED_KEYS_PATH, encrypted);
}

export async function clearEncryptedCloudApiKeys(): Promise<void> {
  try {
    await rm(ENCRYPTED_KEYS_PATH, { force: true });
  } catch {
    // Ignore removal errors
  }
}

export async function readEncryptedEditingApiKey(): Promise<string> {
  ensureSafeStorageReady();

  let encrypted: Buffer;
  try {
    encrypted = await readFile(ENCRYPTED_EDITING_KEY_PATH);
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException;
    if (maybe.code === "ENOENT") {
      return "";
    }
    throw new Error(`Failed to read encrypted editing key file: ${maybe.message}`);
  }

  if (encrypted.length === 0) {
    return "";
  }

  try {
    return safeStorageProvider!.decrypt(encrypted).trim();
  } catch {
    return "";
  }
}

export async function writeEncryptedEditingApiKey(apiKey: string): Promise<void> {
  ensureSafeStorageReady();

  const normalized = apiKey.trim();
  if (!normalized) {
    await clearEncryptedEditingApiKey();
    return;
  }

  const encrypted = safeStorageProvider!.encrypt(normalized);
  await mkdir(path.dirname(ENCRYPTED_EDITING_KEY_PATH), { recursive: true });
  await writeFile(ENCRYPTED_EDITING_KEY_PATH, encrypted);
}

export async function clearEncryptedEditingApiKey(): Promise<void> {
  try {
    await rm(ENCRYPTED_EDITING_KEY_PATH, { force: true });
  } catch {
    // Ignore removal errors
  }
}
