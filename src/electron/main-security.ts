import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { pathToFileURL } from "node:url";
import { resolveUiPath } from "./main-paths";

let trustedRendererUrls: Set<string> | null = null;
let trustedAppUrls: Set<string> | null = null;

function stripSearchAndHash(url: string): string {
  const searchIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  let end = url.length;

  if (searchIndex >= 0) {
    end = Math.min(end, searchIndex);
  }

  if (hashIndex >= 0) {
    end = Math.min(end, hashIndex);
  }

  return url.slice(0, end);
}

function ensureTrustedUrlsInitialized(): void {
  if (trustedAppUrls && trustedRendererUrls) {
    return;
  }

  const mainUrl = pathToFileURL(resolveUiPath("index.html")).toString();
  const indicatorUrl = pathToFileURL(resolveUiPath("indicator.html")).toString();
  trustedRendererUrls = new Set([mainUrl]);
  trustedAppUrls = new Set([mainUrl, indicatorUrl]);
}

function isTrustedAppUrl(url: string): boolean {
  ensureTrustedUrlsInitialized();
  const normalized = stripSearchAndHash(url);
  return trustedAppUrls?.has(normalized) ?? false;
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  ensureTrustedUrlsInitialized();
  const senderUrl = stripSearchAndHash(event.senderFrame?.url ?? event.sender.getURL());
  if (!trustedRendererUrls?.has(senderUrl)) {
    throw new Error("Unauthorized IPC sender.");
  }
}

export function hardenWindowNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
    }
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
    }
  });
}
