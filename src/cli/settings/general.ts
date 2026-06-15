import { setMode, updateSettings } from "../../settings";
import {
  isCloudSecretBackend,
  isProviderMode,
  parseOnOff
} from "../guards";
import { printSettings } from "./shared";

export async function runGeneralSettingsCommand(args: string[]): Promise<boolean> {
  const sub = args[0];

  if (!sub || sub === "show") {
    await printSettings();
    return true;
  }

  if (sub === "mode") {
    const mode = args[1];
    if (!mode || !isProviderMode(mode)) {
      throw new Error("Podaj mode: local | cloud");
    }

    const next = await setMode(mode);
    console.log(`Mode ustawiony na: ${next.mode}`);
    return true;
  }

  if (sub === "fallback") {
    const enabled = parseOnOff(args[1], "fallback");
    await updateSettings({ fallback: { enabled } });
    console.log(`Fallback: ${enabled ? "on" : "off"}`);
    return true;
  }

  if (sub === "autopaste") {
    const enabled = parseOnOff(args[1], "autopaste");
    await updateSettings({ autoPaste: enabled });
    console.log(`Auto-paste: ${enabled ? "on" : "off"}`);
    return true;
  }

  if (sub === "cloud-secret-backend") {
    const value = args[1];
    if (!value || !isCloudSecretBackend(value)) {
      throw new Error("Podaj cloud-secret-backend: safeStorage | settings");
    }

    const next = await updateSettings({ cloudSecretBackend: value });
    console.log(`Cloud secret backend: ${next.cloudSecretBackend}`);
    return true;
  }

  return false;
}
