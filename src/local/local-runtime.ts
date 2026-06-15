import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { resolveFfmpegExecutable, withPreferredFfmpegPath } from "./ffmpeg-path";
import {
  downloadWhisperCppModel,
  isWhisperCppModelCached,
  resolveWhisperCppBinaryPath,
  resolveWhisperCppModelPath
} from "./whisper-cpp-models";

/**
 * Look up the Hugging Face cache directory faster-whisper uses for a
 * Systran-published model (the default namespace for current versions).
 */
function fasterWhisperModelCachePath(modelName: string): string {
  return path.join(
    homedir(),
    ".cache",
    "huggingface",
    "hub",
    `models--Systran--faster-whisper-${modelName}`,
    "snapshots"
  );
}

/**
 * Returns true when faster-whisper has the named model on disk already and
 * will not need to download it on first use.
 */
function isFasterWhisperModelCached(modelName: string): boolean {
  const trimmed = modelName.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.startsWith(".")) {
    // Custom HF repo ids or local model paths: skip the cache check so we
    // don't claim coverage we can't verify.
    return false;
  }
  const snapshots = fasterWhisperModelCachePath(trimmed);
  if (!existsSync(snapshots)) {
    return false;
  }
  try {
    return readdirSync(snapshots).length > 0;
  } catch {
    return false;
  }
}

const VENV_DIR = path.join(homedir(), ".taptalk", "venv");

