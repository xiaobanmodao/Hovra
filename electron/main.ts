import {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
} from "electron";
import path from "node:path";

import {
  createMouseController,
  pauseForLifecycle,
  registerMouseControllerIpc,
  type MouseController,
} from "./mouseController";
import { systemMouse } from "./systemMouseAdapter";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

app.enableSandbox();

let isAppActive = false;
let mouseController: MouseController | undefined;
let quitCleanupStarted = false;
let quitCleanupComplete = false;

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  mainWindow.on("focus", () => {
    isAppActive = true;
  });
  mainWindow.on("blur", () => {
    if (!mouseController) {
      isAppActive = false;
      return;
    }

    void pauseForLifecycle(mouseController, {
      deactivate: () => {
        isAppActive = false;
      },
      finally: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("gesture:safety-pause");
        }
      },
    }).catch((error: unknown) => {
      console.error("Failed to release the mouse after window blur", error);
    });
  });

  if (mainWindow.isFocused()) {
    isAppActive = true;
  }

  return mainWindow;
}

void app.whenReady().then(() => {
  mouseController = createMouseController({
    permission: () =>
      process.platform === "darwin" &&
      systemPreferences.isTrustedAccessibilityClient(false),
    isActive: () => isAppActive,
    mouse: systemMouse,
  });
  registerMouseControllerIpc(ipcMain, mouseController);

  createMainWindow();

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
