#!/usr/bin/env node
import { autoPasteRequirements, autoPasteText } from "./runtime/autopaste";
import { runSettings } from "./cli/settings";
import { runFlow } from "./runtime/flow";
import { createProvider } from "./providers";
import { readSettings } from "./settings";

function printHelp(): void {
  console.log(`taptalk

Użycie:
  taptalk flow
  taptalk transcribe <plik-audio>
  taptalk settings show

  taptalk settings mode <local|cloud>
  taptalk settings fallback <on|off>
  taptalk settings autopaste <on|off>
  taptalk settings cloud-secret-backend <safeStorage|settings>

  taptalk settings cloud-preset <openai|groq|elevenlabs|deepgram|huggingface|deapi|custom>
  taptalk settings cloud-key <api-key>
  taptalk settings cloud-model <name>
  taptalk settings cloud-language <auto|code>

  taptalk settings cloud-url <url>
  taptalk settings cloud-auth-header <name>
  taptalk settings cloud-auth-value <template>
  taptalk settings cloud-body-format <formdata|binary>
  taptalk settings cloud-audio-field <name>

  taptalk settings fw-python <path>
  taptalk settings fw-preset <ultrafast|balanced|quality>
  taptalk settings fw-model <name>
  taptalk settings fw-device <device>
  taptalk settings fw-compute <type>
  taptalk settings fw-language <auto|code|code+en>
  taptalk settings fw-beam <number>
  taptalk settings fw-vad <on|off>
  taptalk settings fw-cpu-threads <number>

  taptalk settings recording-cmd <komenda-z-{{output}}>
  taptalk requirements
`);
}

async function runTranscribe(audioPath?: string): Promise<void> {
  if (!audioPath || audioPath.trim().length === 0) {
    throw new Error("Podaj ścieżkę do pliku audio.");
  }

  const settings = await readSettings();
  const provider = createProvider(settings);
  const text = await provider.transcribe(audioPath);
  console.log(text);

  if (settings.autoPaste) {
    await autoPasteText(text);
  }
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "flow") {
    await runFlow();
    return;
  }

  if (command === "transcribe") {
    await runTranscribe(args[0]);
    return;
  }

  if (command === "settings") {
    await runSettings(args);
    return;
  }

  if (command === "requirements") {
    console.log(autoPasteRequirements());
    return;
  }

  throw new Error(`Nieznana komenda: ${command}`);
}

main().catch((error) => {
  console.error("Błąd:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
