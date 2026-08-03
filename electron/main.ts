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
  type SystemMouseAdapter,
} from "./mouseController";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

app.enableSandbox();

interface NutJsModule {
  Button: { LEFT: unknown };
  Point: new (x: number, y: number) => unknown;
  mouse: {
    move(path: unknown): Promise<void>;
    click(button: unknown): Promise<void>;
    pressButton(button: unknown): Promise<void>;
    releaseButton(button: unknown): Promise<void>;
  };
  straightTo(point: unknown): unknown;
}

const nutJsPackageName = "@nut-tree/nut-js";
let nutJsPromise: Promise<NutJsModule> | undefined;

function loadNutJs(): Promise<NutJsModule> {
  nutJsPromise ??= import(
    /* @vite-ignore */ nutJsPackageName
  ) as Promise<NutJsModule>;
  return nutJsPromise;
}

const systemMouse: SystemMouseAdapter = {
  async move(x, y) {
    const { mouse, Point, straightTo } = await loadNutJs();
    await mouse.move(straightTo(new Point(x, y)));
  },
  async click() {
    const { Button, mouse } = await loadNutJs();
    await mouse.click(Button.LEFT);
  },
  async press() {
    const { Button, mouse } = await loadNutJs();
    await mouse.pressButton(Button.LEFT);
  },
  async release() {
    const { Button, mouse } = await loadNutJs();
    await mouse.releaseButton(Button.LEFT);
  },
};

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

  isAppActive = true;
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
