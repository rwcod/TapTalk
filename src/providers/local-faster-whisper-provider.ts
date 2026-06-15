import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { getUnpackedRoot } from "../core/app-paths";
import type { TranscriptionProvider } from "../providers";

interface LocalFasterWhisperConfig {
  pythonPath: string;
  model: string;
  device: string;
  computeType: string;
  language: string;
  beamSize: number;
  vadFilter: boolean;
  cpuThreads: number;
}

interface WorkerResponse {
  id?: number;
  ok?: boolean;
  text?: string;
  error?: string;
  event?: string;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 120000;

let activeWorker: FasterWhisperWorker | null = null;
let activeWorkerKey: string | null = null;
let exitHookRegistered = false;

async function resolveRunnerPath(): Promise<string> {
  const candidates = [
    path.join(getUnpackedRoot(), "scripts", "faster_whisper_transcribe.py"),
    path.resolve(process.cwd(), "scripts/faster_whisper_transcribe.py")
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "Nie znaleziono skryptu runnera faster-whisper (scripts/faster_whisper_transcribe.py)."
  );
}

function workerKey(config: LocalFasterWhisperConfig, runnerPath: string): string {
  return JSON.stringify({
    pythonPath: config.pythonPath,
    runnerPath,
    model: config.model,
    device: config.device,
    computeType: config.computeType,
    language: config.language,
    beamSize: config.beamSize,
    vadFilter: config.vadFilter,
    cpuThreads: config.cpuThreads
  });
}

class FasterWhisperWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly rl: readline.Interface;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private ready = false;
  private dead = false;
  private nextId = 1;
  private stderrTail = "";

  constructor(
    config: LocalFasterWhisperConfig,
    runnerPath: string
  ) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    const args = [
      runnerPath,
      "--serve",
      "--model",
      config.model,
      "--device",
      config.device,
      "--compute-type",
      config.computeType,
      "--beam-size",
      String(config.beamSize),
      "--vad-filter",
      config.vadFilter ? "on" : "off",
      "--cpu-threads",
      String(config.cpuThreads)
    ];

    if (config.language.trim().length > 0) {
      args.push("--language", config.language);
    }

    this.child = spawn(config.pythonPath, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity
    });

    this.rl.on("line", (line) => {
      this.onStdoutLine(line);
    });

    this.child.stderr.on("data", (chunk) => {
      const data = String(chunk);
      this.stderrTail = `${this.stderrTail}${data}`.slice(-8000);
    });

    this.child.once("error", (error) => {
      this.handleFatal(
        new Error(`Nie udało się uruchomić worker local-faster-whisper: ${error.message}`)
      );
    });

    this.child.once("exit", (code, signal) => {
      this.handleFatal(
        new Error(
          `Worker local-faster-whisper zakończył się (code=${code ?? "null"}, signal=${signal ?? "null"}).`
        )
      );
    });
  }

  private onStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let payload: WorkerResponse;
    try {
      payload = JSON.parse(trimmed) as WorkerResponse;
    } catch {
      return;
    }

    if (payload.event === "ready") {
      this.ready = true;
      this.resolveReady();
      return;
    }

    if (typeof payload.id !== "number") {
      return;
    }

    const pending = this.pending.get(payload.id);
    if (!pending) {
      return;
    }

    this.pending.delete(payload.id);
    clearTimeout(pending.timeout);

    if (payload.ok) {
      pending.resolve((payload.text ?? "").trim());
      return;
    }

    pending.reject(
      new Error(payload.error || "Worker local-faster-whisper zwrócił błąd bez szczegółów.")
    );
  }

  private handleFatal(error: Error): void {
    if (this.dead) {
      return;
    }
    this.dead = true;

    const details = this.stderrTail.trim();
    const withDetails = details
      ? new Error(`${error.message}\nstderr:\n${details}`)
      : error;

    if (!this.ready) {
      this.rejectReady(withDetails);
    }

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(withDetails);
    }
    this.pending.clear();

    this.rl.removeAllListeners();
    this.rl.close();
  }

  async transcribe(audioPath: string): Promise<string> {
    if (!audioPath || audioPath.trim().length === 0) {
      throw new Error("local-faster-whisper wymaga ścieżki do pliku audio.");
    }

    await this.readyPromise;

    if (this.dead) {
      throw new Error("Worker local-faster-whisper jest niedostępny.");
    }

    const id = this.nextId;
    this.nextId += 1;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error("Timeout local-faster-whisper (worker nie odpowiedział w oczekiwanym czasie).")
        );
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });

      const request = JSON.stringify({
        id,
        audio: audioPath
      });

      this.child.stdin.write(`${request}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }

        this.pending.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(
          new Error(`Nie udało się wysłać requestu do worker local-faster-whisper: ${error.message}`)
        );
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.dead) {
      return;
    }

    this.dead = true;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Worker local-faster-whisper został zatrzymany."));
    }
    this.pending.clear();

    this.rl.removeAllListeners();
    this.rl.close();

    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }

    this.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill("SIGKILL");
        }
      }, 1200);

      this.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function getOrCreateWorker(
  config: LocalFasterWhisperConfig
): Promise<FasterWhisperWorker> {
  const runnerPath = await resolveRunnerPath();
  const nextKey = workerKey(config, runnerPath);

  if (activeWorker && activeWorkerKey === nextKey) {
    return activeWorker;
  }

  if (activeWorker) {
    await activeWorker.shutdown();
    activeWorker = null;
    activeWorkerKey = null;
  }

  const worker = new FasterWhisperWorker(config, runnerPath);
  activeWorker = worker;
  activeWorkerKey = nextKey;

  if (!exitHookRegistered) {
    exitHookRegistered = true;
    process.once("exit", () => {
      if (activeWorker) {
        void activeWorker.shutdown();
      }
    });
  }

  return worker;
}

async function resetActiveWorkerIfSame(worker: FasterWhisperWorker): Promise<void> {
  if (activeWorker !== worker) {
    return;
  }

  await worker.shutdown();
  activeWorker = null;
  activeWorkerKey = null;
}

export class LocalFasterWhisperProvider implements TranscriptionProvider {
  name = "local-faster-whisper";

  constructor(private readonly config: LocalFasterWhisperConfig) {}

  async transcribe(audioPath: string): Promise<string> {
    let worker: FasterWhisperWorker | null = null;

    try {
      worker = await getOrCreateWorker(this.config);
      return await worker.transcribe(audioPath);
    } catch (error) {
      if (worker) {
        await resetActiveWorkerIfSame(worker);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Nie udało się uruchomić local-faster-whisper:\n${message}`);
    }
  }
}
