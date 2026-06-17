import { LocalFasterWhisperProvider } from "./local-faster-whisper-provider";
import { CloudSttProvider } from "./cloud-stt-provider";
import { ProviderMode, Settings } from "../core/types";

import { LocalWhisperCppProvider } from "./local-whisper-cpp-provider";

export interface TranscriptionProvider {
  name: string;
  transcribe(audioPath: string): Promise<string>;
}

class FailoverProvider implements TranscriptionProvider {
  name: string;

  constructor(
    private readonly primary: TranscriptionProvider,
    private readonly fallback: TranscriptionProvider
  ) {
    this.name = `${primary.name} -> ${fallback.name}`;
  }

  async transcribe(audioPath: string): Promise<string> {
    try {
      return await this.primary.transcribe(audioPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Primary provider failed (${this.primary.name}): ${reason}`);
      console.warn(`Trying fallback provider: ${this.fallback.name}`);
      return this.fallback.transcribe(audioPath);
    }
  }
}

function oppositeMode(mode: ProviderMode): ProviderMode {
  return mode === "local" ? "cloud" : "local";
}

function createProviderForMode(
  settings: Settings,
  mode: ProviderMode,
  initialPrompt: string
): TranscriptionProvider {
  if (mode === "local") {
    if (settings.localEngine === "whisper-cpp") {
      return new LocalWhisperCppProvider(settings.localWhisperCpp, initialPrompt);
    }
    return new LocalFasterWhisperProvider(settings.localFasterWhisper);
  }

  return new CloudSttProvider(settings.cloud);
}

export function createProvider(settings: Settings, initialPrompt = ""): TranscriptionProvider {
  const primary = createProviderForMode(settings, settings.mode, initialPrompt);

  if (!settings.fallback.enabled) {
    return primary;
  }

  const fallback = createProviderForMode(settings, oppositeMode(settings.mode), initialPrompt);
  return new FailoverProvider(primary, fallback);
}
