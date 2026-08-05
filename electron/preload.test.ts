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
  activate(): Promise<boolean>;
  move(x: number, y: number, state?: string): Promise<void>;
  drag(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  rightClick(): Promise<void>;
  doubleClick(): Promise<void>;
  scroll(deltaY: number): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  releaseAndPause(): Promise<void>;
  detectAppleHand(jpeg: Uint8Array, capturedAtMs: number): Promise<unknown>;
  saveGestureTrace(json: string): Promise<"saved" | "cancelled">;
  saveHandSample(json: string): Promise<"saved" | "cancelled">;
  openAccessibilitySettings(): Promise<void>;
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

  it("exposes only fixed gesture and Accessibility capabilities", () => {
    const api = getExposedApi();

    expect(Object.keys(api).sort()).toEqual([
      "activate",
      "click",
      "detectAppleHand",
      "doubleClick",
      "drag",
      "getPermissionStatus",
      "mouseDown",
      "mouseUp",
      "move",
      "onSafetyPause",
      "openAccessibilitySettings",
      "releaseAndPause",
      "rightClick",
      "saveGestureTrace",
      "saveHandSample",
      "scroll",
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
    await api.activate();
    await api.move(0.25, 0.75, "right-pinching");
    await api.move(0.25, 0.75, "candidate-left");
    await api.drag(0.75, 0.25);
    await api.click();
    await api.rightClick();
    await api.doubleClick();
    await api.scroll(-4);
    await api.mouseDown();
    await api.mouseUp();
    await api.releaseAndPause();
    await api.detectAppleHand(new Uint8Array([1, 2, 3]), 120);
    await api.saveGestureTrace(JSON.stringify({ version: 5, frames: [] }));
    await api.saveHandSample(JSON.stringify({ version: 1 }));
    await api.openAccessibilitySettings();

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["gesture:get-permission-status"],
      ["gesture:activate"],
      ["gesture:move", { x: 0.25, y: 0.75, state: "right-pinching" }],
      ["gesture:move", { x: 0.25, y: 0.75, state: "candidate-left" }],
      ["gesture:drag", { x: 0.75, y: 0.25 }],
      ["gesture:click"],
      ["gesture:right-click"],
      ["gesture:double-click"],
      ["gesture:scroll", { deltaY: -4 }],
      ["gesture:mouse-down"],
      ["gesture:mouse-up"],
      ["gesture:release-and-pause"],
      ["gesture:detect-apple-hand", { jpeg: new Uint8Array([1, 2, 3]), capturedAtMs: 120 }],
      ["gesture:save-trace", JSON.stringify({ version: 5, frames: [] })],
      ["gesture:save-hand-sample", JSON.stringify({ version: 1 })],
      ["gesture:open-accessibility-settings"],
    ]);
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
    [-0.01, 0],
    [0, 1.01],
  ])("rejects out-of-range normalized move coordinates (%s, %s)", async (x, y) => {
    const api = getExposedApi();

    await expect(api.move(x, y)).rejects.toThrow("normalized coordinates");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid normalized drag coordinates before IPC", async () => {
    const api = getExposedApi();

    await expect(api.drag(-0.01, 0.5)).rejects.toThrow("normalized coordinates");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects unknown visual states and invalid scroll deltas before IPC", async () => {
    const api = getExposedApi();

    await expect(api.move(0.5, 0.5, "unknown")).rejects.toThrow("cursor state");
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 13, -13]) {
      await expect(api.scroll(delta)).rejects.toThrow("scroll delta");
    }
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

  it("rejects invalid or oversized trace JSON before IPC", async () => {
    const api = getExposedApi();

    await expect(api.saveGestureTrace("not json")).rejects.toThrow("valid JSON");
    await expect(api.saveGestureTrace(" ".repeat(2 * 1024 * 1024 + 1))).rejects.toThrow("2 MiB");
    await expect(api.saveGestureTrace(JSON.stringify({ version: 6, frames: [] })))
      .rejects.toThrow("version 1 to 5");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid Apple Vision frames before IPC", async () => {
    const api = getExposedApi();

    await expect(api.detectAppleHand(new Uint8Array(), 0)).rejects.toThrow("JPEG");
    await expect(api.detectAppleHand(new Uint8Array(400 * 1024 + 1), 0))
      .rejects.toThrow("400 KiB");
    await expect(api.detectAppleHand(new Uint8Array([1]), Number.NaN))
      .rejects.toThrow("timestamp");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });
});
