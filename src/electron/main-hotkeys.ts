import { GlobalKeyboardListener, IGlobalKeyDownMap, IGlobalKeyEvent } from "keyspy";
import { Settings } from "../core/types";
import type { DictationPhase } from "./ipc/contracts";

const FALLBACK_SHORTCUTS = ["CommandOrControl+Space", "CommandOrControl+Shift+Space"];
const FN_HOLD_ARM_DELAY_MS = 200;
const FN_LIKE_VKEYS = new Set([63, 160, 179]);
const FN_PERMISSION_ERROR_PATTERN =
  /(input monitoring|listen ?event|accessibility|not (authorized|authorised|permitted)|permission|privacy)/i;
const FN_RUNTIME_RECOVERY_PATTERN =
  /(timeout error raised on key listener|tapdisabled|tap disabled|event tap.*disabled)/i;

export type RecordingControlMode = "none" | "hold" | "toggle" | "manual";

function unique(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    if (!out.includes(trimmed)) {
      out.push(trimmed);
    }
  }
  return out;
}

export function isFnShortcut(value: string): boolean {
  return /(^|[+])\s*fn\s*($|[+])/i.test(value);
}

export function fnRequestedInSettings(settings: Settings): boolean {
  return [settings.hotkey.preferred, ...settings.hotkey.fallbacks].some((item) =>
    isFnShortcut(item)
  );
}

export function fallbackHotkeyCandidates(settings: Settings): string[] {
  return unique([
    settings.hotkey.preferred,
    ...settings.hotkey.fallbacks,
    "Control+Shift+Space",
    "Alt+Space",
    ...FALLBACK_SHORTCUTS,
    "F18"
  ]).filter((item) => !isFnShortcut(item));
}

interface FnHotkeyManagerDeps {
  resolveKeyspyServerPath: () => string | null;
  toErrorMessage: (error: unknown) => string;
  getStatusPhase: () => DictationPhase;
  getRecordingMode: () => RecordingControlMode;
  runSerialized: <T>(action: () => Promise<T>) => Promise<T>;
  startWithMode: (mode: RecordingControlMode) => Promise<unknown>;
  stopAndResetMode: () => Promise<unknown>;
  switchHoldToToggleMode: () => unknown;
  triggerCapture?: () => void;
  triggerCancel?: () => void;
  requestListenerReload?: (reason: string) => void;
}

export class FnHotkeyManager {
  private keyListener: GlobalKeyboardListener | null = null;
  private keyListenerEnabled = false;
  private keyListenerFailureReason: string | null = null;
  private fnDown = false;
  private fnComboTriggered = false;
  private fnHoldStartTimer: NodeJS.Timeout | null = null;
  private holdReleasePendingStop = false;
  private capturePending = false;

  constructor(private readonly deps: FnHotkeyManagerDeps) {}

  isListenerEnabled(): boolean {
    if (!this.keyListenerEnabled || !this.keyListener) {
      return false;
    }
    // GlobalKeyboardListener keeps a reference to its underlying child
    // process. If the MacKeyServer subprocess died (Accessibility revoked,
    // crash, etc.) the cached enabled flag would otherwise stay true and
    // mislead the UI.
    const child = (this.keyListener as unknown as {
      keyServer?: { isRunning?: () => boolean; child?: { exitCode?: number | null } };
    }).keyServer;
    if (child && typeof child.isRunning === "function") {
      try {
        if (!child.isRunning()) return false;
      } catch {
        return false;
      }
    } else if (child?.child && child.child.exitCode !== null && child.child.exitCode !== undefined) {
      return false;
    }
    return true;
  }

  getFailureReason(): string | null {
    return this.keyListenerFailureReason;
  }

  isFnDown(): boolean {
    return this.fnDown;
  }

  clearHoldReleasePendingStop(): void {
    this.holdReleasePendingStop = false;
  }

  consumeHoldReleasePendingStop(): boolean {
    const value = this.holdReleasePendingStop;
    this.holdReleasePendingStop = false;
    return value;
  }

  private clearFnHoldStartTimer(): void {
    if (!this.fnHoldStartTimer) {
      return;
    }

    clearTimeout(this.fnHoldStartTimer);
    this.fnHoldStartTimer = null;
  }

  private normalizedEventName(event: IGlobalKeyEvent): string {
    return typeof event.name === "string" ? event.name.toUpperCase() : "";
  }

