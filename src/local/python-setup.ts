import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

function tildeify(p: string): string {
  const home = homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

const TAPTALK_DATA_DIR = path.join(homedir(), ".taptalk");
const PYTHON_DIR = path.join(TAPTALK_DATA_DIR, "python");
const PYTHON_BIN = path.join(PYTHON_DIR, "python", "bin", "python3");

const PYTHON_STANDALONE_URLS: Record<string, string> = {
  "darwin-arm64":
    "https://github.com/astral-sh/python-build-standalone/releases/download/20250409/cpython-3.11.12+20250409-aarch64-apple-darwin-install_only_stripped.tar.gz",
  "darwin-x64":
    "https://github.com/astral-sh/python-build-standalone/releases/download/20250409/cpython-3.11.12+20250409-x86_64-apple-darwin-install_only_stripped.tar.gz"
};

const SYSTEM_PYTHON_CANDIDATES = [
  "python3",
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
  "/usr/bin/python3"
];

const PROBE_TIMEOUT_MS = 5000;

function canRun(executable: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(executable, ["--version"], {
      stdio: "ignore"
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    child.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

async function findSystemPython(): Promise<string | null> {
  for (const candidate of SYSTEM_PYTHON_CANDIDATES) {
    if (await canRun(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadAndExtract(
  url: string,
  targetDir: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const tmpTarGz = path.join(targetDir, "python.tar.gz");

  try {
    onProgress?.(`Downloading Python 3.11 (~30 MB)...`);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const fileStream = createWriteStream(tmpTarGz);
    await pipeline(response.body as unknown as NodeJS.ReadableStream, fileStream);

    onProgress?.(`Extracting Python to ${tildeify(targetDir)} ...`);
    await extractTarGz(tmpTarGz, targetDir);
  } finally {
    await rm(tmpTarGz, { force: true });
  }
}

function extractTarGz(archivePath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["xzf", archivePath, "-C", targetDir], {
      stdio: "ignore"
    });

    child.once("error", (error) => reject(error));
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tar exited with code ${code}`));
    });
  });
}

export async function findOrInstallPython(
  onProgress?: (msg: string) => void
): Promise<string> {
  const systemPython = await findSystemPython();
  if (systemPython) {
    onProgress?.(`Found system Python: ${systemPython}`);
    return systemPython;
  }

  if (await fileExists(PYTHON_BIN) && await canRun(PYTHON_BIN)) {
    onProgress?.(`Found previously installed Python: ${tildeify(PYTHON_BIN)}`);
    return PYTHON_BIN;
  }

  onProgress?.("Downloading Python 3.11 (~30 MB)...");
  const key = `${process.platform}-${process.arch}`;
  const url = PYTHON_STANDALONE_URLS[key];
  if (!url) {
    throw new Error(
      `No standalone Python available for ${key}. Please install Python 3 manually.`
    );
  }

  await downloadAndExtract(url, PYTHON_DIR, onProgress);

  if (await fileExists(PYTHON_BIN) && await canRun(PYTHON_BIN)) {
    onProgress?.(`Python installed at ${tildeify(PYTHON_DIR)}.`);
    return PYTHON_BIN;
  }

  throw new Error(
    "Python installation failed: binary not functional after extraction."
  );
}

export function getStandalonePythonPath(): string {
  return PYTHON_BIN;
}
