import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  autoPasteText,
  captureSelectedText,
  FrontmostApp,
  getFrontmostApp,
  replaceSelectedText
} from "./autopaste";
import { createProvider, TranscriptionProvider } from "../providers";
import { RecordingSession, startRecording } from "./recording";
import { readSettings } from "../settings";
import { normalizeTranscript } from "./text-normalization";
import { buildInitialPrompt, loadDictionary, Replacement } from "./dictionary";
import { retrieveVaultContext } from "./vault-retrieval";
import {
  EditProviderNotConfiguredError,
  isSelectedTextEditingEnabled,
  transformSelectedText
} from "./command-edit";
import { Settings } from "../core/types";

export type DictationMode = "dictation" | "edit";

export interface DictationStartResult {
  provider: string;
  /** "edit" when a non-empty selection was detected at activation. */
  mode: DictationMode;
}

export interface DictationStopResult {
  mode: DictationMode;
  provider: string;
  /** Dictation transcript. Always empty string in edit mode (privacy). */
  text: string;
  autoPasted: boolean;
  autoPasteError?: string;
  /** Edit-mode only. */
  editProvider?: string;
  editReplaced?: boolean;
  /** True when the edit could not run because no provider is configured. */
  editNeedsProvider?: boolean;
  editError?: string;
}

interface ActiveSession {
  settings: Settings;
  provider: TranscriptionProvider;
  replacements: Replacement[];
  targetApp?: FrontmostApp;
  targetAppPromise?: Promise<FrontmostApp | null>;
  tempDir: string;
  recording: RecordingSession;
  selectedText?: string;
  previousClipboard?: string | null;
}

interface DictationSessionHooks {
  onAudioLevel?: (level: number) => void;
  getPasteHelperPath?: () => string | null;
  onThinking?: () => void;
}

// A valid WAV with even a fraction of a second of speech is comfortably larger
// than this; below it means an empty/failed/too-short capture.
const MIN_AUDIO_BYTES = 1024;

async function createTempAudioPath(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "taptalk-audio-"));
  const file = path.join(dir, `capture-${Date.now()}.wav`);
  return { dir, file };
}

