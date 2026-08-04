import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedControllerDependencies {
  isActive(): boolean;
  overlay?: {
    show(x: number, y: number, state: "tracking" | "dragging"): void;
    hide(): void;
    refresh?(): void;
  };
}

interface CapturedIpcSecurity {
  isTrustedEvent(event: unknown): boolean;
  canActivate(event: unknown): boolean;
  getPrimaryDisplayBounds(): { x: number; y: number; width: number; height: number };
}

const mainMocks = vi.hoisted(() => ({
  appHandlers: new Map<string, (...args: unknown[]) => void>(),
  screenHandlers: new Map<string, (...args: unknown[]) => void>(),
  controllerDependencies: undefined as CapturedControllerDependencies | undefined,
  ipcSecurity: undefined as CapturedIpcSecurity | undefined,
  ipcHandlers: new Map<string, (event: unknown) => Promise<unknown>>(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  isTrustedAccessibilityClient: vi.fn().mockReturnValue(true),
  mouse: {
    move: vi.fn().mockResolvedValue(undefined),
    drag: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  },
  windows: [] as Array<{
    options: Record<string, unknown>;
    windowHandlers: Map<string, () => void>;
    webContents: {
      mainFrame: { url: string; top?: unknown; frameToken?: string };
      on: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      executeJavaScript: ReturnType<typeof vi.fn>;
      debugger: {
        attach: ReturnType<typeof vi.fn>;
        isAttached: ReturnType<typeof vi.fn>;
        sendCommand: ReturnType<typeof vi.fn>;
      };
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
    loadFile: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    setIgnoreMouseEvents: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    showInactive: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("electron", () => {
  class BrowserWindow {
    static getAllWindows(): BrowserWindow[] {
      return [];
    }

    options: Record<string, unknown>;
    windowHandlers = new Map<string, () => void>();
    webContents = {
      mainFrame: { url: "http://localhost:5173/index.html" } as {
        url: string;
        top?: unknown;
        frameToken?: string;
      },
      on: vi.fn(),
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      debugger: {
        attach: vi.fn(),
        isAttached: vi.fn().mockReturnValue(false),
        sendCommand: vi.fn().mockResolvedValue(undefined),
      },
      setWindowOpenHandler: vi.fn(),
    };
    loadURL = vi.fn().mockResolvedValue(undefined);
    loadFile = vi.fn().mockResolvedValue(undefined);
    setIgnoreMouseEvents = vi.fn();
    destroy = vi.fn();
    setBounds = vi.fn();
    hide = vi.fn();
    showInactive = vi.fn();
    isDestroyed = vi.fn().mockReturnValue(false);
    isFocused = vi.fn().mockReturnValue(false);

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.webContents.mainFrame.top = this.webContents.mainFrame;
      mainMocks.windows.push(this);
    }

    on(event: string, listener: () => void): this {
      this.windowHandlers.set(event, listener);
      return this;
    }
  }

  return {
    app: {
      enableSandbox: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        mainMocks.appHandlers.set(event, listener);
      }),
      quit: vi.fn(),
    },
    BrowserWindow,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown) => Promise<unknown>) => {
        mainMocks.ipcHandlers.set(channel, handler);
      }),
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        bounds: { x: -1440, y: 0, width: 1440, height: 900 },
      })),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        mainMocks.screenHandlers.set(event, listener);
      }),
    },
    shell: { openExternal: mainMocks.openExternal },
    systemPreferences: {
      isTrustedAccessibilityClient: mainMocks.isTrustedAccessibilityClient,
    },
  };
});

vi.mock("./mouseController", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mouseController")>();

  return {
    ...actual,
    createMouseController: vi.fn((deps: Parameters<typeof actual.createMouseController>[0]) => {
      mainMocks.controllerDependencies = deps;
      const controller = actual.createMouseController(deps);
      return controller;
    }),
    registerMouseControllerIpc: vi.fn(
      (
        ipcMain: Parameters<typeof actual.registerMouseControllerIpc>[0],
        controller: Parameters<typeof actual.registerMouseControllerIpc>[1],
        security: CapturedIpcSecurity,
      ) => {
        mainMocks.ipcSecurity = security;
        actual.registerMouseControllerIpc(ipcMain, controller, security);
      },
    ),
  };
});

