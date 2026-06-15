import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Settings } from "../core/types";

const SETTINGS_DIR = path.join(homedir(), ".taptalk");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");
const SETTINGS_DIR_MODE = 0o700;
const SETTINGS_FILE_MODE = 0o600;
const LEGACY_SETTINGS_DIR = path.join(homedir(), ".local-wspr");
const LEGACY_SETTINGS_PATH = path.join(LEGACY_SETTINGS_DIR, "settings.json");

export function getSettingsPath(): string {
  return SETTINGS_PATH;
}

export function getAppDataDirPath(): string {
  return SETTINGS_DIR;
}

export async function readRawSettingsFile(): Promise<unknown> {
  return readRawSettingsFromPath(SETTINGS_PATH);
}

export async function readRawLegacySettingsFile(): Promise<unknown> {
  return readRawSettingsFromPath(LEGACY_SETTINGS_PATH);
}

export async function writeSettingsFile(next: Settings): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true, mode: SETTINGS_DIR_MODE });
  await chmod(SETTINGS_DIR, SETTINGS_DIR_MODE).catch(() => undefined);
  await writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: SETTINGS_FILE_MODE
  });
  await chmod(SETTINGS_PATH, SETTINGS_FILE_MODE).catch(() => undefined);
}

async function readRawSettingsFromPath(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}
