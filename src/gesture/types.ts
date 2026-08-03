export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type GestureState = "tracking" | "paused" | "lost" | "pinching" | "dragging";

export type GestureOutput = {
  state: GestureState;
  cursor: Landmark | null;
  click: boolean;
  dragStart: boolean;
  dragEnd: boolean;
};

export type GestureSettings = {
  pinchDistance: number;
  dragHoldMs: number;
  openPalmMinTipDistance: number;
  cursorSmoothingFactor: number;
  cameraStaleFrameMs: number;
};

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_FINGER_TIP = 8;
export const MIDDLE_FINGER_TIP = 12;
export const RING_FINGER_TIP = 16;
export const PINKY_TIP = 20;
