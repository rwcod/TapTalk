import {
  CloudBodyFormat,
  CloudPresetName,
  CloudSecretBackend,
  ProviderMode
} from "../core/types";

export function isProviderMode(value: string): value is ProviderMode {
  return value === "local" || value === "cloud";
}

export function isCloudPresetName(value: string): value is CloudPresetName {
  return (
    value === "openai" ||
    value === "groq" ||
    value === "elevenlabs" ||
    value === "deepgram" ||
    value === "huggingface" ||
    value === "deapi" ||
    value === "custom"
  );
}

export function isCloudBodyFormat(value: string): value is CloudBodyFormat {
  return value === "formdata" || value === "binary";
}

export function isCloudSecretBackend(value: string): value is CloudSecretBackend {
  return value === "safeStorage" || value === "settings";
}

export function parseOnOff(value: string | undefined, label: string): boolean {
  if (value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  throw new Error(`Podaj ${label}: on | off`);
}

export function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Podaj ${label} jako dodatnią liczbę całkowitą.`);
  }
  return parsed;
}
