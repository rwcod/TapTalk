import { applyPreset } from "../../settings/cloud-presets";
import { readSettings } from "../../settings";
import { ensureSafeCloudHttpProtocol } from "../../core/url-security";
import {
  isCloudBodyFormat,
  isCloudPresetName
} from "../guards";
import { updateCloudSettings } from "./shared";

export async function runCloudSettingsCommand(args: string[]): Promise<boolean> {
  const sub = args[0];

  if (sub === "cloud-preset") {
    const value = args[1];
    if (!value || !isCloudPresetName(value)) {
      throw new Error(
        "Podaj cloud-preset: openai | groq | elevenlabs | deepgram | huggingface | deapi | custom"
      );
    }

    const current = await readSettings();
    const nextCloud = applyPreset(current.cloud, value);
    await updateCloudSettings(nextCloud);
    console.log(`Cloud preset: ${value}`);
    return true;
  }

  if (sub === "cloud-key") {
    const value = args[1];
    if (typeof value !== "string") {
      throw new Error("Podaj cloud-key <api-key>");
    }

    await updateCloudSettings({ apiKey: value.trim() });
    console.log("Cloud API key zapisany.");
    return true;
  }

  if (sub === "cloud-model") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj model");
    }

    await updateCloudSettings({ model: value });
    console.log(`Cloud model: ${value}`);
    return true;
  }

  if (sub === "cloud-language") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj language: auto | <code> (np. pl, en, ja)");
    }

    const normalizedValue = value.trim().toLowerCase();
    let normalized = normalizedValue === "auto" ? "" : normalizedValue;
    if (normalized.includes("+en")) {
      normalized = "";
    }
    await updateCloudSettings({ language: normalized });
    console.log(`Cloud language: ${normalized || "auto"}`);
    return true;
  }

  if (sub === "cloud-url") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj URL");
    }

    const parsed = new URL(value);
    ensureSafeCloudHttpProtocol(parsed, "settings.cloud.url");
    await updateCloudSettings({ url: value });
    console.log("Cloud URL zapisany.");
    return true;
  }

  if (sub === "cloud-auth-header") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj nazwę headera");
    }

    await updateCloudSettings({ authHeader: value });
    console.log(`Cloud auth header: ${value}`);
    return true;
  }

  if (sub === "cloud-auth-value") {
    const value = args.slice(1).join(" ").trim();
    if (!value) {
      throw new Error("Podaj template auth value (np. Bearer {{key}})");
    }

    await updateCloudSettings({ authValueTemplate: value });
    console.log(`Cloud auth value template: ${value}`);
    return true;
  }

  if (sub === "cloud-body-format") {
    const value = args[1];
    if (!value || !isCloudBodyFormat(value)) {
      throw new Error("Podaj cloud-body-format: formdata | binary");
    }

    await updateCloudSettings({ bodyFormat: value });
    console.log(`Cloud body format: ${value}`);
    return true;
  }

  if (sub === "cloud-audio-field") {
    const value = args[1];
    if (!value) {
      throw new Error("Podaj nazwę audio field");
    }

    await updateCloudSettings({ audioFieldName: value });
    console.log(`Cloud audio field: ${value}`);
    return true;
  }

  return false;
}
