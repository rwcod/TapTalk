import { PrepareLocalWhisperInput } from "../../../local/local-runtime";
import { asRecord, toPositiveInt, toTrimmedString } from "./primitives";

export function sanitizeProbePythonPath(
  value: unknown,
  fallback: string
): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error("Invalid pythonPath: expected string.");
  }

  const parsed = value.trim();
  if (parsed.length === 0) {
    return fallback;
  }

  if (parsed.length > 1024) {
    throw new Error("Invalid pythonPath: too long.");
  }

  return parsed;
}

export function sanitizePrepareLocalWhisperInput(
  value: unknown
): PrepareLocalWhisperInput {
  const raw = asRecord(value);

  const pythonPath = toTrimmedString(raw.pythonPath, "pythonPath", {
    maxLength: 1024
  });
  const model = toTrimmedString(raw.model, "model", {
    maxLength: 256
  });
  const device = toTrimmedString(raw.device, "device", {
    maxLength: 64
  });
  const computeType = toTrimmedString(raw.computeType, "computeType", {
    maxLength: 64
  });
  const cpuThreads = toPositiveInt(raw.cpuThreads, "cpuThreads", {
    min: 1,
    max: 128
  });

  if (typeof raw.installPackage !== "boolean") {
    throw new Error("Invalid installPackage value.");
  }

  return {
    pythonPath,
    model,
    device,
    computeType,
    cpuThreads,
    installPackage: raw.installPackage
  };
}
