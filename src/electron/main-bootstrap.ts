import { app } from "electron";

interface MainBootstrapOptions {
  isQuitting: () => boolean;
  setIsQuitting: (next: boolean) => void;
  requestQuit: () => Promise<void>;
  showWindow: () => void;
  onReady: () => Promise<void>;
  onWillQuit: () => void;
}

export function bootstrapMainProcess(options: MainBootstrapOptions): void {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();

  if (!hasSingleInstanceLock) {
    app.exit(0);
    return;
  }

  app.on("second-instance", () => {
    options.showWindow();
  });

  app.on("before-quit", (event) => {
    if (!options.isQuitting()) {
      event.preventDefault();
      void options.requestQuit();
      return;
    }

    options.setIsQuitting(true);
  });

  app.whenReady().then(async () => {
    await options.onReady();

    app.on("activate", () => {
      options.showWindow();
    });
  });

  app.on("will-quit", () => {
    options.onWillQuit();
  });
}
