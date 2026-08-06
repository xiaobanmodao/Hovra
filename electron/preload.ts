import { contextBridge, ipcRenderer } from "electron";

const channels = {
  getPermissionStatus: "gesture:get-permission-status",
  activate: "gesture:activate",
  move: "gesture:move",
  drag: "gesture:drag",
  click: "gesture:click",
  rightClick: "gesture:right-click",
  doubleClick: "gesture:double-click",
  scroll: "gesture:scroll",
  mouseDown: "gesture:mouse-down",
  mouseUp: "gesture:mouse-up",
  releaseAndPause: "gesture:release-and-pause",
  openAccessibilitySettings: "gesture:open-accessibility-settings",
  safetyPause: "gesture:safety-pause",
  saveTrace: "gesture:save-trace",
} as const;

type PermissionStatus = "granted" | "denied";
type CursorOverlayState =
  | "tracking"
  | "left-pinching"
  | "right-pinching"
  | "double-pinching"
  | "dragging"
  | "scrolling"
  | "candidate-left"
  | "candidate-right"
  | "candidate-double"
  | "candidate-scroll"
  | "releasing-left"
  | "releasing-right"
  | "releasing-double"
  | "releasing-scroll";

const CURSOR_STATES = new Set<CursorOverlayState>([
  "tracking",
  "left-pinching",
  "right-pinching",
  "double-pinching",
  "dragging",
  "scrolling",
  "candidate-left",
  "candidate-right",
  "candidate-double",
  "candidate-scroll",
  "releasing-left",
  "releasing-right",
  "releasing-double",
  "releasing-scroll",
]);

const gestureDesktop = {
  getPermissionStatus: (): Promise<PermissionStatus> =>
    ipcRenderer.invoke(channels.getPermissionStatus),
  activate: (): Promise<boolean> => ipcRenderer.invoke(channels.activate),
  move: (
    x: number,
    y: number,
    state: CursorOverlayState = "tracking",
    longPressProgress = 0,
  ): Promise<void> => invokeNormalizedMovement(
    channels.move,
    x,
    y,
    state,
    longPressProgress,
  ),
  drag: (x: number, y: number): Promise<void> =>
    invokeNormalizedMovement(channels.drag, x, y),
  click: (): Promise<void> => ipcRenderer.invoke(channels.click),
  rightClick: (): Promise<void> => ipcRenderer.invoke(channels.rightClick),
  doubleClick: (): Promise<void> => ipcRenderer.invoke(channels.doubleClick),
  scroll: (deltaY: number): Promise<void> => {
    if (
      !Number.isFinite(deltaY)
      || !Number.isInteger(deltaY)
      || Math.abs(deltaY) > 12
    ) {
      return Promise.reject(new TypeError("Mouse scroll delta must be an integer from -12 to 12"));
    }
    return ipcRenderer.invoke(channels.scroll, { deltaY });
  },
  mouseDown: (): Promise<void> => ipcRenderer.invoke(channels.mouseDown),
  mouseUp: (): Promise<void> => ipcRenderer.invoke(channels.mouseUp),
  releaseAndPause: (): Promise<void> =>
    ipcRenderer.invoke(channels.releaseAndPause),
  saveGestureTrace: (json: string): Promise<"saved" | "cancelled"> => {
    if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > 2 * 1024 * 1024) {
      return Promise.reject(new TypeError("Gesture trace must not exceed 2 MiB"));
    }
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      return Promise.reject(new TypeError("Gesture trace must be valid JSON"));
    }
    if (
      typeof value !== "object"
      || value === null
      || !Number.isInteger((value as { version?: unknown }).version)
      || ((value as { version: number }).version < 1 || (value as { version: number }).version > 5)
      || !Array.isArray((value as { frames?: unknown }).frames)
    ) {
      return Promise.reject(new TypeError("Gesture trace must use version 1 to 5"));
    }
    return ipcRenderer.invoke(channels.saveTrace, json);
  },
  openAccessibilitySettings: (): Promise<void> =>
    ipcRenderer.invoke(channels.openAccessibilitySettings),
  onSafetyPause: (listener: () => void): (() => void) => {
    const wrappedListener = (): void => listener();
    ipcRenderer.on(channels.safetyPause, wrappedListener);

    return () => {
      ipcRenderer.removeListener(channels.safetyPause, wrappedListener);
    };
  },
};

function invokeNormalizedMovement(
  channel: typeof channels.move | typeof channels.drag,
  x: number,
  y: number,
  state?: CursorOverlayState,
  longPressProgress = 0,
): Promise<void> {
  if (
    !Number.isFinite(x)
    || x < 0
    || x > 1
    || !Number.isFinite(y)
    || y < 0
    || y > 1
  ) {
    return Promise.reject(
      new TypeError("Mouse movement requires normalized coordinates from 0 to 1"),
    );
  }

  if (channel === channels.move && (!state || !CURSOR_STATES.has(state))) {
    return Promise.reject(new TypeError("Mouse movement requires a valid cursor state"));
  }

  if (
    channel === channels.move
    && (!Number.isFinite(longPressProgress)
      || longPressProgress < 0
      || longPressProgress > 1)
  ) {
    return Promise.reject(
      new TypeError("Mouse movement requires long press progress from 0 to 1"),
    );
  }

  return ipcRenderer.invoke(
    channel,
    channel === channels.move ? { x, y, state, longPressProgress } : { x, y },
  );
}

contextBridge.exposeInMainWorld("gestureDesktop", gestureDesktop);
