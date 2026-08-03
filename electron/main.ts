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
let cursorOverlay: BrowserWindow | undefined;
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
      backgroundThrottling: false,
    },
  });

  mainWindow = createdWindow;
  activationFrame = undefined;
  createCursorOverlay();

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
    // Global gesture control intentionally remains active across app switches.
  });

  if (createdWindow.isFocused()) {
    isAppActive = true;
  }

  return createdWindow;
}

function createCursorOverlay(): BrowserWindow {
  const bounds = screen.getPrimaryDisplay().bounds;
  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "overlayPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  overlay.webContents.on("will-navigate", (event) => event.preventDefault());
  void overlay.loadURL(`data:text/html,${encodeURIComponent(`<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}.cursor{position:fixed;width:28px;height:28px;border:3px solid #7cf7ff;border-radius:50%;box-sizing:border-box;transform:translate(-50%,-50%);display:none;box-shadow:0 0 12px #00d9ff}.cursor.dragging{border-color:#ffcc66;box-shadow:0 0 12px #ff9900}</style><div id="cursor" class="cursor"></div><script>window.addEventListener('message',event=>{const state=event.data;if(!state||state.type!=='gesture-overlay')return;const cursor=document.getElementById('cursor');cursor.style.left=state.x+'px';cursor.style.top=state.y+'px';cursor.style.display=state.visible?'block':'none';cursor.className='cursor '+state.state})</script>`)} `);
  cursorOverlay = overlay;
  return overlay;
}

function setCursorOverlayState(
  x: number,
  y: number,
  state: "tracking" | "dragging",
): void {
  if (!cursorOverlay || cursorOverlay.isDestroyed() || !Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  cursorOverlay.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify({ type: "gesture-overlay", x, y, visible: true, state })}, "*")`,
  ).catch(() => undefined);
}

function hideCursorOverlay(): void {
  if (!cursorOverlay || cursorOverlay.isDestroyed()) {
    return;
  }
  cursorOverlay.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify({ type: "gesture-overlay", x: 0, y: 0, visible: false, state: "tracking" })}, "*")`,
  ).catch(() => undefined);
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

  const senderFrame = (event as { senderFrame?: unknown }).senderFrame;
  if (senderFrame === activationFrame) {
    return true;
  }

  if (typeof senderFrame !== "object" || senderFrame === null) {
    return false;
  }

  const frameToken = (senderFrame as { frameToken?: unknown }).frameToken;
  return (
    typeof frameToken === "string"
    && frameToken.length > 0
    && frameToken === activationFrame.frameToken
  );
}

void app.whenReady().then(() => {
  mouseController = createMouseController({
    permission: () =>
      process.platform === "darwin" &&
      systemPreferences.isTrustedAccessibilityClient(false),
    isActive: () => isAppActive,
    mouse: systemMouse,
    overlay: { show: setCursorOverlayState, hide: hideCursorOverlay },
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
