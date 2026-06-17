import { spawn } from "node:child_process";

interface RunCommandOptions {
  input?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

interface AutoPasteOptions {
  targetApp?: FrontmostApp;
  restoreFocus?: boolean;
  pasteHelperPath?: string | null;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function buildCommandEnv(customEnv: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const merged = {
    ...process.env,
    ...customEnv
  };

  if (process.platform !== "darwin") {
    return merged;
  }

  // Force UTF-8 locale so pbcopy/osascript don't misinterpret non-ASCII text.
  return {
    ...merged,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    LC_CTYPE: "UTF-8"
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatCommand(program: string, args: string[]): string {
  const serializedArgs = args.map((item) => JSON.stringify(item)).join(" ");
  return serializedArgs ? `${program} ${serializedArgs}` : program;
}

function runCommand(
  program: string,
  args: string[] = [],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const { input, timeoutMs = 6000, env } = options;
  const label = formatCommand(program, args);

  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildCommandEnv(env)
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (handler: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      handler();
    };

    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      const forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 300);
      forceKillTimer.unref();

      settle(() => {
        reject(new Error(`Command timed out: ${label}`));
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.once("error", (error) => {
      settle(() => {
        reject(new Error(`Command failed to start (${label}): ${error.message}`));
      });
    });

    child.once("exit", (code) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        settle(() => {
          resolve({ stdout, stderr });
        });
        return;
      }

      const stderrTrimmed = stderr.trim();
      settle(() => {
        reject(new Error(stderrTrimmed || `Command failed: ${label}`));
      });
    });
  });
}



async function activateAppOnMac(pid: number): Promise<void> {
  await runCommand(
    "osascript",
    ["-e", `tell application "System Events" to set frontmost of the first process whose unix id is ${pid} to true`],
    { timeoutMs: 2500 }
  );
}

export interface FrontmostApp {
  name: string;
  pid: number;
}

export async function getFrontmostApp(): Promise<FrontmostApp | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const script =
    'tell application "System Events"\\n' +
    'set frontApp to first application process whose frontmost is true\\n' +
    'return (name of frontApp & ":" & unix id of frontApp)\\n' +
    'end tell';

  try {
    const result = await runCommand("osascript", ["-e", script], { timeoutMs: 2500 });
    const output = result.stdout.trim();
    const lastColon = output.lastIndexOf(":");
    if (lastColon === -1) {
      return null;
    }
    const name = output.substring(0, lastColon);
    const pid = parseInt(output.substring(lastColon + 1), 10);
    if (!name || isNaN(pid)) {
      return null;
    }
    return { name, pid };
  } catch {
    return null;
  }
}

/**
 * Frontmost app name via `lsappinfo` — unlike the System Events script above it
 * needs no Automation permission, so it works for capture even when Automation
 * was never granted. Name only (no pid); use getFrontmostApp when you need pid.
 */
export async function getFrontmostAppName(): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const front = (await runCommand("lsappinfo", ["front"], { timeoutMs: 1500 })).stdout.trim();
    if (!front) {
      return null;
    }
    const info = await runCommand("lsappinfo", ["info", "-only", "name", front], { timeoutMs: 1500 });
    const match = info.stdout.trim().match(/=\s*"?([^"]+?)"?\s*$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function autoPasteText(text: string, options: AutoPasteOptions = {}): Promise<void> {
  const cleaned = text.trim();
  if (cleaned.length === 0) {
    return;
  }

  if (process.platform === "darwin") {
    await runCommand("pbcopy", [], { input: cleaned, timeoutMs: 2500 });

    if (options.restoreFocus !== false && options.targetApp?.pid) {
      try {
        await activateAppOnMac(options.targetApp.pid);
        await delay(120);
      } catch {
        // Best effort only. Paste attempt still follows.
      }
    }

    if (options.pasteHelperPath) {
      await runCommand(options.pasteHelperPath, [], { timeoutMs: 1500 });
      return;
    }

    await runCommand(
      "osascript",
      ["-e", 'tell application "System Events" to keystroke "v" using command down'],
      { timeoutMs: 3500 }
    );
    return;
  }

  if (process.platform === "linux") {
    await runCommand("xclip", ["-selection", "clipboard"], { input: cleaned });
    await runCommand("xdotool", ["key", "ctrl+v"]);
    return;
  }

  if (process.platform === "win32") {
    const escaped = cleaned.replaceAll("'", "''");
    await runCommand("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Value '${escaped}'`]);
    return;
  }

  throw new Error("Auto-paste nieobsługiwany na tym systemie.");
}

async function readClipboardTextMac(): Promise<string> {
  const result = await runCommand("pbpaste", [], { timeoutMs: 2000 });
  return result.stdout;
}

