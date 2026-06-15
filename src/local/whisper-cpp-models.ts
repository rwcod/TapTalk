import { spawn } from "node:child_process";
import { accessSync, existsSync, mkdirSync } from "node:fs";
import { getAppDataDirPath } from "../settings";
import path from "node:path";
import { getUnpackedRoot } from "../core/app-paths";

/**
 * Resolve the whisper.cpp binary. An explicit override wins; otherwise we probe
 * the same locations the PasteHelper resolver uses: packaged extraResources,
 * the unpacked dev `dist/native` dir, and a cwd-relative fallback. Returns null
 * when no usable binary can be found.
 */
export function resolveWhisperCppBinaryPath(override?: string): string | null {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed;
  }

  const candidates = [
    path.join(process.resourcesPath ?? "", "native", "whisper-cpp"),
    path.join(getUnpackedRoot(), "dist", "native", "whisper-cpp"),
    path.resolve(process.cwd(), "dist", "native", "whisper-cpp")
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function getModelsDir(): string {
  const modelsDir = path.join(getAppDataDirPath(), "models");
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }
  return modelsDir;
}

export function resolveWhisperCppModelPath(modelName: string): string {
  const trimmed = modelName.trim();
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return trimmed;
  }
  return path.join(getModelsDir(), `ggml-${trimmed}.bin`);
}

export function isWhisperCppModelCached(modelName: string): boolean {
  const modelPath = resolveWhisperCppModelPath(modelName);
  return existsSync(modelPath);
}

const MODEL_URLS: Record<string, string> = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  "tiny.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  "base.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  "small.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  medium: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
  "medium.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  "large-v1": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v1.bin",
  "large-v2": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v2.bin",
  "large-v3": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
  "large-v3-turbo": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
};

export async function downloadWhisperCppModel(
  modelName: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const trimmed = modelName.trim();
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Niestandardowa ścieżka modelu ${trimmed} nie może zostać pobrana automatycznie.`);
  }

  const url = MODEL_URLS[trimmed];
  if (!url) {
    throw new Error(`Nieznany model: ${trimmed}. Dostępne modele: ${Object.keys(MODEL_URLS).join(", ")}`);
  }

  const destPath = resolveWhisperCppModelPath(trimmed);
  const progress = onProgress ?? (() => {});

  progress(`Pobieranie modelu ${trimmed} (plik GGML) do ${destPath}...`);

  return new Promise((resolve, reject) => {
    // We use curl for reliable downloading with progress
    const child = spawn("curl", [
      "-L", // follow redirects
      "-f", // fail fast on HTTP errors
      "--progress-bar", // simpler progress output
      "-o", destPath,
      url
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      const data = String(chunk);
      stderr += data;
      // Extract percentage from curl progress bar if possible
      const match = data.match(/(\d+\.?\d*)%/);
      if (match) {
        progress(`Pobieranie modelu ${trimmed}: ${match[0]}...`);
      }
    });

    child.once("error", (err) => {
      reject(new Error(`Nie udało się uruchomić curl: ${err.message}`));
    });

    child.once("exit", (code) => {
      if (code === 0) {
        progress(`Pobieranie modelu ${trimmed} zakończone pomyślnie.`);
        resolve();
      } else {
        reject(new Error(`Błąd curl (kod ${code}): ${stderr}`));
      }
    });
  });
}
