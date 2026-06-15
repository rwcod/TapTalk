import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { autoPasteRequirements, autoPasteText } from "./autopaste";
import { createProvider } from "../providers";
import { startRecording } from "./recording";
import { readSettings } from "../settings";

async function createTempAudioPath(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "taptalk-audio-"));
  const file = path.join(dir, `capture-${Date.now()}.wav`);
  return { dir, file };
}

export async function runFlow(): Promise<void> {
  const settings = await readSettings();
  const provider = createProvider(settings);
  const rl = readline.createInterface({ input, output });

  try {
    const { dir, file } = await createTempAudioPath();

    let text = "";
    try {
      console.log(`Provider: ${provider.name}`);
      console.log("Wciśnij Enter aby zacząć nagrywanie...");
      await rl.question("");

      const recording = await startRecording(settings.recording.commandTemplate, file);
      console.log("Nagrywanie trwa. Wciśnij Enter aby zakończyć...");
      await rl.question("");

      await recording.stop();
      console.log("Transkrybuję...");
      text = await provider.transcribe(recording.outputPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    console.log("\n=== TRANSKRYPT ===");
    console.log(text);

    if (settings.autoPaste) {
      await autoPasteText(text);
      console.log("\nTekst został wklejony do aktywnej aplikacji.");
    } else {
      console.log("\nAuto-paste wyłączony (ustawienia: settings autopaste on).\n");
    }
  } finally {
    rl.close();
  }
}

export function printFlowHelp(): void {
  console.log("flow: nagraj audio i wyślij do aktualnie wybranego trybu providera.");
  console.log(`auto-paste requirements: ${autoPasteRequirements()}`);
}
