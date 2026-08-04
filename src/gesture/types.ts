export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type GestureState =
  | "tracking"
  | "left-pinching"
  | "right-pinching"
  | "double-pinching"
  | "dragging"
  | "scrolling"
  | "paused"
  | "lost";

export type GestureOutput = {
  state: GestureState;
  cursor: Landmark | null;
  click: boolean;
  rightClick: boolean;
  doubleClick: boolean;
  scrollY: number;
  dragStart: boolean;
  dragEnd: boolean;
};

export type GestureSettings = {
  pinchDistance: number;
  dragHoldMs: number;
  openPalmMinTipDistance: number;
  cursorSmoothingFactor: number;
  cursorOffsetX: number;
  cursorOffsetY: number;
  cameraStaleFrameMs: number;
};

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_FINGER_TIP = 8;
export const INDEX_FINGER_PIP = 6;
export const MIDDLE_FINGER_TIP = 12;
export const MIDDLE_FINGER_PIP = 10;
export const RING_FINGER_TIP = 16;
export const RING_FINGER_PIP = 14;
export const PINKY_TIP = 20;
export const PINKY_PIP = 18;
