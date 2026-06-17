import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { LocalWhisperCppConfig } from "../core/types";
import { TranscriptionProvider } from "./index";
import {
  resolveWhisperCppBinaryPath,
  resolveWhisperCppModelPath
} from "../local/whisper-cpp-models";

const REQUEST_TIMEOUT_MS = 120000;

async function resolveWhisperCppPath(config: LocalWhisperCppConfig): Promise<string> {
  const resolved = resolveWhisperCppBinaryPath(config.binaryPath);
  if (!resolved) {
    throw new Error(
      "Nie znaleziono wbudowanego silnika whisper.cpp. Zbuduj go poleceniem `npm run build`."
    );
  }
  return resolved;
}

async function resolveModelPath(modelName: string): Promise<string> {
  return resolveWhisperCppModelPath(modelName);
}

interface WhisperCppJsonResult {
  transcription?: Array<{
    text?: string;
  }>;
}

export class LocalWhisperCppProvider implements TranscriptionProvider {
  name = "whisper-cpp";

  constructor(
    private readonly config: LocalWhisperCppConfig,
    private readonly initialPrompt = ""
  ) {}

  async transcribe(audioPath: string): Promise<string> {
    if (!audioPath || audioPath.trim().length === 0) {
      throw new Error("whisper-cpp wymaga ścieżki do pliku audio.");
    }

    const binaryPath = await resolveWhisperCppPath(this.config);
    const modelPath = await resolveModelPath(this.config.model);

    try {
      await access(modelPath);
    } catch {
      throw new Error(`Nie znaleziono modelu whisper.cpp w: ${modelPath}. Upewnij się, że model został pobrany.`);
    }

    // whisper.cpp appends ".json" to the value passed via -of. We set -of to the
    // audio path explicitly so the output lands at a deterministic location —
    // with an empty -of the binary's default naming is unreliable (it can skip
    // writing the file entirely on silent clips), which surfaced as ENOENT.
    const outputJsonPath = `${audioPath}.json`;

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-m", modelPath,
        "-f", audioPath,
        "-t", String(Math.max(1, this.config.threads)),
        "-oj", // output JSON
        "-of", audioPath // output file base (whisper.cpp appends .json)
      ];

      args.push("-l", this.config.language?.trim() || "auto");

      if (this.initialPrompt.trim()) {
        args.push("--prompt", this.initialPrompt.trim());
      }

      if (!this.config.useGpu) {
        args.push("-ng"); // no gpu
      }

      const child = spawn(binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Set GGML_METAL_PATH_RESOURCES so whisper.cpp can find the Metal shader
          GGML_METAL_PATH_RESOURCES: path.dirname(binaryPath)
        }
      });

      let stderr = "";
      let settled = false;

      const settle = (handler: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        handler();
      };

      const timeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 1000).unref();
        }
        settle(() => reject(new Error("Timeout whisper.cpp (proces działał zbyt długo).")));
      }, REQUEST_TIMEOUT_MS);

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.once("error", (error) => {
        settle(() => reject(new Error(`Nie udało się uruchomić whisper.cpp: ${error.message}`)));
      });

      child.once("exit", async (code, _signal) => {
        if (settled) return;

        if (code !== 0) {
          const details = stderr.trim();
          settle(() => reject(new Error(`whisper.cpp zakończył się błędem (code=${code ?? "null"}). Szczegóły:\n${details}`)));
          return;
        }

        let jsonContent: string;
        try {
          jsonContent = await readFile(outputJsonPath, "utf8");
        } catch (error) {
          // Exit 0 but no JSON file means whisper.cpp detected no speech in the
          // clip (e.g. silence). Treat that as an empty transcript rather than a
          // hard error so the user just gets nothing pasted instead of a crash.
          if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            settle(() => resolve(""));
            return;
          }
          settle(() => reject(new Error(`Nie udało się odczytać wyniku z whisper.cpp: ${error instanceof Error ? error.message : String(error)}`)));
          return;
        }

        try {
          const payload = JSON.parse(jsonContent) as WhisperCppJsonResult;

          let text = "";
          if (payload.transcription && Array.isArray(payload.transcription)) {
            text = payload.transcription.map(t => t.text || "").join("").trim();
          }

          settle(() => resolve(text));
        } catch (error) {
          settle(() => reject(new Error(`Nie udało się odczytać wyniku z whisper.cpp: ${error instanceof Error ? error.message : String(error)}`)));
        }
      });
    });
  }
}
