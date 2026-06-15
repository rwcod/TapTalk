import path from "node:path";

function getElectronApp(): { isPackaged: boolean; getAppPath(): string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("electron").app as { isPackaged: boolean; getAppPath(): string };
  } catch {
    return null;
  }
}

export function isPackaged(): boolean {
  return getElectronApp()?.isPackaged ?? false;
}

export function getAppRoot(): string {
  const electronApp = getElectronApp();
  if (electronApp?.isPackaged) {
    return electronApp.getAppPath();
  }

  return path.resolve(__dirname, "..");
}

export function getUnpackedRoot(): string {
  if (isPackaged()) {
    return getAppRoot().replace("app.asar", "app.asar.unpacked");
  }

  return getAppRoot();
}