  private rawKeyText(event: IGlobalKeyEvent): string {
    const rawName = event.rawKey?._nameRaw ?? "";
    const rawResolved = event.rawKey?.name ?? "";
    return `${rawName} ${rawResolved}`.toUpperCase();
  }

  private isFnPressedInDownMap(down: IGlobalKeyDownMap): boolean {
    const data = down as Record<string, boolean | undefined>;
    const directKeys = ["FN", "FUNCTION", "GLOBE", "F18"];

    for (const key of directKeys) {
      if (data[key] === true) {
        return true;
      }
    }

    for (const [key, value] of Object.entries(data)) {
      if (value !== true) {
        continue;
      }

      if (/^(FN|FUNCTION|GLOBE|F18)$/i.test(key)) {
        return true;
      }
    }

    return false;
  }

  private isFnLikeEvent(event: IGlobalKeyEvent): boolean {
    const name = this.normalizedEventName(event);
    if (name === "FN" || name === "F18" || name === "GLOBE") {
      return true;
    }

    if (FN_LIKE_VKEYS.has(event.vKey)) {
      return true;
    }

    const raw = this.rawKeyText(event);
    return (
      raw.includes("FUNCTION") ||
      raw.includes("FN") ||
      raw.includes("GLOBE") ||
      raw.includes("VK_FUNCTION")
    );
  }

  private isSpaceLikeEvent(event: IGlobalKeyEvent): boolean {
    const name = this.normalizedEventName(event);
    if (name === "SPACE") {
      return true;
    }

    const raw = this.rawKeyText(event);
    return raw.includes("SPACE");
  }

  private handleFnEvent(event: IGlobalKeyEvent): boolean {
    if (event.state === "DOWN") {
      this.fnDown = true;
      this.fnComboTriggered = false;
      this.holdReleasePendingStop = false;
      this.clearFnHoldStartTimer();

      if (this.deps.getRecordingMode() === "toggle" && this.deps.getStatusPhase() === "recording") {
        void this.deps.runSerialized(async () => this.deps.stopAndResetMode());
        return true;
      }

      if (this.deps.getStatusPhase() !== "idle") {
        return true;
      }

      this.fnHoldStartTimer = setTimeout(() => {
        this.fnHoldStartTimer = null;
        void this.deps.runSerialized(async () => {
          if (!this.fnDown || this.fnComboTriggered) {
            return undefined;
          }

          if (this.deps.getStatusPhase() !== "idle") {
            return undefined;
          }

          return this.deps.startWithMode("hold");
        });
      }, FN_HOLD_ARM_DELAY_MS);

      return true;
    }

    this.fnDown = false;
    this.clearFnHoldStartTimer();

    if (this.capturePending) {
      this.capturePending = false;
      this.fnComboTriggered = false;
      // Small delay so the Fn key-up fully propagates before the synthetic Cmd+C.
      setTimeout(() => this.deps.triggerCapture?.(), 120);
      return true;
    }

    if (this.fnComboTriggered) {
      this.fnComboTriggered = false;
      return true;
    }

    if (this.deps.getRecordingMode() === "hold" && this.deps.getStatusPhase() === "starting") {
      this.holdReleasePendingStop = true;
      return true;
    }

    if (this.deps.getRecordingMode() === "hold" && this.deps.getStatusPhase() === "recording") {
      void this.deps.runSerialized(async () => this.deps.stopAndResetMode());
      return true;
    }

    return true;
  }

  private handleFnSpaceEvent(event: IGlobalKeyEvent, down: IGlobalKeyDownMap): boolean {
    const fnPressed = this.fnDown || this.isFnPressedInDownMap(down);
    if (!fnPressed) {
      return false;
    }

    if (event.state === "DOWN") {
      this.fnComboTriggered = true;
      this.clearFnHoldStartTimer();
      void this.deps.runSerialized(async () => {
        if (this.deps.getStatusPhase() === "idle") {
          return this.deps.startWithMode("toggle");
        }

        if (
          this.deps.getRecordingMode() === "hold" &&
          this.deps.getStatusPhase() === "recording"
        ) {
          this.deps.switchHoldToToggleMode();
          return undefined;
        }

        if (
          this.deps.getRecordingMode() === "toggle" &&
          this.deps.getStatusPhase() === "recording"
        ) {
          return this.deps.stopAndResetMode();
        }

        return undefined;
      });
    }

    return true;
  }

