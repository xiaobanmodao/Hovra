import { expect, it, vi } from "vitest";

interface CapturedControllerDependencies {
  isActive(): boolean;
}

const mainMocks = vi.hoisted(() => {
  Object.assign(globalThis, {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: "http://localhost:5173",
    MAIN_WINDOW_VITE_NAME: "main_window",
  });

  return {
    controllerDependencies: undefined as
      | CapturedControllerDependencies
      | undefined,
    windowHandlers: new Map<string, () => void>(),
  };
});

vi.mock("electron", () => {
  class BrowserWindow {
    static getAllWindows(): BrowserWindow[] {
      return [];
    }

    webContents = { send: vi.fn() };

    loadURL = vi.fn().mockResolvedValue(undefined);

    loadFile = vi.fn().mockResolvedValue(undefined);

    isDestroyed = vi.fn().mockReturnValue(false);

    isFocused = vi.fn().mockReturnValue(false);

    on(event: string, listener: () => void): this {
      mainMocks.windowHandlers.set(event, listener);
      return this;
    }
  }

  return {
    app: {
      enableSandbox: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow,
    ipcMain: { handle: vi.fn() },
    systemPreferences: { isTrustedAccessibilityClient: vi.fn() },
  };
});

vi.mock("./mouseController", () => ({
  createMouseController: vi.fn((deps: CapturedControllerDependencies) => {
    mainMocks.controllerDependencies = deps;
    return {};
  }),
  pauseForLifecycle: vi.fn(),
  registerMouseControllerIpc: vi.fn(),
}));

vi.mock("./systemMouseAdapter", () => ({
  systemMouse: {},
}));

import "./main";

it("keeps mouse control inactive until BrowserWindow emits focus", async () => {
  await vi.waitFor(() =>
    expect(mainMocks.controllerDependencies).toBeDefined(),
  );

  expect(mainMocks.controllerDependencies?.isActive()).toBe(false);

  mainMocks.windowHandlers.get("focus")?.();

  expect(mainMocks.controllerDependencies?.isActive()).toBe(true);
});
