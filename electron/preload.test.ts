import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}));

import "./preload";

type ExposedApi = Record<string, unknown> & {
  getPermissionStatus(): Promise<"granted" | "denied">;
  move(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  onSafetyPause(listener: () => void): () => void;
};

function getExposedApi(): ExposedApi {
  expect(electronMocks.exposeInMainWorld).toHaveBeenCalledTimes(1);
  expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
    "gestureDesktop",
    expect.any(Object),
  );

  return electronMocks.exposeInMainWorld.mock.calls[0][1] as ExposedApi;
}

describe("gestureDesktop preload bridge", () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
    electronMocks.on.mockReset();
    electronMocks.removeListener.mockReset();
  });

  it("exposes only the six gesture desktop methods", () => {
    const api = getExposedApi();

    expect(Object.keys(api).sort()).toEqual([
      "click",
      "getPermissionStatus",
      "mouseDown",
      "mouseUp",
      "move",
      "onSafetyPause",
    ]);
    expect(api).not.toHaveProperty("ipcRenderer");
    expect(api).not.toHaveProperty("invoke");
    expect(api).not.toHaveProperty("send");
    expect(api).not.toHaveProperty("require");
    expect(api).not.toHaveProperty("process");
    expect(api).not.toHaveProperty("Buffer");
  });

  it("forwards actions through fixed internal IPC channels", async () => {
    electronMocks.invoke.mockResolvedValue(undefined);
    const api = getExposedApi();

    await api.getPermissionStatus();
    await api.move(120, -40);
    await api.click();
    await api.mouseDown();
    await api.mouseUp();

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["gesture:get-permission-status"],
      ["gesture:move", { x: 120, y: -40 }],
      ["gesture:click"],
      ["gesture:mouse-down"],
      ["gesture:mouse-up"],
    ]);
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
  ])("rejects non-finite move coordinates (%s, %s)", async (x, y) => {
    const api = getExposedApi();

    await expect(api.move(x, y)).rejects.toThrow("finite screen coordinates");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it("subscribes to safety pauses without exposing the event payload", () => {
    const api = getExposedApi();
    const listener = vi.fn();

    const unsubscribe = api.onSafetyPause(listener) as () => void;
    expect(electronMocks.on).toHaveBeenCalledWith(
      "gesture:safety-pause",
      expect.any(Function),
    );

    const wrappedListener = electronMocks.on.mock.calls[0][1] as () => void;
    wrappedListener();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      "gesture:safety-pause",
      wrappedListener,
    );
  });
});
