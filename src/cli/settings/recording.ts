import { updateSettings } from "../../settings";

export async function runRecordingSettingsCommand(args: string[]): Promise<boolean> {
  const sub = args[0];
  if (sub !== "recording-cmd") {
    return false;
  }

  const value = args.slice(1).join(" ").trim();
  if (!value) {
    throw new Error("Podaj komendę nagrywania");
  }
  if (!value.includes("{{output}}")) {
    throw new Error("Komenda musi zawierać {{output}}");
  }

  await updateSettings({
    recording: {
      commandTemplate: value
    }
  });
  console.log("Komenda nagrywania zapisana.");
  return true;
}
