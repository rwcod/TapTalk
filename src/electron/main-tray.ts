import { Menu, nativeImage } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { DictationStatusPayload } from "./ipc/contracts";

const APP_ICON_FILE = "icon.png";
const TRAY_ICON_SIZE = 16;
const TRAY_IDLE_ALPHA = 0.72;

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

function markTemplate(image: Electron.NativeImage): Electron.NativeImage {
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

export function loadTrayTemplateIcons(
  resolveAssetPath: (fileName: string) => string | null
): { idle: Electron.NativeImage | null; active: Electron.NativeImage | null } {
  const useRetina = process.platform === "darwin";
  const idleName = useRetina ? "tray-idleTemplate@2x.png" : "tray-idleTemplate.png";
  const activeName = useRetina ? "tray-activeTemplate@2x.png" : "tray-activeTemplate.png";

  return {
    idle: loadTemplateIcon(idleName, resolveAssetPath),
    active: loadTemplateIcon(activeName, resolveAssetPath)
  };
}

/** Bitmap fallback when tray PNG assets are missing (e.g. dev misconfiguration). */
function createEmergencyTrayIcon(isActive: boolean): Electron.NativeImage {
  const size = 18;
  const bitmap = Buffer.alloc(size * size * 4);
  const cx = 8.5;
  const cy = 8.5;
  const radius = 5.5;
  const peakAlpha = isActive ? 255 : Math.round(255 * TRAY_IDLE_ALPHA);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);
      const alpha =
        dist <= radius
          ? Math.round(peakAlpha * clamp01(1 - (dist - radius + 1)))
          : 0;
      bitmap[idx] = 0;
      bitmap[idx + 1] = 0;
      bitmap[idx + 2] = 0;
      bitmap[idx + 3] = alpha;
    }
  }

  return markTemplate(nativeImage.createFromBitmap(bitmap, { width: size, height: size }));
}

export function createTrayIdleIcon(
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage {
  const loaded = loadTrayTemplateIcons(resolveAssetPath).idle;
  return loaded ?? createEmergencyTrayIcon(false);
}

export function createTrayActiveIcon(
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage {
  const loaded = loadTrayTemplateIcons(resolveAssetPath).active;
  return loaded ?? createEmergencyTrayIcon(true);
}

export function loadAssetImage(
  fileName: string,
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage | null {
  const iconPath = resolveAssetPath(fileName);

  if (!iconPath) {
    return null;
  }

  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty() && existsSync(iconPath)) {
    image = nativeImage.createFromBuffer(readFileSync(iconPath));
  }

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

  return markTemplate(image);
}

export function createTrayIconFromAppIcon(
  image: Electron.NativeImage,
  alpha = 1
): Electron.NativeImage {
  const resized = image.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  return applyAlpha(resized, alpha);
}

export function loadAppIcon(
  resolveAssetPath: (fileName: string) => string | null
): Electron.NativeImage | null {
  return loadAssetImage(APP_ICON_FILE, resolveAssetPath);
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

  return createEmergencyTrayIcon(isActive);
}

interface BuildTrayMenuOptions {
  status: DictationStatusPayload;
  onPrimaryAction: () => void;
  onOpenTapTalk: () => void;
  onRevealVault: () => void;
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
      label: "Open TapTalk",
      click: () => {
        options.onOpenTapTalk();
      }
    },
    {
      label: "Reveal vault in Finder",
      click: () => {
        options.onRevealVault();
      }
    },
    {
      label: `Hotkey: ${options.status.hotkeyActive}`,
      enabled: false
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
