import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedControllerDependencies {
  isActive(): boolean;
}

interface CapturedIpcSecurity {
  isTrustedEvent(event: unknown): boolean;
  getPrimaryDisplayBounds(): { x: number; y: number; width: number; height: number };
}

const mainMocks = vi.hoisted(() => ({
  appHandlers: new Map<string, (...args: unknown[]) => void>(),
  controllerDependencies: undefined as CapturedControllerDependencies | undefined,
  ipcSecurity: undefined as CapturedIpcSecurity | undefined,
  ipcHandlers: new Map<string, (event: unknown) => Promise<unknown>>(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  windows: [] as Array<{
    options: Record<string, unknown>;
    windowHandlers: Map<string, () => void>;
    webContents: {
      on: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
    loadFile: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
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
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    loadURL = vi.fn().mockResolvedValue(undefined);
    loadFile = vi.fn().mockResolvedValue(undefined);
    isDestroyed = vi.fn().mockReturnValue(false);
    isFocused = vi.fn().mockReturnValue(false);

    constructor(options: Record<string, unknown>) {
      this.options = options;
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
    },
    shell: { openExternal: mainMocks.openExternal },
    systemPreferences: { isTrustedAccessibilityClient: vi.fn() },
  };
});

vi.mock("./mouseController", () => ({
  createMouseController: vi.fn((deps: CapturedControllerDependencies) => {
    mainMocks.controllerDependencies = deps;
    return {};
  }),
  pauseForLifecycle: vi.fn().mockResolvedValue(undefined),
  registerMouseControllerIpc: vi.fn(
    (_ipcMain: unknown, _controller: unknown, security: CapturedIpcSecurity) => {
      mainMocks.ipcSecurity = security;
    },
  ),
}));

vi.mock("./systemMouseAdapter", () => ({ systemMouse: {} }));

async function bootMain(devServerUrl: string | undefined) {
  vi.resetModules();
  Object.assign(globalThis, {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: devServerUrl,
    MAIN_WINDOW_VITE_NAME: "main_window",
  });
  await import("./main");
  await vi.waitFor(() => expect(mainMocks.windows).toHaveLength(1));
  return mainMocks.windows[0];
}

beforeEach(() => {
  mainMocks.appHandlers.clear();
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
      },
    });
    expect(window.loadURL).toHaveBeenCalledWith("http://localhost:5173");
    expect(window.loadFile).not.toHaveBeenCalled();
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
});

describe("main IPC trust boundary", () => {
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