function tildeify(p: string): string {
  const home = homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function getHfCacheDir(): string {
  return process.env.HUGGINGFACE_HUB_CACHE
    || (process.env.HF_HOME ? path.join(process.env.HF_HOME, "hub") : "")
    || path.join(homedir(), ".cache", "huggingface", "hub");
}

const MODEL_SIZE_HINTS: Record<string, string> = {
  "tiny": "~75 MB", "tiny.en": "~75 MB",
  "base": "~140 MB", "base.en": "~140 MB",
  "small": "~460 MB", "small.en": "~460 MB",
  "medium": "~1.5 GB", "medium.en": "~1.5 GB",
  "large-v2": "~3 GB", "large-v3": "~3 GB",
};

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface RunOptions {
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

export interface LocalRuntimeProbeResult {
  ffmpegOk: boolean;
  pythonOk: boolean;
  fasterWhisperOk: boolean;
  pythonExecutable?: string;
  fasterWhisperVersion?: string;
  /** Model name we tried to detect in the Hugging Face cache, if any. */
  modelChecked?: string;
  /**
   * True when `modelChecked` is already cached locally and ready to use
   * (no download required). Undefined when no model was requested.
   */
  hasModel?: boolean;
  checks: string[];
}

export interface PrepareLocalWhisperInput {
  pythonPath: string;
  model: string;
  device: string;
  computeType: string;
  cpuThreads: number;
  installPackage: boolean;
}

export interface PrepareLocalWhisperResult {
  ok: boolean;
  steps: string[];
  pythonPath?: string;
}

const PIP_INSTALL_TIMEOUT_MS = 900000;
const ENSUREPIP_TIMEOUT_MS = 180000;

const PREWARM_SCRIPT = [
  "import sys",
  "from faster_whisper import WhisperModel",
  "model_name = sys.argv[1]",
  "device = sys.argv[2]",
  "compute_type = sys.argv[3]",
  "cpu_threads = int(sys.argv[4])",
  "WhisperModel(model_name, device=device, compute_type=compute_type, cpu_threads=cpu_threads)",
  "print('ready')"
].join("\n");

function firstNonEmptyLine(value: string): string {
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function runCommand(
  program: string,
  args: string[],
  options: RunOptions
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (handler: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      handler();
    };

    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      const forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 400);
      forceKillTimer.unref();

      settle(() => {
        reject(new Error(`${program} timed out after ${options.timeoutMs}ms`));
      });
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", (error) => {
      settle(() => {
        reject(new Error(`${program} failed to start: ${error.message}`));
      });
    });

    child.once("exit", (code) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        settle(() => {
          resolve({ stdout, stderr });
        });
        return;
      }

      const details = stderr.trim() || stdout.trim() || `exit code ${String(code)}`;
      settle(() => {
        reject(new Error(details));
      });
    });
  });
}

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPipErrorMessage(message: string): boolean {
  return /no module named ['"]?pip['"]?/i.test(message);
}

export async function probeLocalRuntime(
  pythonPath: string,
  modelName?: string
): Promise<LocalRuntimeProbeResult> {
  const checks: string[] = [];
  let ffmpegOk = false;
  let pythonOk = false;
  let fasterWhisperOk = false;
  let pythonExecutable: string | undefined;
  let fasterWhisperVersion: string | undefined;
  const ffmpegEnv = withPreferredFfmpegPath(process.env);
  const ffmpegExecutable = resolveFfmpegExecutable(ffmpegEnv);

  try {
    const ffmpegProgram = ffmpegExecutable ?? "ffmpeg";
    await runCommand(ffmpegProgram, ["-version"], { timeoutMs: 4500, env: ffmpegEnv });
    ffmpegOk = true;
    checks.push(`ffmpeg: ok (${ffmpegProgram})`);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    if (!ffmpegExecutable && /failed to start/i.test(errorText) && /ENOENT/i.test(errorText)) {
      checks.push("ffmpeg: missing (install with `brew install ffmpeg`)");
    } else {
      checks.push(`ffmpeg: ${errorText}`);
    }
  }

  try {
    const result = await runCommand(
      pythonPath,
      ["-c", "import sys; print(sys.executable)"],
      { timeoutMs: 5000 }
    );
    pythonExecutable = firstNonEmptyLine(result.stdout) || pythonPath;
    pythonOk = true;
    checks.push(`python: ok (${pythonExecutable})`);
  } catch (error) {
    checks.push(`python: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (pythonOk) {
    try {
      const result = await runCommand(
        pythonPath,
        ["-c", 'import importlib.metadata as m; print(m.version("faster-whisper"))'],
        { timeoutMs: 7000 }
      );
      fasterWhisperVersion = firstNonEmptyLine(result.stdout) || "unknown";
      fasterWhisperOk = true;
      checks.push(`faster-whisper: ok (${fasterWhisperVersion})`);
    } catch (error) {
      checks.push(`faster-whisper: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let modelChecked: string | undefined;
  let hasModel: boolean | undefined;
  const trimmedModel = modelName?.trim();
  if (trimmedModel) {
    modelChecked = trimmedModel;
    hasModel = isFasterWhisperModelCached(trimmedModel);
    checks.push(`model "${trimmedModel}": ${hasModel ? "cached" : "not cached"}`);
  }

  return {
    ffmpegOk,
    pythonOk,
    fasterWhisperOk,
    pythonExecutable,
    fasterWhisperVersion,
    modelChecked,
    hasModel,
    checks
  };
}

function isExternallyManagedError(message: string): boolean {
  return /externally.managed/i.test(message);
}

const VENV_CREATE_TIMEOUT_MS = 120000;

export async function prepareLocalWhisper(
  input: PrepareLocalWhisperInput,
  onProgress?: (msg: string) => void
): Promise<PrepareLocalWhisperResult> {
  const pythonPath = input.pythonPath.trim();
  const model = input.model.trim();
  if (!pythonPath) {
    throw new Error("Missing pythonPath.");
  }
  if (!model) {
    throw new Error("Missing model.");
  }

  const progress = onProgress ?? (() => {});
  const steps: string[] = [];
  let effectivePython = pythonPath;

  if (input.installPackage) {
    progress("Installing faster-whisper package... (this may take 1\u20132 minutes)");
    try {
      await runCommand(
        pythonPath,
        ["-m", "pip", "install", "--upgrade", "faster-whisper"],
        { timeoutMs: PIP_INSTALL_TIMEOUT_MS }
      );
      steps.push("faster-whisper: installed globally");
      progress("faster-whisper installed successfully.");
    } catch (error) {
      const reason = toErrorText(error);

      if (isExternallyManagedError(reason)) {
        const venvDisplay = tildeify(VENV_DIR);
        progress(`System Python is externally managed. Creating venv at ${venvDisplay} ...`);
        await runCommand(
          pythonPath,
          ["-m", "venv", VENV_DIR],
          { timeoutMs: VENV_CREATE_TIMEOUT_MS }
        );
        const venvPython = path.join(VENV_DIR, "bin", "python3");
        effectivePython = venvPython;
        steps.push(`Virtual environment: ${venvDisplay}`);
        progress(`Venv ready. Installing faster-whisper in ${venvDisplay} (~300 MB)...`);

        await runCommand(
          venvPython,
          ["-m", "pip", "install", "--upgrade", "faster-whisper"],
          { timeoutMs: PIP_INSTALL_TIMEOUT_MS }
        );
        steps.push("faster-whisper: installed in venv");
        progress("faster-whisper installed successfully.");
      } else if (isMissingPipErrorMessage(reason)) {
        progress("pip is missing. Bootstrapping with ensurepip...");
        try {
          await runCommand(
            pythonPath,
            ["-m", "ensurepip", "--upgrade"],
            { timeoutMs: ENSUREPIP_TIMEOUT_MS }
          );
        } catch (ensurepipError) {
          const ensurepipReason = toErrorText(ensurepipError);
          throw new Error(
            `Selected Python is missing pip and automatic bootstrap failed: ${ensurepipReason}. Run "${pythonPath} -m ensurepip --upgrade" or choose a Python interpreter with pip available.`
          );
        }

        steps.push("Bootstrapped pip with ensurepip.");
        progress("pip bootstrapped. Installing faster-whisper... (1\u20132 minutes)");
        await runCommand(
          pythonPath,
          ["-m", "pip", "install", "--upgrade", "faster-whisper"],
          { timeoutMs: PIP_INSTALL_TIMEOUT_MS }
        );
        steps.push("faster-whisper: installed globally");
        progress("faster-whisper installed successfully.");
      } else {
        throw error;
      }
    }
  } else {
    steps.push("Skipped package install.");
  }

  const hfCache = tildeify(getHfCacheDir());
  const sizeHint = MODEL_SIZE_HINTS[model] ?? "";
  const sizeLabel = sizeHint ? ` (${sizeHint})` : "";
  progress(`Downloading model "${model}" to ${hfCache}${sizeLabel}... (this may take a few minutes on first run)`);
  await runCommand(
    effectivePython,
    [
      "-c",
      PREWARM_SCRIPT,
      model,
      input.device,
      input.computeType,
      String(Math.max(1, Math.trunc(input.cpuThreads) || 1))
    ],
    { timeoutMs: 1800000 }
  );
  steps.push(`Model "${model}": ${hfCache}${sizeLabel}`);
  progress("Model ready!");

  return {
    ok: true,
    steps,
    pythonPath: effectivePython !== pythonPath ? effectivePython : undefined
  };
}

// ── whisper.cpp (native engine) ──────────────────────────────────────────────

const WHISPER_CPP_MODEL_SIZE_HINTS: Record<string, string> = {
  "tiny": "~75 MB", "tiny.en": "~75 MB",
  "base": "~140 MB", "base.en": "~140 MB",
  "small": "~460 MB", "small.en": "~460 MB",
  "medium": "~1.5 GB", "medium.en": "~1.5 GB",
  "large-v1": "~3 GB", "large-v2": "~3 GB", "large-v3": "~3 GB",
  "large-v3-turbo": "~1.6 GB"
};

export interface WhisperCppProbeResult {
  ffmpegOk: boolean;
  /** whisper.cpp binary is present and executable. */
  binaryOk: boolean;
  binaryPath?: string;
  /** Short model name (or custom path) we checked. */
  modelChecked?: string;
  /** True when the GGML model file is already on disk. */
  hasModel?: boolean;
  checks: string[];
}

export async function probeWhisperCpp(
  modelName?: string,
  binaryOverride?: string
): Promise<WhisperCppProbeResult> {
  const checks: string[] = [];
  let ffmpegOk = false;
  const ffmpegEnv = withPreferredFfmpegPath(process.env);
  const ffmpegExecutable = resolveFfmpegExecutable(ffmpegEnv);

  try {
    const ffmpegProgram = ffmpegExecutable ?? "ffmpeg";
    await runCommand(ffmpegProgram, ["-version"], { timeoutMs: 4500, env: ffmpegEnv });
    ffmpegOk = true;
    checks.push(`ffmpeg: ok (${ffmpegProgram})`);
  } catch (error) {
    const errorText = toErrorText(error);
    if (!ffmpegExecutable && /failed to start/i.test(errorText) && /ENOENT/i.test(errorText)) {
      checks.push("ffmpeg: missing (install with `brew install ffmpeg`)");
    } else {
      checks.push(`ffmpeg: ${errorText}`);
    }
  }

  let binaryOk = false;
  const binaryPath = resolveWhisperCppBinaryPath(binaryOverride) ?? undefined;
  if (!binaryPath) {
    checks.push("whisper.cpp: binary not found (run `npm run build`)");
  } else {
    try {
      await runCommand(binaryPath, ["--help"], { timeoutMs: 5000 });
      binaryOk = true;
      checks.push(`whisper.cpp: ok (${binaryPath})`);
    } catch (error) {
      checks.push(`whisper.cpp: ${toErrorText(error)}`);
    }
  }

  let modelChecked: string | undefined;
  let hasModel: boolean | undefined;
  const trimmedModel = modelName?.trim();
  if (trimmedModel) {
    modelChecked = trimmedModel;
    hasModel = isWhisperCppModelCached(trimmedModel);
    checks.push(`model "${trimmedModel}": ${hasModel ? "cached" : "not cached"}`);
  }

  return { ffmpegOk, binaryOk, binaryPath, modelChecked, hasModel, checks };
}

export interface PrepareWhisperCppInput {
  model: string;
  binaryPath?: string;
}

export interface PrepareWhisperCppResult {
  ok: boolean;
  steps: string[];
}

export async function prepareWhisperCpp(
  input: PrepareWhisperCppInput,
  onProgress?: (msg: string) => void
): Promise<PrepareWhisperCppResult> {
  const model = input.model.trim();
  if (!model) {
    throw new Error("Missing model.");
  }

  const progress = onProgress ?? (() => {});
  const steps: string[] = [];

  const binaryPath = resolveWhisperCppBinaryPath(input.binaryPath);
  if (!binaryPath) {
    throw new Error(
      "Nie znaleziono binarki whisper.cpp. Zbuduj ją poleceniem `npm run build`."
    );
  }

  progress("Sprawdzanie silnika whisper.cpp...");
  await runCommand(binaryPath, ["--help"], { timeoutMs: 5000 });
  steps.push(`whisper.cpp binary: ${binaryPath}`);

  if (isWhisperCppModelCached(model)) {
    steps.push(`Model "${model}": already cached`);
    progress(`Model "${model}" jest już pobrany.`);
    return { ok: true, steps };
  }

  const sizeHint = WHISPER_CPP_MODEL_SIZE_HINTS[model] ?? "";
  const sizeLabel = sizeHint ? ` (${sizeHint})` : "";
  progress(`Pobieranie modelu GGML "${model}"${sizeLabel}...`);
  await downloadWhisperCppModel(model, progress);
  steps.push(`Model "${model}": ${tildeify(resolveWhisperCppModelPath(model))}${sizeLabel}`);
  progress("Model gotowy!");

  return { ok: true, steps };
}
