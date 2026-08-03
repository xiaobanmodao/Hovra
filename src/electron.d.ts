export interface GestureDesktopApi {
  getPermissionStatus(): Promise<"granted" | "denied">;
  move(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  onSafetyPause(listener: () => void): () => void;
}

declare global {
  interface Window {
    gestureDesktop?: GestureDesktopApi;
  }
}