  private handleGlobalKey(event: IGlobalKeyEvent, down: IGlobalKeyDownMap): boolean {
    // Esc aborts an in-progress dictation (e.g. hotkey hit by accident). Only
    // act while recording/starting, and only then consume the key.
    if (
      event.state === "DOWN" &&
      this.normalizedEventName(event) === "ESCAPE" &&
      (this.deps.getStatusPhase() === "recording" || this.deps.getStatusPhase() === "starting")
    ) {
      this.deps.triggerCancel?.();
      return true;
    }

    if (this.isFnLikeEvent(event)) {
      return this.handleFnEvent(event);
    }

    if (this.isSpaceLikeEvent(event)) {
      return this.handleFnSpaceEvent(event, down);
    }

    if (this.fnDown && this.normalizedEventName(event) === "M" && event.state === "DOWN") {
      // Only capture from idle. If dictation already armed/started (held Fn past
      // the hold delay), let the normal flow handle it rather than orphaning a
      // recording.
      if (this.deps.getStatusPhase() !== "idle") {
        return false;
      }
      // Defer the actual capture to Fn release — sending the synthetic Cmd+C
      // while Fn is physically held taints it with the Fn modifier and the copy
      // silently fails ("nothing selected").
      this.capturePending = true;
      this.fnComboTriggered = true;
      this.clearFnHoldStartTimer();
      return true;
    }

    if (this.fnDown && this.deps.getStatusPhase() === "idle" && event.state === "DOWN") {
      this.fnComboTriggered = true;
      this.clearFnHoldStartTimer();
      return true;
    }

    return false;
  }

  private isPermissionRelatedFailure(text: string): boolean {
    return FN_PERMISSION_ERROR_PATTERN.test(text);
  }

  private isRuntimeRecoverableFailure(text: string): boolean {
    return FN_RUNTIME_RECOVERY_PATTERN.test(text);
  }

  async enableListener(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return false;
    }

    if (this.keyListener) {
      return this.keyListenerEnabled && !this.keyListenerFailureReason;
    }

    try {
      const serverPath = this.deps.resolveKeyspyServerPath();
      this.keyListenerFailureReason = null;
      let listener: GlobalKeyboardListener | null = null;
      const macConfig = {
        appName: "TapTalk",
        onInfo: (data: string) => {
          const text = data.trim();
          if (!text) {
            return;
          }

          if (text && this.isPermissionRelatedFailure(text)) {
            this.keyListenerFailureReason = text;
            this.keyListenerEnabled = false;
            if (listener) {
              listener.kill();
              listener = null;
            }
            this.keyListener = null;
            return;
          }

          if (this.isRuntimeRecoverableFailure(text)) {
            const reason = `key listener runtime warning: ${text}`;
            this.keyListenerFailureReason = reason;
            this.keyListenerEnabled = false;
            if (listener) {
              listener.kill();
              listener = null;
            }
            this.keyListener = null;
            this.deps.requestListenerReload?.(reason);
          }
        },
        onError: (code: number | null) => {
          const reason = `key listener terminated (code: ${code ?? "unknown"})`;
          this.keyListenerFailureReason = reason;
          this.keyListenerEnabled = false;
          this.keyListener = null;
          console.error("Fn listener terminated:", reason);
          this.deps.requestListenerReload?.(reason);
        }
      };
      const listenerConfig = serverPath
        ? {
            appName: "TapTalk",
            mac: {
              ...macConfig,
              serverPath
            }
          }
        : {
            appName: "TapTalk",
            mac: macConfig
          };

      listener = new GlobalKeyboardListener({
        ...listenerConfig
      });

      await listener.addListener((event, down) => this.handleGlobalKey(event, down));
      if (this.keyListenerFailureReason) {
        listener.kill();
        listener = null;
        this.keyListener = null;
        this.keyListenerEnabled = false;
        return false;
      }

      this.keyListener = listener;
      this.keyListenerEnabled = true;
      return true;
    } catch (error) {
      this.keyListenerEnabled = false;
      this.keyListener = null;
      this.keyListenerFailureReason = this.deps.toErrorMessage(error);
      console.error("Fn listener unavailable:", error);
      return false;
    }
  }

  disableListener(): void {
    this.fnDown = false;
    this.fnComboTriggered = false;
    this.holdReleasePendingStop = false;
    this.capturePending = false;
    this.clearFnHoldStartTimer();

    if (!this.keyListener) {
      this.keyListenerEnabled = false;
      this.keyListenerFailureReason = null;
      return;
    }

    this.keyListener.kill();
    this.keyListener = null;
    this.keyListenerEnabled = false;
    this.keyListenerFailureReason = null;
  }
}
