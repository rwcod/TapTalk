import { existsSync } from "node:fs";
import path from "node:path";
import { getAppRoot, getUnpackedRoot } from "../core/app-paths";

export function resolveUiPath(fileName: string): string {
  const candidates = [
    path.join(getAppRoot(), "src", "electron", fileName),
    path.resolve(process.cwd(), "src", "electron", fileName)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function resolveAssetPath(fileName: string): string | null {
  const candidates = [
    resolveUiPath(path.join("assets", fileName)),
    path.resolve(process.cwd(), "src", "electron", "assets", fileName),
    path.resolve(process.cwd(), "dist", fileName),
    path.resolve(process.cwd(), fileName),
    path.join(getAppRoot(), fileName)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveKeyspyServerPath(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }

  const unpackedPath = path.join(
    getUnpackedRoot(),
    "node_modules",
    "keyspy",
    "runtime",
    "MacKeyServer"
  );
  if (existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return null;
}

export function resolvePasteHelperPath(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }

  const candidates = [
    path.join(process.resourcesPath ?? "", "native", "PasteHelper"),
    path.join(getUnpackedRoot(), "dist", "native", "PasteHelper"),
    path.resolve(process.cwd(), "dist", "native", "PasteHelper")
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
