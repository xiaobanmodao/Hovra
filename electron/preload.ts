import { contextBridge, ipcRenderer } from "electron";

const channels = {
  getPermissionStatus: "gesture:get-permission-status",
  move: "gesture:move",
  click: "gesture:click",
  mouseDown: "gesture:mouse-down",
  mouseUp: "gesture:mouse-up",
  safetyPause: "gesture:safety-pause",
} as const;

type PermissionStatus = "granted" | "denied";

const gestureDesktop = {
  getPermissionStatus: (): Promise<PermissionStatus> =>
    ipcRenderer.invoke(channels.getPermissionStatus),
  move: (x: number, y: number): Promise<void> => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return Promise.reject(
        new TypeError("Mouse movement requires finite screen coordinates"),
      );
    }

    return ipcRenderer.invoke(channels.move, { x, y });
  },
  click: (): Promise<void> => ipcRenderer.invoke(channels.click),
  mouseDown: (): Promise<void> => ipcRenderer.invoke(channels.mouseDown),
  mouseUp: (): Promise<void> => ipcRenderer.invoke(channels.mouseUp),
  onSafetyPause: (listener: () => void): (() => void) => {
    const wrappedListener = (): void => listener();
    ipcRenderer.on(channels.safetyPause, wrappedListener);

    return () => {
      ipcRenderer.removeListener(channels.safetyPause, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("gestureDesktop", gestureDesktop);
