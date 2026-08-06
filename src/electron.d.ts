export interface GestureDesktopApi {
  getPermissionStatus(): Promise<"granted" | "denied">;
  activate(): Promise<boolean>;
  move(
    x: number,
    y: number,
    state?: "tracking" | "left-pinching" | "right-pinching" | "double-pinching" | "dragging" | "scrolling"
      | "candidate-left" | "candidate-right" | "candidate-double" | "candidate-scroll"
      | "releasing-left" | "releasing-right" | "releasing-double" | "releasing-scroll",
    longPressProgress?: number,
  ): Promise<void>;
  drag(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  rightClick(): Promise<void>;
  doubleClick(): Promise<void>;
  scroll(deltaY: number): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  releaseAndPause(): Promise<void>;
  saveGestureTrace(json: string): Promise<"saved" | "cancelled">;
  openAccessibilitySettings(): Promise<void>;
  onSafetyPause(listener: () => void): () => void;
}

declare global {
  interface Window {
    gestureDesktop?: GestureDesktopApi;
  }
}
