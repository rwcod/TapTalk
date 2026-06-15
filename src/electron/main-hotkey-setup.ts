import { execFileSync } from "node:child_process";
import { Settings } from "../core/types";
import { DictationStatusPayload } from "./ipc/contracts";

function readMacGlobeKeyUsage(): number | null {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const stdout = execFileSync("defaults", ["read", "-g", "AppleFnUsageType"], {
      encoding: "utf8",
      timeout: 1500
    });
    const value = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function describeGlobeKeyConflict(usage: number | null): string | null {
  if (usage === 1) {
    return "macOS Fn key = Change input source. Open System Settings → Keyboard → Press 🌐 key to → Nothing (or Show Emoji).";
  }
  if (usage === 3) {
    return "macOS Fn key = Start dictation. Open System Settings → Keyboard → Press 🌐 key to → Nothing.";
  }
  return null;
}

interface ReloadSettingsAndHotkeysOptions {
  readSettings: () => Promise<Settings>;
  setSettingsCache: (settings: Settings) => void;
  unregisterAllShortcuts: () => void;
  disableFnKeyListener: () => void;
  registerFallbackShortcuts: (settings: Settings) => string;
  shouldEnableFnForSettings: (settings: Settings) => boolean;
  enableFnKeyListener: () => Promise<boolean>;
  isFnListenerEnabled: () => boolean;
  getFnFailureReason: () => string | null | undefined;
  getFallbackHotkey: () => string;
  setFallbackHotkey: (value: string) => void;
  getStatus: () => DictationStatusPayload;
  setStatus: (next: Partial<DictationStatusPayload>) => DictationStatusPayload;
}

function buildActiveHotkeyLabel(options: {
  isFnListenerEnabled: () => boolean;
  getFallbackHotkey: () => string;
}): string {
  const labels: string[] = [];
  if (options.isFnListenerEnabled()) {
    labels.push("Fn hold / Fn+Space");
  }

  const fallbackHotkey = options.getFallbackHotkey();
  if (fallbackHotkey !== "not registered") {
    labels.push(fallbackHotkey);
  }

  if (labels.length === 0) {
    return "not registered";
  }

  return labels.join(" + ");
}

export async function reloadSettingsAndHotkeys(
  options: ReloadSettingsAndHotkeysOptions
): Promise<Settings> {
  const settings = await options.readSettings();
  options.setSettingsCache(settings);

  if (!settings.onboardingCompleted) {
    options.unregisterAllShortcuts();
    options.setFallbackHotkey("not registered");
    options.disableFnKeyListener();

    const current = options.getStatus();
    options.setStatus({
      hotkeyPreferred: settings.hotkey.preferred,
      hotkeyActive: "setup pending",
      fnPermissionRequired: false,
      message: current.phase === "idle" ? "Complete setup wizard to continue." : current.message
    });
    return settings;
  }

  options.setFallbackHotkey(options.registerFallbackShortcuts(settings));

  const shouldEnableFn = options.shouldEnableFnForSettings(settings);
  let fnEnabled = false;
  if (shouldEnableFn) {
    fnEnabled = await options.enableFnKeyListener();
  } else {
    options.disableFnKeyListener();
  }

  const fnFailureReason = options.getFnFailureReason()?.trim();

  const activeHotkey = buildActiveHotkeyLabel({
    isFnListenerEnabled: options.isFnListenerEnabled,
    getFallbackHotkey: options.getFallbackHotkey
  });
  const fnNeedsPermissionHint = shouldEnableFn && (!fnEnabled || Boolean(fnFailureReason));

  let idleMessage = "No global hotkey registered";
  if (activeHotkey !== "not registered") {
    idleMessage = `Ready (${activeHotkey})`;
  }

  if (fnNeedsPermissionHint) {
    const hintDetail = fnFailureReason ? ` (${fnFailureReason})` : "";
    idleMessage =
      activeHotkey === "not registered"
        ? `Fn unavailable (grant Accessibility in macOS Privacy settings)${hintDetail}`
        : `Fn unavailable (grant Accessibility), using ${activeHotkey}${hintDetail}`;
  }

  if (shouldEnableFn) {
    const globeConflict = describeGlobeKeyConflict(readMacGlobeKeyUsage());
    if (globeConflict) {
      idleMessage = `${idleMessage} — ${globeConflict}`;
    }
  }

  const current = options.getStatus();
  options.setStatus({
    hotkeyPreferred: settings.hotkey.preferred,
    hotkeyActive: activeHotkey,
    fnPermissionRequired: fnNeedsPermissionHint,
    message: current.phase === "idle" ? idleMessage : current.message
  });

  return settings;
}
