import {
  parseOnOff,
  parsePositiveInteger
} from "../guards";
import { updateLocalFasterWhisperSettings } from "./shared";

export async function runFasterWhisperSettingsCommand(args: string[]): Promise<boolean> {
  const sub = args[0];

  if (sub === "fw-python") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj ścieżkę do python");
    }

    await updateLocalFasterWhisperSettings({ pythonPath: value });
    console.log(`faster-whisper python: ${value}`);
    return true;
  }

  if (sub === "fw-preset") {
    const value = (args[1] ?? "").toLowerCase();

    if (value === "ultrafast") {
      await updateLocalFasterWhisperSettings({
        model: "tiny",
        device: "cpu",
        computeType: "int8",
        language: "pl",
        beamSize: 1,
        vadFilter: true,
        cpuThreads: 4
      });
      console.log("faster-whisper preset: ultrafast (tiny/int8).");
      return true;
    }

    if (value === "balanced") {
      await updateLocalFasterWhisperSettings({
        model: "small",
        device: "cpu",
        computeType: "int8",
        language: "pl",
        beamSize: 1,
        vadFilter: true,
        cpuThreads: 4
      });
      console.log("faster-whisper preset: balanced (small/int8).");
      return true;
    }

    if (value === "quality") {
      await updateLocalFasterWhisperSettings({
        model: "medium",
        device: "cpu",
        computeType: "int8",
        language: "",
        beamSize: 3,
        vadFilter: true,
        cpuThreads: 4
      });
      console.log("faster-whisper preset: quality (medium/int8 + beam 3).");
      return true;
    }

    throw new Error("Podaj fw-preset: ultrafast | balanced | quality");
  }

  if (sub === "fw-model") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj model");
    }

    await updateLocalFasterWhisperSettings({ model: value });
    console.log(`faster-whisper model: ${value}`);
    return true;
  }

  if (sub === "fw-device") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj device, np. cpu");
    }

    await updateLocalFasterWhisperSettings({ device: value });
    console.log(`faster-whisper device: ${value}`);
    return true;
  }

  if (sub === "fw-compute") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj compute type, np. int8");
    }

    await updateLocalFasterWhisperSettings({ computeType: value });
    console.log(`faster-whisper compute_type: ${value}`);
    return true;
  }

  if (sub === "fw-language") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj language: auto | <code> | <code>+en (np. pl+en, ja+en)");
    }

    const normalizedValue = value.trim().toLowerCase();
    const normalized = normalizedValue === "auto" ? "" : normalizedValue;
    await updateLocalFasterWhisperSettings({ language: normalized });
    console.log(`faster-whisper language: ${normalized || "auto"}`);
    return true;
  }

  if (sub === "fw-beam") {
    const value = parsePositiveInteger(args[1], "fw-beam");
    await updateLocalFasterWhisperSettings({ beamSize: value });
    console.log(`faster-whisper beam_size: ${value}`);
    return true;
  }

  if (sub === "fw-vad") {
    const enabled = parseOnOff(args[1], "fw-vad");
    await updateLocalFasterWhisperSettings({ vadFilter: enabled });
    console.log(`faster-whisper vad_filter: ${enabled}`);
    return true;
  }

  if (sub === "fw-cpu-threads") {
    const value = parsePositiveInteger(args[1], "fw-cpu-threads");
    await updateLocalFasterWhisperSettings({ cpuThreads: value });
    console.log(`faster-whisper cpu_threads: ${value}`);
    return true;
  }

  return false;
}