vi.mock("./systemMouseAdapter", () => ({ systemMouse: mainMocks.mouse }));

async function bootMain(devServerUrl: string | undefined) {
  vi.resetModules();
  Object.assign(globalThis, {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: devServerUrl,
    MAIN_WINDOW_VITE_NAME: "main_window",
  });
  await import("./main");
  await vi.waitFor(() => expect(mainMocks.windows.length).toBeGreaterThanOrEqual(1));
  return mainMocks.windows[0];
}

beforeEach(() => {
  mainMocks.appHandlers.clear();
  mainMocks.screenHandlers.clear();
  mainMocks.controllerDependencies = undefined;
  mainMocks.ipcSecurity = undefined;
  mainMocks.ipcHandlers.clear();
  mainMocks.windows.length = 0;
  vi.clearAllMocks();
});

describe("main BrowserWindow security", () => {
  it("uses sandboxed renderer flags and loads only the configured dev URL", async () => {
    const window = await bootMain("http://localhost:5173");

    expect(window.options).toMatchObject({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    expect(window.loadURL).toHaveBeenCalledWith("http://localhost:5173");
    expect(window.loadFile).not.toHaveBeenCalled();
  });

  it("creates a mouse-transparent, unfocusable cursor overlay", async () => {
    await bootMain("http://localhost:5173");

    expect(mainMocks.windows).toHaveLength(2);
    const overlay = mainMocks.windows[1];
    expect(overlay.options).toMatchObject({
      width: 40,
      height: 40,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    expect(overlay.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    const overlayDocument = decodeURIComponent(
      String(overlay.loadURL.mock.calls[0]?.[0] ?? ""),
    );
    expect(overlayDocument).toContain("cursor:none");
    expect(overlayDocument).toContain("background:transparent");
  });

  it("destroys the cursor overlay with the main renderer", async () => {
    const window = await bootMain("http://localhost:5173");
    const overlay = mainMocks.windows[1];
    const destroyed = window.webContents.on.mock.calls.find(
      ([event]) => event === "destroyed",
    )?.[1] as () => void;

    destroyed();

    expect(overlay.destroy).toHaveBeenCalledOnce();
  });

  it("centers the cursor overlay window on the system pointer", async () => {
    await bootMain("http://localhost:5173");
    const overlay = mainMocks.windows[1];

    mainMocks.controllerDependencies?.overlay?.show(600, 400, "tracking");

    expect(overlay.setBounds).toHaveBeenCalledWith({
      x: 580,
      y: 380,
      width: 40,
      height: 40,
    });
    expect(overlay.showInactive).toHaveBeenCalledOnce();
    expect(overlay.webContents.debugger.attach).toHaveBeenCalledOnce();
    expect(overlay.webContents.debugger.sendCommand).toHaveBeenCalledWith(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: 20, y: 20 },
    );
  });

  it("hides the cursor overlay without changing its last calibrated position", async () => {
    await bootMain("http://localhost:5173");
    const overlay = mainMocks.windows[1];

    mainMocks.controllerDependencies?.overlay?.hide();

    expect(overlay.hide).toHaveBeenCalledOnce();
    expect(overlay.setBounds).not.toHaveBeenCalled();
  });

  it("reapplies cursor:none after underlying system actions change the cursor", async () => {
    await bootMain("http://localhost:5173");
    const overlay = mainMocks.windows[1];
    mainMocks.controllerDependencies?.overlay?.show(600, 400, "tracking");
    overlay.webContents.debugger.attach.mockClear();
    overlay.webContents.debugger.isAttached.mockReturnValue(true);
    overlay.webContents.debugger.sendCommand.mockClear();

    mainMocks.controllerDependencies?.overlay?.refresh?.();

    expect(overlay.webContents.debugger.attach).not.toHaveBeenCalled();
    expect(overlay.webContents.debugger.sendCommand).toHaveBeenCalledWith(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: 20, y: 20 },
    );
  });

  it("loads only the packaged renderer file in production", async () => {
    const window = await bootMain(undefined);
    const expected = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../renderer/main_window/index.html",
    );

    expect(window.loadURL).not.toHaveBeenCalled();
    expect(window.loadFile).toHaveBeenCalledWith(expected);
  });

  it("denies new windows and prevents renderer-initiated navigation", async () => {
    const window = await bootMain("http://localhost:5173");

    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalledOnce();
    const openHandler = window.webContents.setWindowOpenHandler.mock.calls[0][0] as () => unknown;
    expect(openHandler()).toEqual({ action: "deny" });

    expect(window.webContents.on).toHaveBeenCalledWith(
      "will-navigate",
      expect.any(Function),
    );
    const navigate = window.webContents.on.mock.calls.find(
      ([event]) => event === "will-navigate",
    )?.[1] as ((event: { preventDefault(): void }) => void) | undefined;
    const preventDefault = vi.fn();
    navigate?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("releases and invalidates control on main-frame reload until fresh activation", async () => {
    const window = await bootMain("http://localhost:5173");
    window.windowHandlers.get("focus")?.();
    const departingFrame: { url: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
    };
    departingFrame.top = departingFrame;
    window.webContents.mainFrame = departingFrame;
    const domReady = window.webContents.on.mock.calls.find(
      ([event]) => event === "dom-ready",
    )?.[1] as () => void;
    domReady();
    const departingEvent = {
      sender: window.webContents,
      senderFrame: departingFrame,
    };
    await vi.waitFor(() => {
      expect(mainMocks.ipcSecurity?.canActivate(departingEvent)).toBe(true);
    });

    await mainMocks.ipcHandlers.get("gesture:activate")?.(departingEvent);
    await mainMocks.ipcHandlers.get("gesture:mouse-down")?.(departingEvent);
    expect(mainMocks.mouse.press).toHaveBeenCalledOnce();

    const didStartNavigation = window.webContents.on.mock.calls.find(
      ([event]) => event === "did-start-navigation",
    )?.[1] as (details: { isMainFrame: boolean }) => void;
    didStartNavigation({ isMainFrame: false });
    await Promise.resolve();
    expect(mainMocks.mouse.release).not.toHaveBeenCalled();
    expect(mainMocks.ipcSecurity?.canActivate(departingEvent)).toBe(true);

    didStartNavigation({ isMainFrame: true });
    expect(mainMocks.ipcSecurity?.canActivate(departingEvent)).toBe(false);
    await expect(
      mainMocks.ipcHandlers.get("gesture:activate")?.(departingEvent),
    ).resolves.toBe(false);
    await vi.waitFor(() => expect(mainMocks.mouse.release).toHaveBeenCalledOnce());

    await mainMocks.ipcHandlers.get("gesture:click")?.(departingEvent);
    expect(mainMocks.mouse.click).not.toHaveBeenCalled();
    expect(mainMocks.controllerDependencies?.isActive()).toBe(true);

    const replacementFrame: { url: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
    };
    replacementFrame.top = replacementFrame;
    window.webContents.mainFrame = replacementFrame;
    const replacementEvent = {
      sender: window.webContents,
      senderFrame: replacementFrame,
    };
    domReady();
    await vi.waitFor(() => {
      expect(mainMocks.ipcSecurity?.canActivate(replacementEvent)).toBe(true);
    });
    expect(mainMocks.ipcSecurity?.canActivate(departingEvent)).toBe(false);

    await mainMocks.ipcHandlers.get("gesture:click")?.(replacementEvent);
    expect(mainMocks.mouse.click).not.toHaveBeenCalled();
    await mainMocks.ipcHandlers.get("gesture:activate")?.(replacementEvent);
    await mainMocks.ipcHandlers.get("gesture:click")?.(replacementEvent);
    expect(mainMocks.mouse.click).toHaveBeenCalledOnce();
  });

  it.each(["render-process-gone", "destroyed"])(
    "releases a tracked press when webContents emits %s",
    async (lifecycleEvent) => {
      const window = await bootMain("http://localhost:5173");
      window.windowHandlers.get("focus")?.();
      const topFrame: { url: string; top?: unknown } = {
        url: "http://localhost:5173/index.html",
      };
      topFrame.top = topFrame;
      window.webContents.mainFrame = topFrame;
      const trustedEvent = { sender: window.webContents, senderFrame: topFrame };
      const domReady = window.webContents.on.mock.calls.find(
        ([event]) => event === "dom-ready",
      )?.[1] as () => void;
      domReady();
      await vi.waitFor(() => {
        expect(mainMocks.ipcSecurity?.canActivate(trustedEvent)).toBe(true);
      });
      await mainMocks.ipcHandlers.get("gesture:activate")?.(trustedEvent);
      await mainMocks.ipcHandlers.get("gesture:mouse-down")?.(trustedEvent);

      const listener = window.webContents.on.mock.calls.find(
        ([event]) => event === lifecycleEvent,
      )?.[1] as () => void;
      listener();

      await vi.waitFor(() => expect(mainMocks.mouse.release).toHaveBeenCalledOnce());
    },
  );
});

describe("main IPC trust boundary", () => {
  it("accepts activation from a distinct wrapper for the active renderer frame", async () => {
    const window = await bootMain("http://localhost:5173");
    window.windowHandlers.get("focus")?.();
    const activeFrame: { url: string; frameToken: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
      frameToken: "active-renderer-frame",
    };
    activeFrame.top = activeFrame;
    window.webContents.mainFrame = activeFrame;
    const senderFrame: { url: string; frameToken: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
      frameToken: "active-renderer-frame",
    };
    senderFrame.top = senderFrame;
    const event = { sender: window.webContents, senderFrame };
    const domReady = window.webContents.on.mock.calls.find(
      ([eventName]) => eventName === "dom-ready",
    )?.[1] as () => void;

    domReady();
    await vi.waitFor(() => {
      expect(mainMocks.ipcSecurity?.canActivate(event)).toBe(true);
    });
    await expect(mainMocks.ipcHandlers.get("gesture:activate")?.(event)).resolves.toBe(true);
  });

  it("accepts only the main window top frame at the configured origin", async () => {
    const window = await bootMain("http://localhost:5173");
    const topFrame: { url: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
    };
    topFrame.top = topFrame;

    expect(mainMocks.ipcSecurity?.isTrustedEvent({
      sender: window.webContents,
      senderFrame: topFrame,
    })).toBe(true);
    expect(mainMocks.ipcSecurity?.isTrustedEvent({
      sender: {},
      senderFrame: topFrame,
    })).toBe(false);
    expect(mainMocks.ipcSecurity?.isTrustedEvent({
      sender: window.webContents,
      senderFrame: { url: "https://evil.example", top: topFrame },
    })).toBe(false);
  });

  it("matches the exact packaged renderer file and supplies primary-display bounds", async () => {
    const window = await bootMain(undefined);
    const rendererFile = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../renderer/main_window/index.html",
    );
    const topFrame: { url: string; top?: unknown } = {
      url: pathToFileURL(rendererFile).href,
    };
    topFrame.top = topFrame;

    expect(mainMocks.ipcSecurity?.isTrustedEvent({
      sender: window.webContents,
      senderFrame: topFrame,
    })).toBe(true);
    expect(mainMocks.ipcSecurity?.isTrustedEvent({
      sender: window.webContents,
      senderFrame: { ...topFrame, url: pathToFileURL(`${rendererFile}.evil`).href },
    })).toBe(false);
    expect(mainMocks.ipcSecurity?.getPrimaryDisplayBounds()).toEqual({
      x: -1440,
      y: 0,
      width: 1440,
      height: 900,
    });
  });

  it("opens only the fixed macOS Accessibility pane for the trusted renderer", async () => {
    const window = await bootMain("http://localhost:5173");
    const topFrame: { url: string; top?: unknown } = {
      url: "http://localhost:5173/index.html",
    };
    topFrame.top = topFrame;
    const handler = mainMocks.ipcHandlers.get("gesture:open-accessibility-settings");

    await handler?.({ sender: {}, senderFrame: topFrame });
    expect(mainMocks.openExternal).not.toHaveBeenCalled();

    await handler?.({ sender: window.webContents, senderFrame: topFrame });
    expect(mainMocks.openExternal).toHaveBeenCalledOnce();
    expect(mainMocks.openExternal).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
  });
});

it("keeps mouse control inactive until BrowserWindow emits focus", async () => {
  const window = await bootMain("http://localhost:5173");

  expect(mainMocks.controllerDependencies?.isActive()).toBe(false);
  window.windowHandlers.get("focus")?.();
  expect(mainMocks.controllerDependencies?.isActive()).toBe(true);
});
