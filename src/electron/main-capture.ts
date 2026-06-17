import { captureSelectedText, getFrontmostAppName } from "../runtime/autopaste";
import { captureToVault } from "../runtime/vault";
import { organizeInbox, tagInbox } from "../runtime/vault-tag";
import type { EditingConfig } from "../core/types";

// The pill indicator (same one the other actions use) is the signal the user
// actually sees — the tray status message alone is invisible in normal use.
function feedback(deps: CaptureDeps, message: string): void {
  deps.flashPill(message);
}

// Tag in the background a few seconds after the last capture, so a burst of
// clips triggers a single pass. Failures are retried on the next pass.
const TAGGING_DEBOUNCE_MS = 4000;
let taggingTimer: NodeJS.Timeout | null = null;

function scheduleTagging(getEditingConfig: () => EditingConfig): void {
  if (taggingTimer) {
    clearTimeout(taggingTimer);
  }
  taggingTimer = setTimeout(() => {
    taggingTimer = null;
    void tagInbox(getEditingConfig())
      .catch(() => undefined)
      .finally(() => void organizeInbox().catch(() => undefined));
  }, TAGGING_DEBOUNCE_MS);
}

export interface CaptureDeps {
  isIdle: () => boolean;
  getPasteHelperPath: () => string | null;
  getEditingConfig: () => EditingConfig;
  flashPill: (label: string) => void;
  toErrorMessage: (error: unknown) => string;
  runSerialized: <T>(action: () => Promise<T>) => Promise<T>;
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
    await captureToVault({ text: selection.selectedText, source });
    feedback(deps, "Saved to vault");
    scheduleTagging(deps.getEditingConfig);
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