async function resolveTargetApp(
  targetAppPromise: Promise<FrontmostApp | null> | undefined,
  timeoutMs: number
): Promise<FrontmostApp | undefined> {
  if (!targetAppPromise) {
    return undefined;
  }

  let timeout: NodeJS.Timeout | null = null;

  try {
    const timeoutPromise = new Promise<FrontmostApp | null>((resolve) => {
      timeout = setTimeout(() => resolve(null), timeoutMs);
    });

    const value = await Promise.race([targetAppPromise, timeoutPromise]);
    return value ?? undefined;
  } catch {
    return undefined;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export class DictationSessionManager {
  private active: ActiveSession | null = null;

  constructor(private readonly hooks: DictationSessionHooks = {}) {}

  isActive(): boolean {
    return this.active !== null;
  }

  getActiveProviderName(): string | null {
    return this.active?.provider.name ?? null;
  }

  async start(): Promise<DictationStartResult> {
    if (this.active) {
      throw new Error("Sesja dyktowania już trwa.");
    }

    const settings = await readSettings();
    const { dir, file } = await createTempAudioPath();
    const targetAppPromise =
      settings.autoPaste || isSelectedTextEditingEnabled(settings)
        ? getFrontmostApp().catch(() => null)
        : undefined;

    // Probe the active selection BEFORE recording so the target app is still
    // frontmost. Best-effort: any failure falls back to normal dictation.
    let selectedText: string | undefined;
    let previousClipboard: string | null | undefined;
    if (isSelectedTextEditingEnabled(settings)) {
      try {
        const capture = await captureSelectedText({
          pasteHelperPath: this.hooks.getPasteHelperPath?.() ?? null
        });
        selectedText = capture.selectedText ?? undefined;
        previousClipboard = capture.previousClipboard;
      } catch {
        selectedText = undefined;
      }
      // Privacy-safe: log only the detection outcome and length, never content.
      console.log(
        `[taptalk:edit] selection probe -> detected=${Boolean(selectedText)} length=${selectedText?.length ?? 0}`
      );
    }

    try {
      const recording = await startRecording(settings.recording.commandTemplate, file, {
        onAudioLevel: this.hooks.onAudioLevel
      });
      const dictionary = await loadDictionary();
      const provider = createProvider(settings, buildInitialPrompt(dictionary.terms));

      this.active = {
        settings,
        provider,
        replacements: dictionary.replacements,
        targetAppPromise,
        tempDir: dir,
        recording,
        selectedText,
        previousClipboard
      };

      return {
        provider: provider.name,
        mode: selectedText ? "edit" : "dictation"
      };
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      throw error;
    }
  }

  async stop(): Promise<DictationStopResult> {
    if (!this.active) {
      throw new Error("Brak aktywnej sesji dyktowania.");
    }

    const session = this.active;
    this.active = null;

    try {
      if (!session.recording.outputPath) {
        throw new Error("Brak aktywnego nagrania.");
      }

      await session.recording.stop();

      // A too-short or failed capture leaves no / an empty WAV. Don't hand the
      // transcriber a missing file (whisper.cpp dumps its usage text); treat it
      // as "nothing recorded" so the empty-text paths below handle it cleanly.
      let audioBytes = 0;
      try {
        audioBytes = (await stat(session.recording.outputPath)).size;
      } catch {
        audioBytes = 0;
      }
      let text = "";
      if (audioBytes < MIN_AUDIO_BYTES) {
        console.log(`[taptalk:dictation] no audio captured (${audioBytes} bytes) — skipping transcription`);
      } else {
        text = normalizeTranscript(
          await session.provider.transcribe(session.recording.outputPath),
          session.replacements
        );
      }

      const editing = session.selectedText && session.selectedText.trim().length > 0;
      if (editing) {
        // `text` here is the spoken EDIT COMMAND, never pasted as-is.
        return await this.runEditPath(session, text);
      }

      let autoPasted = false;
      let autoPasteError: string | undefined;
      const targetApp =
        session.targetApp ??
        (session.settings.autoPaste
          ? await resolveTargetApp(session.targetAppPromise, 350)
          : undefined);

      if (session.settings.autoPaste && text.trim().length > 0) {
        try {
          await autoPasteText(text, {
            targetApp,
            pasteHelperPath: this.hooks.getPasteHelperPath?.() ?? null
          });
          autoPasted = true;
        } catch (error) {
          autoPasteError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        mode: "dictation",
        provider: session.provider.name,
        text,
        autoPasted,
        autoPasteError
      };
    } finally {
      await this.cleanupSession(session);
    }
  }

  private async runEditPath(
    session: ActiveSession,
    commandText: string
  ): Promise<DictationStopResult> {
    const providerName = session.provider.name;
    const selectedText = session.selectedText ?? "";

    // An empty command means we never heard an edit instruction. Leave the
    // selection untouched rather than guessing.
    if (commandText.trim().length === 0) {
      return {
        mode: "edit",
        provider: providerName,
        text: "",
        autoPasted: false,
        editReplaced: false,
        editError: "No edit command was heard."
      };
    }

    const targetApp =
      session.targetApp ??
      (await resolveTargetApp(session.targetAppPromise, 350));

    console.log(
      `[taptalk:edit] route=edit command_length=${commandText.trim().length} provider=${session.settings.editing.provider}`
    );

    this.hooks.onThinking?.();

    try {
      const result = await transformSelectedText(
        {
          selectedText,
          commandText,
          language: session.settings.localFasterWhisper.language || undefined,
          appName: targetApp?.name,
          contentType: "unknown"
        },
        session.settings.editing,
        {
          retrieveContext: (cmd, sel) =>
            retrieveVaultContext(cmd, sel, session.settings.editing, session.settings.vault)
        }
      );

      try {
        await replaceSelectedText(result.replacementText, {
          targetApp,
          pasteHelperPath: this.hooks.getPasteHelperPath?.() ?? null,
          previousClipboard: session.previousClipboard ?? null
        });
      } catch (error) {
        return {
          mode: "edit",
          provider: providerName,
          text: "",
          autoPasted: false,
          editProvider: result.provider,
          editReplaced: false,
          editError: error instanceof Error ? error.message : String(error)
        };
      }

      console.log(
        `[taptalk:edit] replaced via ${result.provider}${
          result.latencyMs ? ` in ${result.latencyMs}ms` : ""
        }`
      );

      return {
        mode: "edit",
        provider: providerName,
        text: "",
        autoPasted: true,
        editProvider: result.provider,
        editReplaced: true
      };
    } catch (error) {
      // Original selected text is left unchanged on any transform failure.
      const needsProvider = error instanceof EditProviderNotConfiguredError;
      console.log(
        `[taptalk:edit] transform failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        mode: "edit",
        provider: providerName,
        text: "",
        autoPasted: false,
        editReplaced: false,
        editNeedsProvider: needsProvider,
        editError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async cancel(): Promise<void> {
    if (!this.active) {
      return;
    }

    const session = this.active;
    this.active = null;

    try {
      await session.recording.stop();
    } catch {
      // ignore cancellation errors
    } finally {
      await this.cleanupSession(session);
    }
  }

  private async cleanupSession(session: ActiveSession): Promise<void> {
    await rm(session.tempDir, { recursive: true, force: true });
  }
}
