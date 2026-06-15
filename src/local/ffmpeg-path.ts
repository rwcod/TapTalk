import { accessSync, constants } from "node:fs";
import path from "node:path";

const MAC_FFMPEG_CANDIDATES = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];

function bundledFfmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p: unknown = require("ffmpeg-static");
    if (typeof p === "string") {
      const unpacked = p.replace("app.asar", "app.asar.unpacked");
      if (canExecute(unpacked)) return unpacked;
      if (canExecute(p)) return p;
    }
  } catch {
    // ffmpeg-static not installed — skip
  }
  return null;
}

function canExecute(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeExecutableName(name: string): string {
  if (process.platform === "win32" && !name.toLowerCase().endsWith(".exe")) {
    return `${name}.exe`;
  }
  return name;
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function splitPath(pathValue: string | undefined): string[] {
  if (!pathValue) {
    return [];
  }
  return pathValue.split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

function findInPath(executable: string, pathValue: string | undefined): string | null {
  for (const dir of splitPath(pathValue)) {
    const candidate = path.join(dir, executable);
    if (canExecute(candidate)) {
      return candidate;
    }
  }

  return null;
}

function defaultFfmpegCandidates(): string[] {
  if (process.platform === "darwin") {
    return [...MAC_FFMPEG_CANDIDATES];
  }

  return [];
}

export function resolveFfmpegExecutable(
  env: NodeJS.ProcessEnv = process.env,
  fallbackCandidates: string[] = defaultFfmpegCandidates()
): string | null {
  const executable = normalizeExecutableName("ffmpeg");
  const fromPath = findInPath(executable, env.PATH);
  if (fromPath) {
    return fromPath;
  }

  for (const candidate of fallbackCandidates) {
    if (canExecute(candidate)) {
      return candidate;
    }
  }

  const bundled = bundledFfmpegPath();
  if (bundled) {
    return bundled;
  }

  return null;
}

export function withPreferredFfmpegPath(
  env: NodeJS.ProcessEnv = process.env,
  fallbackCandidates: string[] = defaultFfmpegCandidates()
): NodeJS.ProcessEnv {
  const existingPathItems = splitPath(env.PATH);
  const preferredDirs = fallbackCandidates
    .filter((candidate) => canExecute(candidate))
    .map((candidate) => path.dirname(candidate));
  const mergedPath = unique([...preferredDirs, ...existingPathItems]).join(path.delimiter);

  if (!mergedPath) {
    return { ...env };
  }

  return {
    ...env,
    PATH: mergedPath
  };
}

export function rewriteLeadingFfmpegCommand(
  commandTemplate: string,
  ffmpegExecutable: string
): string {
  if (!ffmpegExecutable.trim()) {
    return commandTemplate;
  }

  const escapedPath = ffmpegExecutable.replace(/"/g, '\\"');
  return commandTemplate.replace(/^(\s*)ffmpeg(?=\s|$)/i, `$1"${escapedPath}"`);
}
