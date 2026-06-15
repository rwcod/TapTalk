import { runCloudSettingsCommand } from "./cloud";
import { runFasterWhisperSettingsCommand } from "./faster-whisper";
import { runGeneralSettingsCommand } from "./general";
import { runRecordingSettingsCommand } from "./recording";

export async function runSettings(args: string[]): Promise<void> {
  const sub = args[0];

  if (await runGeneralSettingsCommand(args)) {
    return;
  }

  if (await runCloudSettingsCommand(args)) {
    return;
  }

  if (await runFasterWhisperSettingsCommand(args)) {
    return;
  }

  if (await runRecordingSettingsCommand(args)) {
    return;
  }

  throw new Error(`Nieznana komenda settings: ${sub}`);
}
