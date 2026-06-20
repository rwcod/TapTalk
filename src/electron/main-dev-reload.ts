import { BrowserWindow } from "electron";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

interface DevRendererReloadOptions {
  enabled: boolean;
  resolveUiPath: (fileName: string) => string;
}

export function enableDevRendererReload(options: DevRendererReloadOptions): (() => void) | null {
  if (!options.enabled) {
    return null;
  }

  const uiRoot = path.dirname(options.resolveUiPath("index.html"));
  const reloadableFiles = new Set(["index.html", "indicator.html", "indicator.js"]);
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher;

  try {
    watcher = watch(uiRoot, { recursive: true }, (_event, fileName) => {
      const changed = String(fileName ?? "").replace(/\\/g, "/");
      if (!changed.startsWith("renderer/") && !reloadableFiles.has(changed)) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        console.log(`[dev-reload] ${changed}`);
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.reloadIgnoringCache();
        }
      }, 80);
    });
  } catch (error) {
    console.warn("Dev renderer reload disabled:", error instanceof Error ? error.message : String(error));
    return null;
  }

  watcher.on("error", (error) => {
    console.warn("Dev renderer reload disabled:", error instanceof Error ? error.message : String(error));
  });

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
