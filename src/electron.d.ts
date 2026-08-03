export interface GestureDesktopApi {
  getPermissionStatus(): Promise<"granted" | "denied">;
  activate(): Promise<boolean>;
  move(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  releaseAndPause(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  onSafetyPause(listener: () => void): () => void;
}

declare global {
  interface Window {
    gestureDesktop?: GestureDesktopApi;
  }
}
