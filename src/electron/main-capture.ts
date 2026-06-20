import { captureSelectedText, getFrontmostAppName } from "../runtime/autopaste";
import {
  captureToVault,
  getCaptureDir,
  getVaultDir,
  listKnowledgeVault,
  readVaultEntryBody,
  usesTapTalkCaptureDestination
} from "../runtime/vault";
import { suggestVaultLinks } from "../runtime/vault-links";
import { organizeInbox, tagInbox, tagNoteFile } from "../runtime/vault-tag";
import type { EditingConfig, VaultConfig } from "../core/types";
import path from "node:path";

// The pill indicator (same one the other actions use) is the signal the user
// actually sees — the tray status message alone is invisible in normal use.
function feedback(deps: CaptureDeps, message: string, durationMs?: number): void {
  deps.flashPill(message, durationMs);
}

// Tag in the background a few seconds after the last capture, so a burst of
// clips triggers a single pass. Failures are retried on the next pass.
const TAGGING_DEBOUNCE_MS = 4000;
const CAPTURE_FEEDBACK_MS = 4000;
let taggingTimer: NodeJS.Timeout | null = null;
const pendingTagFiles = new Set<string>();

function scheduleTagging(getEditingConfig: () => EditingConfig, filePath?: string): void {
  if (filePath) {
    pendingTagFiles.add(filePath);
  }
  if (taggingTimer) {
    clearTimeout(taggingTimer);
  }
  taggingTimer = setTimeout(() => {
    taggingTimer = null;
    const files = [...pendingTagFiles];
    pendingTagFiles.clear();
    const config = getEditingConfig();
    void Promise.all(files.map((file) => tagNoteFile(file, config)))
      .then(() => tagInbox(config))
      .catch(() => undefined)
      .finally(() => void organizeInbox().catch(() => undefined));
  }, TAGGING_DEBOUNCE_MS);
}

export interface CaptureDeps {
  isIdle: () => boolean;
  getPasteHelperPath: () => string | null;
  getEditingConfig: () => EditingConfig;
  getVaultConfig: () => VaultConfig;
  flashPill: (label: string, durationMs?: number) => void;
  toErrorMessage: (error: unknown) => string;
  runSerialized: <T>(action: () => Promise<T>) => Promise<T>;
}

export async function countCaptureLinkSuggestions(
  filePath: string,
  vaultConfig: VaultConfig
): Promise<number> {
  const entries = await listKnowledgeVault(vaultConfig);
  const capturedPath = path.resolve(filePath);
  const current = entries.find((entry) =>
    path.resolve(entry.rootPath ?? getVaultDir(), entry.file) === capturedPath
  );
  if (!current) {
    return 0;
  }
  const body = await readVaultEntryBody(current);
  return suggestVaultLinks(current, body ?? "", entries).length;
}

function scheduleLinkFeedback(deps: CaptureDeps, filePath: string, vaultConfig: VaultConfig): void {
  void countCaptureLinkSuggestions(filePath, vaultConfig)
    .then((count) => {
      const label =
        count === 0 ? "Captured · no links" :
        count === 1 ? "Captured · 1 link" :
        `Captured · ${count} links`;
      feedback(deps, label, CAPTURE_FEEDBACK_MS);
    })
    .catch(() => undefined);
}

async function captureSelectionToVault(deps: CaptureDeps): Promise<void> {
  if (!deps.isIdle()) {
    return;
  }

  // Read the frontmost app before touching the clipboard.
  const source = await getFrontmostAppName().catch(() => null);
  const selection = await captureSelectedText({ pasteHelperPath: deps.getPasteHelperPath() });

  if (!selection.selectedText || selection.selectedText.trim().length === 0) {
    feedback(deps, "Nothing selected");
    return;
  }

  try {
    const vaultConfig = deps.getVaultConfig();
    const isTapTalkCapture = usesTapTalkCaptureDestination(vaultConfig);
    const filePath = await captureToVault(
      { text: selection.selectedText, source },
      { destinationDir: getCaptureDir(vaultConfig) }
    );
    feedback(deps, isTapTalkCapture ? "Captured" : "Captured to Obsidian", CAPTURE_FEEDBACK_MS);
    scheduleLinkFeedback(deps, filePath, vaultConfig);
    scheduleTagging(deps.getEditingConfig, filePath);
  } catch (error) {
    console.error("[taptalk:capture] failed:", deps.toErrorMessage(error));
    feedback(deps, "Capture failed");
  }
}

/** Run one capture, serialized against dictation so it never races the clipboard. */
export function runCapture(deps: CaptureDeps): void {
  console.log("[taptalk:capture] Fn+M fired");
  void deps.runSerialized(() => captureSelectionToVault(deps));
}
