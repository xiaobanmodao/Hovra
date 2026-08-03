import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  shell,
  systemPreferences,
  type WebFrameMain,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createMouseController,
  pauseForLifecycle,
  registerMouseControllerIpc,
  type MouseController,
} from "./mouseController";
import { systemMouse } from "./systemMouseAdapter";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

app.enableSandbox();

let isAppActive = false;
let mainWindow: BrowserWindow | undefined;
let activationFrame: WebFrameMain | undefined;
let mouseController: MouseController | undefined;
let quitCleanupStarted = false;
let quitCleanupComplete = false;

function createMainWindow(): BrowserWindow {
  let rendererGeneration = 0;
  const createdWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = createdWindow;
  activationFrame = undefined;

  createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  createdWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  createdWindow.webContents.on(
    "did-start-navigation",
    (details) => {
      if (details.isMainFrame) {
        rendererGeneration += 1;
        activationFrame = undefined;
        const generation = rendererGeneration;
        const frame = createdWindow.webContents.mainFrame;
        const release = releaseForRendererLifecycle("main-frame navigation");

        if (details.isSameDocument) {
          void release.then(() => {
            if (
              generation === rendererGeneration
              && mainWindow === createdWindow
              && !createdWindow.isDestroyed()
              && createdWindow.webContents.mainFrame === frame
            ) {
              activationFrame = frame;
            }
          });
        }
      }
    },
  );
  createdWindow.webContents.on("dom-ready", () => {
    const generation = rendererGeneration;
    const frame = createdWindow.webContents.mainFrame;
    activationFrame = undefined;
    void releaseForRendererLifecycle("renderer readiness").then(() => {
      if (
        generation === rendererGeneration
        && mainWindow === createdWindow
        && !createdWindow.isDestroyed()
        && createdWindow.webContents.mainFrame === frame
      ) {
        activationFrame = frame;
      }
    });
  });
  createdWindow.webContents.on("render-process-gone", () => {
    rendererGeneration += 1;
    activationFrame = undefined;
    void releaseForRendererLifecycle("renderer process exit");
  });
  createdWindow.webContents.on("destroyed", () => {
    rendererGeneration += 1;
    activationFrame = undefined;
    void releaseForRendererLifecycle("renderer destruction");
    if (mainWindow === createdWindow) {
      mainWindow = undefined;
      isAppActive = false;
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void createdWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void createdWindow.loadFile(getPackagedRendererPath());
  }

  createdWindow.on("focus", () => {
    isAppActive = true;
  });
  createdWindow.on("blur", () => {
    if (!mouseController) {
      isAppActive = false;
      return;
    }

    void pauseForLifecycle(mouseController, {
      deactivate: () => {
        isAppActive = false;
      },
      finally: () => {
        if (!createdWindow.isDestroyed()) {
          createdWindow.webContents.send("gesture:safety-pause");
        }
      },
    }).catch((error: unknown) => {
      console.error("Failed to release the mouse after window blur", error);
    });
  });

  if (createdWindow.isFocused()) {
    isAppActive = true;
  }

  return createdWindow;
}

function releaseForRendererLifecycle(reason: string): Promise<void> {
  if (!mouseController) {
    return Promise.resolve();
  }

  return mouseController.releaseAndPause().catch((error: unknown) => {
    console.error(`Failed to release the mouse after ${reason}`, error);
  });
}

function getPackagedRendererPath(): string {
  return path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
}

function isTrustedRendererEvent(event: unknown): boolean {
  if (typeof event !== "object" || event === null || !mainWindow) {
    return false;
  }

  const candidate = event as {
    sender?: unknown;
    senderFrame?: { url?: unknown; top?: unknown } | null;
  };
  const frame = candidate.senderFrame;
  if (
    candidate.sender !== mainWindow.webContents
    || !frame
    || frame.top !== frame
    || typeof frame.url !== "string"
  ) {
    return false;
  }

  try {
    const frameUrl = new URL(frame.url);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return frameUrl.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    }

    return frameUrl.href === pathToFileURL(getPackagedRendererPath()).href;
  } catch {
    return false;
  }
}

function canActivateRendererEvent(event: unknown): boolean {
  if (!activationFrame || typeof event !== "object" || event === null) {
    return false;
  }

  return (event as { senderFrame?: unknown }).senderFrame === activationFrame;
}

void app.whenReady().then(() => {
  mouseController = createMouseController({
    permission: () =>
      process.platform === "darwin" &&
      systemPreferences.isTrustedAccessibilityClient(false),
    isActive: () => isAppActive,
    mouse: systemMouse,
  });
  createMainWindow();
  registerMouseControllerIpc(ipcMain, mouseController, {
    isTrustedEvent: isTrustedRendererEvent,
    canActivate: canActivateRendererEvent,
    getPrimaryDisplayBounds: () => ({ ...screen.getPrimaryDisplay().bounds }),
  });
  ipcMain.handle("gesture:open-accessibility-settings", async (event) => {
    if (process.platform !== "darwin" || !isTrustedRendererEvent(event)) {
      return;
    }

    await shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (!mouseController || quitCleanupComplete) {
    return;
  }

  event.preventDefault();
  if (quitCleanupStarted) {
    return;
  }

  quitCleanupStarted = true;
  void pauseForLifecycle(mouseController, {
    deactivate: () => {
      isAppActive = false;
    },
    finally: () => {
      quitCleanupComplete = true;
      app.quit();
    },
  }).catch((error: unknown) => {
    console.error("Failed to release the mouse before quit", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
