import { DictationSessionManager, DictationStopResult } from "../runtime/dictation-session";
import { organizeInbox } from "../runtime/vault-tag";
import { Settings } from "../core/types";
import { DictationStatusPayload } from "./ipc/contracts";
import { RecordingControlMode } from "./main-hotkeys";
import type { TranscriptEntry } from "../runtime/transcript-history";

interface DictationControllerDeps {
  dictation: DictationSessionManager;
  getStatus: () => DictationStatusPayload;
  setStatus: (next: Partial<DictationStatusPayload>) => DictationStatusPayload;
  replaceStatusSilently: (next: DictationStatusPayload) => void;
  getSettingsCache: () => Settings | null;
  resetIndicatorBars: () => void;
  getRecordingMode: () => RecordingControlMode;
  setRecordingMode: (mode: RecordingControlMode) => void;
  isFnDown: () => boolean;
  consumeHoldReleasePendingStop: () => boolean;
  clearHoldReleasePendingStop: () => void;
  toErrorMessage: (error: unknown) => string;
  appendAndSaveTranscript: (
    text: string,
    current: TranscriptEntry[]
  ) => Promise<TranscriptEntry[]>;
  appendRecentTranscript: (text: string, current: TranscriptEntry[]) => TranscriptEntry[];
  readTranscriptHistory: () => Promise<TranscriptEntry[]>;
}

export interface DictationController {
  runSerialized<T>(action: () => Promise<T>): Promise<T>;
  loadRecentTranscriptsAtStartup(): Promise<void>;
  startDictation(): Promise<DictationStatusPayload>;
  stopDictation(): Promise<DictationStatusPayload>;
  startDictationWithMode(mode: RecordingControlMode): Promise<DictationStatusPayload>;
  stopDictationAndResetMode(): Promise<DictationStatusPayload>;
  cancelDictation(): Promise<DictationStatusPayload>;
}

function recordingModeSuffix(mode: RecordingControlMode): string {
  if (mode === "hold") {
    return " [hold Fn]";
  }
  if (mode === "toggle") {
    return " [hands-free]";
  }
  return "";
}

function isAutoPasteAccessibilityError(message: string): boolean {
  return /(\(1002\)|not authoris|not authorized|nie ma zezwolenia|osascript)/i.test(message);
}

function buildEditCompletionMessage(result: DictationStopResult): string {
  if (result.editReplaced) {
    return "Replaced selected text";
  }
  if (result.editNeedsProvider) {
    return "Configure an edit provider to transform selected text";
  }
  if (result.editError) {
    if (isAutoPasteAccessibilityError(result.editError)) {
      return "Enable Accessibility for TapTalk to edit selected text";
    }
    return "Could not transform selected text — original text was not changed";
  }
  return "Original text was not changed";
}

function buildCompletionMessage(result: DictationStopResult): string {
  if (result.mode === "edit") {
    return buildEditCompletionMessage(result);
  }

  const hasText = result.text.trim().length > 0;
  const base = hasText ? "Done" : "Done (empty)";

  if (result.autoPasteError) {
    if (isAutoPasteAccessibilityError(result.autoPasteError)) {
      return `${base} — enable Accessibility for TapTalk to auto-paste`;
    }
    return `${base}, paste failed`;
  }

  if (result.autoPasted && hasText) {
    return `${base}, pasted`;
  }

  return base;
}

