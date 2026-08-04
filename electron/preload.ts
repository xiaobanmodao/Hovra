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
} as const;

type PermissionStatus = "granted" | "denied";
type CursorOverlayState =
  | "tracking"
  | "left-pinching"
  | "right-pinching"
  | "double-pinching"
  | "dragging"
  | "scrolling";

const CURSOR_STATES = new Set<CursorOverlayState>([
  "tracking",
  "left-pinching",
  "right-pinching",
  "double-pinching",
  "dragging",
  "scrolling",
]);

const gestureDesktop = {
  getPermissionStatus: (): Promise<PermissionStatus> =>
    ipcRenderer.invoke(channels.getPermissionStatus),
  activate: (): Promise<boolean> => ipcRenderer.invoke(channels.activate),
  move: (x: number, y: number, state: CursorOverlayState = "tracking"): Promise<void> =>
    invokeNormalizedMovement(channels.move, x, y, state),
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

  return ipcRenderer.invoke(channel, channel === channels.move ? { x, y, state } : { x, y });
}

contextBridge.exposeInMainWorld("gestureDesktop", gestureDesktop);
