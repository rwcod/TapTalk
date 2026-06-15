import { Menu, nativeImage } from "electron";
import { DictationStatusPayload } from "./ipc/contracts";

const APP_ICON_FILE = "icon.png";
const TRAY_ICON_SIZE = 16;

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function applyAlpha(image: Electron.NativeImage, alpha: number): Electron.NativeImage {
  const factor = clamp01(alpha);
  if (factor >= 0.999) {
    return image;
  }

  const size = image.getSize();
  if (size.width <= 0 || size.height <= 0) {
    return image;
  }

  const bitmap = image.toBitmap();
  if (bitmap.length === 0) {
    return image;
  }

  const adjusted = Buffer.from(bitmap);
  for (let idx = 3; idx < adjusted.length; idx += 4) {
    adjusted[idx] = Math.round(adjusted[idx] * factor);
  }

  const next = nativeImage.createFromBitmap(adjusted, size);
  if (next.isEmpty()) {
    return image;
  }

  return next;
}

export function loadAssetImage(
  fileName: string,
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage | null {
  const iconPath = resolveAssetPath(fileName);

  if (!iconPath) {
    return null;
  }

  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return null;
  }

  return image;
}

export function loadTemplateIcon(
  fileName: string,
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage | null {
  const image = loadAssetImage(fileName, resolveAssetPath);
  if (!image) {
    return null;
  }

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

export function createTrayIconFromAppIcon(
  image: Electron.NativeImage,
  alpha = 1
): Electron.NativeImage {
  const resized = image.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  const normalized = applyAlpha(resized, alpha);

  if (process.platform === "darwin") {
    normalized.setTemplateImage(true);
  }

  return normalized;
}

export function loadAppIcon(
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage | null {
  return loadAssetImage(APP_ICON_FILE, resolveAssetPath);
}

function createFallbackTrayIcon(isActive: boolean): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="5.7" fill="black" fill-opacity="0.95"/>
      ${
        isActive
          ? '<circle cx="9" cy="9" r="2.6" fill="black" fill-opacity="0.75"/>'
          : ""
      }
    </svg>`;

  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

interface TrayImageOptions {
  statusPhase: DictationStatusPayload["phase"];
  trayIdleIcon: Electron.NativeImage | null;
  trayActiveIcon: Electron.NativeImage | null;
}

export function trayImageForCurrentState(options: TrayImageOptions): Electron.NativeImage {
  const isActive =
    options.statusPhase === "recording" ||
    options.statusPhase === "transcribing" ||
    options.statusPhase === "editing";

  if (isActive && options.trayActiveIcon) {
    return options.trayActiveIcon;
  }

  if (!isActive && options.trayIdleIcon) {
    return options.trayIdleIcon;
  }

  return createFallbackTrayIcon(isActive);
}

interface BuildTrayMenuOptions {
  status: DictationStatusPayload;
  onPrimaryAction: () => void;
  onOpenTapTalk: () => void;
  onQuit: () => void;
}

export function buildTrayMenu(options: BuildTrayMenuOptions): Menu {
  const canStart = options.status.phase === "idle";
  const canStop = options.status.phase === "recording";
  const actionLabel = canStart
    ? "Start Dictation"
    : canStop
      ? options.status.dictationMode === "edit"
        ? "Stop Editing"
        : "Stop Dictation"
      : options.status.phase === "editing"
        ? "Editing selected text"
        : "Dictation busy";

  return Menu.buildFromTemplate([
    {
      label: actionLabel,
      enabled: canStart || canStop,
      click: () => {
        options.onPrimaryAction();
      }
    },
    {
      label: `Hotkey: ${options.status.hotkeyActive}`,
      enabled: false
    },
    {
      label: "Open TapTalk",
      click: () => {
        options.onOpenTapTalk();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        options.onQuit();
      }
    }
  ]);
}
