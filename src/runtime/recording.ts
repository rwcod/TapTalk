import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import {
  resolveFfmpegExecutable,
  rewriteLeadingFfmpegCommand,
  withPreferredFfmpegPath
} from "../local/ffmpeg-path";

export interface RecordingSession {
  outputPath: string;
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
}

interface StartRecordingOptions {
  onAudioLevel?: (level: number) => void;
}

const STOP_SIGNAL_WAIT_MS = 1500;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function rmsToUnit(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0.0025) {
    return 0;
  }

  const db = 20 * Math.log10(rms);
  return clamp01((db + 52) / 40);
}

function emitLevelFromPcm16(chunk: Buffer, listener?: (level: number) => void): void {
  if (!listener) {
    return;
  }

  const usableBytes = chunk.length - (chunk.length % 2);
  if (usableBytes < 2) {
    return;
  }

  const samples = usableBytes / 2;
  let sumSquares = 0;
  for (let offset = 0; offset < usableBytes; offset += 2) {
    const sample = chunk.readInt16LE(offset) / 32768;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples);
  listener(rmsToUnit(rms));
}

function waitForExit(
  pid: ReturnType<typeof spawn>,
  options: {
    allowFfmpegSigintCode255?: boolean;
    allowSigkill?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const isSuccess = (code: number | null, signal: NodeJS.Signals | null): boolean =>
      code === 0 ||
      signal === "SIGINT" ||
      signal === "SIGTERM" ||
      (Boolean(options.allowSigkill) && signal === "SIGKILL") ||
      (Boolean(options.allowFfmpegSigintCode255) && code === 255);

    if (pid.exitCode !== null || pid.signalCode !== null) {
      if (isSuccess(pid.exitCode, pid.signalCode)) {
        resolve(true);
        return;
      }

      reject(
        new Error(
          `Recorder zakończył się kodem ${pid.exitCode ?? "null"} i sygnałem ${pid.signalCode ?? "null"}`
        )
      );
      return;
    }

    let timeout: NodeJS.Timeout | undefined;

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      if (
        isSuccess(code, signal)
      ) {
        resolve(true);
        return;
      }

      reject(new Error(`Recorder zakończył się kodem ${code ?? "null"} i sygnałem ${signal ?? "null"}`));
    };

    const cleanup = (): void => {
      pid.off("error", onError);
      pid.off("exit", onExit);
      if (timeout) {
        clearTimeout(timeout);
      }
    };

    pid.once("error", onError);
    pid.once("exit", onExit);

    if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, options.timeoutMs);
    }
  });
}

async function stopProcess(recorder: ReturnType<typeof spawn>): Promise<void> {
  if (recorder.exitCode !== null || recorder.signalCode !== null) {
    return;
  }

  recorder.kill("SIGINT");
  const exitedAfterSigint = await waitForExit(recorder, {
    allowFfmpegSigintCode255: true,
    timeoutMs: STOP_SIGNAL_WAIT_MS
  });
  if (exitedAfterSigint) {
    return;
  }

  if (recorder.exitCode === null && recorder.signalCode === null) {
    recorder.kill("SIGTERM");
  }
  const exitedAfterSigterm = await waitForExit(recorder, {
    allowFfmpegSigintCode255: true,
    timeoutMs: STOP_SIGNAL_WAIT_MS
  });
  if (exitedAfterSigterm) {
    return;
  }

  if (recorder.exitCode === null && recorder.signalCode === null) {
    recorder.kill("SIGKILL");
  }
  const exitedAfterSigkill = await waitForExit(recorder, {
    allowFfmpegSigintCode255: true,
    allowSigkill: true,
    timeoutMs: STOP_SIGNAL_WAIT_MS
  });
  if (exitedAfterSigkill) {
    return;
  }

  throw new Error("Recorder process did not exit after SIGKILL.");
}

export async function startRecording(
  commandTemplate: string,
  outputPath: string,
  options: StartRecordingOptions = {}
): Promise<RecordingSession> {
  if (!commandTemplate.includes("{{output}}")) {
    throw new Error("recording.commandTemplate musi zawierać placeholder {{output}}.");
  }

  const ffmpegEnv = withPreferredFfmpegPath(process.env);
  const ffmpegExecutable = resolveFfmpegExecutable(ffmpegEnv);
  const usesImplicitFfmpeg = /^\s*ffmpeg(?=\s|$)/i.test(commandTemplate);

  if (usesImplicitFfmpeg && !ffmpegExecutable) {
    throw new Error(
      "ffmpeg not found in PATH. Install with `brew install ffmpeg` and restart TapTalk."
    );
  }

  const effectiveTemplate =
    usesImplicitFfmpeg && ffmpegExecutable
      ? rewriteLeadingFfmpegCommand(commandTemplate, ffmpegExecutable)
      : commandTemplate;

  const command = effectiveTemplate.replaceAll("{{output}}", outputPath);
  const recorder = spawn(command, {
    shell: true,
    stdio: ["ignore", "pipe", "inherit"],
    env: ffmpegEnv
  });

  await new Promise<void>((resolve, reject) => {
    recorder.once("spawn", () => resolve());
    recorder.once("error", (error) => reject(error));
  });

  if (recorder.stdout) {
    let carry = Buffer.alloc(0);
    recorder.stdout.on("data", (chunk) => {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (next.length === 0) {
        return;
      }

      const combined =
        carry.length > 0 ? Buffer.concat([carry, next], carry.length + next.length) : next;
      const usable = combined.length - (combined.length % 2);
      if (usable <= 0) {
        carry = combined;
        return;
      }

      const payload = combined.subarray(0, usable);
      carry = usable < combined.length ? combined.subarray(usable) : Buffer.alloc(0);
      emitLevelFromPcm16(payload, options.onAudioLevel);
    });
  }

  return {
    outputPath,
    stop: async () => stopProcess(recorder),
    cleanup: async () => {
      await rm(outputPath, { force: true });
    }
  };
}
