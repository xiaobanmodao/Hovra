import { contextBridge, ipcRenderer } from "electron";

const channels = {
  getPermissionStatus: "gesture:get-permission-status",
  activate: "gesture:activate",
  move: "gesture:move",
  drag: "gesture:drag",
  click: "gesture:click",
  mouseDown: "gesture:mouse-down",
  mouseUp: "gesture:mouse-up",
  releaseAndPause: "gesture:release-and-pause",
  openAccessibilitySettings: "gesture:open-accessibility-settings",
  safetyPause: "gesture:safety-pause",
} as const;

type PermissionStatus = "granted" | "denied";

const gestureDesktop = {
  getPermissionStatus: (): Promise<PermissionStatus> =>
    ipcRenderer.invoke(channels.getPermissionStatus),
  activate: (): Promise<boolean> => ipcRenderer.invoke(channels.activate),
  move: (x: number, y: number): Promise<void> =>
    invokeNormalizedMovement(channels.move, x, y),
  drag: (x: number, y: number): Promise<void> =>
    invokeNormalizedMovement(channels.drag, x, y),
  click: (): Promise<void> => ipcRenderer.invoke(channels.click),
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

  return ipcRenderer.invoke(channel, { x, y });
}

contextBridge.exposeInMainWorld("gestureDesktop", gestureDesktop);
