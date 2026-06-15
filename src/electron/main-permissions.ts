import { Settings } from "../core/types";
import { CheckPermissionsOptions, PermissionsStatus } from "./ipc/contracts";

function normalizeMicrophoneStatus(
  value: string
): "not-determined" | "granted" | "denied" | "restricted" {
  if (
    value === "not-determined" ||
    value === "granted" ||
    value === "denied" ||
    value === "restricted"
  ) {
    return value;
  }
  return "not-determined";
}

export function parseCheckPermissionsOptions(raw: unknown): CheckPermissionsOptions {
  if (!raw || typeof raw !== "object") {
    return { probeFnListener: false };
  }

  const value = raw as { probeFnListener?: unknown };
  return {
    probeFnListener: value.probeFnListener === true
  };
}

interface CollectPermissionSnapshotOptions extends CheckPermissionsOptions {
  settings: Settings;
  platform: NodeJS.Platform;
  fnRequestedInSettings: (settings: Settings) => boolean;
  isAccessibilityEnabled: () => boolean;
  getMicrophoneAccessStatus: () => string;
  isFnListenerEnabled: () => boolean;
  getFnFailureReason: () => string | null;
  enableFnKeyListener: () => Promise<boolean>;
  disableFnKeyListener: () => void;
}

function fnListenerUsable(fnListenerReady: boolean, fnFailureReason?: string): boolean {
  if (!fnListenerReady) {
    return false;
  }
  return !(fnFailureReason && fnFailureReason.trim().length > 0);
}

export async function collectPermissionSnapshot(
  options: CollectPermissionSnapshotOptions
): Promise<PermissionsStatus> {
  const settings = options.settings;
  const fnRequired = options.fnRequestedInSettings(settings);

  if (options.platform !== "darwin") {
    return {
      accessibility: true,
      microphone: "granted",
      fnRequired,
      fnState: fnRequired ? "ready" : "not-required",
      fnListenerReady: fnRequired ? options.isFnListenerEnabled() : true,
      fnFailureReason: options.getFnFailureReason() ?? undefined
    };
  }

  const accessibility = options.isAccessibilityEnabled();
  const microphone = normalizeMicrophoneStatus(options.getMicrophoneAccessStatus());

  if (!fnRequired) {
    return {
      accessibility,
      microphone,
      fnRequired,
      fnState: "not-required",
      fnListenerReady: true
    };
  }

  if (!accessibility) {
    return {
      accessibility,
      microphone,
      fnRequired,
      fnState: "needs-accessibility",
      fnListenerReady: false
    };
  }

  let fnListenerReady = options.isFnListenerEnabled();
  let fnFailureReason = options.getFnFailureReason()?.trim() || undefined;

  if (options.probeFnListener === true) {
    options.disableFnKeyListener();
    fnListenerReady = await options.enableFnKeyListener();
    fnFailureReason = options.getFnFailureReason()?.trim() || undefined;

    // Keep onboarding deterministic: listener is probed in wizard but enabled only after setup.
    if (!settings.onboardingCompleted) {
      options.disableFnKeyListener();
    }
  }

  const listenerReady = fnListenerUsable(fnListenerReady, fnFailureReason);

  return {
    accessibility,
    microphone,
    fnRequired,
    fnState: listenerReady ? "ready" : "needs-input-monitoring-or-restart",
    fnListenerReady: listenerReady,
    fnFailureReason
  };
}
