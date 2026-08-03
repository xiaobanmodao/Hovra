import type { GestureSettings } from "./types";

export const DEFAULT_GESTURE_SETTINGS: Readonly<GestureSettings> = {
  pinchDistance: 0.055,
  dragHoldMs: 350,
  openPalmMinTipDistance: 0.18,
  cursorSmoothingFactor: 0.2,
  cameraStaleFrameMs: 500,
};

export const CURSOR_SMOOTHING_FACTOR = DEFAULT_GESTURE_SETTINGS.cursorSmoothingFactor;
export const CAMERA_STALE_FRAME_MS = DEFAULT_GESTURE_SETTINGS.cameraStaleFrameMs;