async function writeClipboardTextMac(text: string): Promise<void> {
  await runCommand("pbcopy", [], { input: text, timeoutMs: 2000 });
}

async function sendCopyKeystrokeMac(pasteHelperPath?: string | null): Promise<void> {
  // Prefer the native CGEvent helper (same as paste) because it only needs the
  // Accessibility permission. osascript "keystroke" goes through a separate
  // Automation/AppleEvents permission that is frequently NOT granted, in which
  // case the synthetic Cmd+C silently never fires.
  if (pasteHelperPath) {
    await runCommand(pasteHelperPath, ["c"], { timeoutMs: 1500 });
    return;
  }

  await runCommand(
    "osascript",
    ["-e", 'tell application "System Events" to keystroke "c" using command down'],
    { timeoutMs: 3000 }
  );
}

export interface SelectionCaptureResult {
  /** Selected text from the active app, or null when nothing is selected. */
  selectedText: string | null;
  /** Previous clipboard contents (best-effort) so the caller can restore them. */
  previousClipboard: string | null;
}

export interface SelectionCaptureOptions {
  /** Native CGEvent helper path used to send the Cmd+C keystroke reliably. */
  pasteHelperPath?: string | null;
}

/**
 * Detect the active app's current text selection without destroying the user's
 * clipboard. Approach (macOS): snapshot the clipboard, replace it with a unique
 * sentinel, send Cmd+C, read back. If the clipboard still holds the sentinel
 * (or is empty), nothing was selected. The previous clipboard is always
 * restored best-effort. Clipboard contents are never logged.
 *
 * Returns { selectedText: null } on non-macOS platforms so callers fall back to
 * normal dictation.
 */
export async function captureSelectedText(
  options: SelectionCaptureOptions = {}
): Promise<SelectionCaptureResult> {
  if (process.platform !== "darwin") {
    return { selectedText: null, previousClipboard: null };
  }

  let previousClipboard: string | null = null;
  try {
    previousClipboard = await readClipboardTextMac();
  } catch {
    previousClipboard = null;
  }

  const sentinel = `__taptalk_sel_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

  try {
    await writeClipboardTextMac(sentinel);
    await sendCopyKeystrokeMac(options.pasteHelperPath);

    // Poll the clipboard until it changes from the sentinel. Apps update the
    // pasteboard asynchronously after Cmd+C, so a single fixed wait is flaky.
    let current = sentinel;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(40);
      try {
        current = await readClipboardTextMac();
      } catch {
        current = "";
      }
      if (current !== sentinel) {
        break;
      }
    }

    const nothingCopied = current === sentinel || current.trim().length === 0;
    const selectedText = nothingCopied ? null : current;

    return { selectedText, previousClipboard };
  } finally {
    if (previousClipboard !== null) {
      // Best-effort restore so the user's clipboard survives the probe.
      await writeClipboardTextMac(previousClipboard).catch(() => undefined);
    }
  }
}

export interface ReplaceSelectionOptions {
  targetApp?: FrontmostApp;
  pasteHelperPath?: string | null;
  /** Clipboard contents to restore after the paste (best-effort). */
  previousClipboard?: string | null;
}

/**
 * Replace the active selection with `text` by placing it on the clipboard and
 * pasting (Cmd+V), then restoring the previous clipboard where possible. The
 * replacement text is never logged.
 */
export async function replaceSelectedText(
  text: string,
  options: ReplaceSelectionOptions = {}
): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Selected-text replacement is only supported on macOS.");
  }

  await writeClipboardTextMac(text);

  if (options.targetApp?.pid) {
    try {
      await activateAppOnMac(options.targetApp.pid);
      await delay(120);
    } catch {
      // Best effort only. Paste attempt still follows.
    }
  }

  if (options.pasteHelperPath) {
    await runCommand(options.pasteHelperPath, [], { timeoutMs: 1500 });
  } else {
    await runCommand(
      "osascript",
      ["-e", 'tell application "System Events" to keystroke "v" using command down'],
      { timeoutMs: 3500 }
    );
  }

  await delay(120);

  if (options.previousClipboard != null) {
    await writeClipboardTextMac(options.previousClipboard).catch(() => undefined);
  }
}

export function autoPasteRequirements(): string {
  if (process.platform === "darwin") {
    return "macOS: wymagane pbcopy + Accessibility permission dla Electron/Terminal.";
  }

  if (process.platform === "linux") {
    return "Linux: wymagane xclip i xdotool.";
  }

  if (process.platform === "win32") {
    return "Windows: clipboard działa, ale symulacja Ctrl+V nie jest zaimplementowana.";
  }

  return "Nieznana platforma - brak wsparcia auto-paste.";
}