export function createDictationController(deps: DictationControllerDeps): DictationController {
  let serial = Promise.resolve<void>(undefined);

  function runSerialized<T>(action: () => Promise<T>): Promise<T> {
    const task = serial.then(action);
    serial = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  async function stopDictationAndResetMode(): Promise<DictationStatusPayload> {
    const next = await stopDictation();
    deps.setRecordingMode("none");
    deps.clearHoldReleasePendingStop();
    return next;
  }

  async function cancelDictation(): Promise<DictationStatusPayload> {
    const current = deps.getStatus();
    if (current.phase !== "recording" && current.phase !== "starting") {
      return current;
    }
    deps.resetIndicatorBars();
    try {
      await deps.dictation.cancel();
    } catch {
      // discarding anyway
    }
    deps.setRecordingMode("none");
    deps.clearHoldReleasePendingStop();
    return deps.setStatus({
      phase: "idle",
      dictationMode: "dictation",
      message: "Canceled",
      error: undefined
    });
  }

  async function startDictation(): Promise<DictationStatusPayload> {
    const current = deps.getStatus();
    if (current.phase !== "idle") {
      return current;
    }

    const settingsCache = deps.getSettingsCache();
    if (settingsCache && !settingsCache.onboardingCompleted) {
      return deps.setStatus({
        message: "Complete setup wizard to continue.",
        error: undefined
      });
    }

    deps.resetIndicatorBars();

    deps.setStatus({
      phase: "starting",
      dictationMode: "dictation",
      provider: current.provider,
      message: `Starting${recordingModeSuffix(deps.getRecordingMode())}...`,
      error: undefined
    });

    try {
      const started = await deps.dictation.start();

      const recordingMessage =
        started.mode === "edit"
          ? `Selected text detected — listening for edit command${recordingModeSuffix(deps.getRecordingMode())}...`
          : `Recording${recordingModeSuffix(deps.getRecordingMode())}...`;

      const next = deps.setStatus({
        phase: "recording",
        dictationMode: started.mode,
        provider: started.provider,
        message: recordingMessage,
        error: undefined
      });

      if (
        deps.getRecordingMode() === "hold" &&
        (!deps.isFnDown() || deps.consumeHoldReleasePendingStop())
      ) {
        return stopDictationAndResetMode();
      }

      return next;
    } catch (error) {
      deps.resetIndicatorBars();
      deps.clearHoldReleasePendingStop();
      return deps.setStatus({
        phase: "idle",
        dictationMode: "dictation",
        message: "Start failed",
        error: deps.toErrorMessage(error)
      });
    }
  }

  async function stopDictation(): Promise<DictationStatusPayload> {
    const current = deps.getStatus();
    if (current.phase !== "recording") {
      return current;
    }

    deps.resetIndicatorBars();

    const activeDictationMode = current.dictationMode ?? "dictation";
    deps.setStatus(
      activeDictationMode === "edit"
        ? {
            phase: "editing",
            dictationMode: "edit",
            message: "Editing selected text..."
          }
        : {
            phase: "transcribing",
            dictationMode: "dictation",
            message: "Transcribing..."
          }
    );

    try {
      const result = await deps.dictation.stop();
      const currentStatus = deps.getStatus();
      let recentTranscripts = currentStatus.recentTranscripts;

      // Edit mode never persists selected text, the spoken command, or the
      // replacement into transcript history.
      if (result.mode === "edit") {
        return deps.setStatus({
          phase: "idle",
          dictationMode: "dictation",
          provider: result.provider,
          message: buildCompletionMessage(result),
          recentTranscripts,
          error: result.editError
        });
      }

      const cleanedText = result.text.trim();

      if (cleanedText) {
        try {
          recentTranscripts = await deps.appendAndSaveTranscript(
            cleanedText,
            currentStatus.recentTranscripts
          );
        } catch (error) {
          console.error("Nie udało się zapisać historii transkrypcji:", error);
          recentTranscripts = deps.appendRecentTranscript(
            cleanedText,
            currentStatus.recentTranscripts
          );
        }
      }

      return deps.setStatus({
        phase: "idle",
        dictationMode: "dictation",
        provider: result.provider,
        message: buildCompletionMessage(result),
        lastText: result.text,
        recentTranscripts,
        error: result.autoPasteError
      });
    } catch (error) {
      return deps.setStatus({
        phase: "idle",
        dictationMode: "dictation",
        message: "Stop failed",
        error: deps.toErrorMessage(error)
      });
    }
  }

  async function startDictationWithMode(
    mode: RecordingControlMode
  ): Promise<DictationStatusPayload> {
    const current = deps.getStatus();
    if (current.phase !== "idle") {
      return current;
    }

    deps.clearHoldReleasePendingStop();
    deps.setRecordingMode(mode);
    const next = await startDictation();

    if (next.phase === "idle") {
      deps.setRecordingMode("none");
    }

    return next;
  }

  async function loadRecentTranscriptsAtStartup(): Promise<void> {
    // Reconcile any tagged notes still in the inbox into their tag folders.
    void organizeInbox().catch(() => undefined);
    try {
      const recentTranscripts = await deps.readTranscriptHistory();
      const current = deps.getStatus();
      deps.replaceStatusSilently({
        ...current,
        recentTranscripts,
        lastText: recentTranscripts.length > 0 ? recentTranscripts[0].text : undefined
      });
    } catch (error) {
      console.error("Nie udało się odczytać historii transkrypcji:", error);
    }
  }

  return {
    runSerialized,
    loadRecentTranscriptsAtStartup,
    startDictation,
    stopDictation,
    startDictationWithMode,
    stopDictationAndResetMode,
    cancelDictation
  };
}
