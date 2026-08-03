import type { GestureSettings } from "./types";

export type CalibrationSettingKey = "pinchDistance" | "cursorSmoothingFactor" | "cursorOffsetX" | "cursorOffsetY" | "dragHoldMs";

export type CalibrationControlMetadata = {
  key: CalibrationSettingKey;
  label: string;
  accessibleLabel: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
};

export const DEFAULT_GESTURE_SETTINGS: Readonly<GestureSettings> = {
  pinchDistance: 0.055,
  dragHoldMs: 350,
  openPalmMinTipDistance: 0.18,
  cursorSmoothingFactor: 0.2,
  cursorOffsetX: 0,
  cursorOffsetY: 0,
  cameraStaleFrameMs: 500,
};

export const CALIBRATION_CONTROL_METADATA: readonly CalibrationControlMetadata[] = [
  {
    key: "pinchDistance",
    label: "Pinch threshold",
    accessibleLabel: "pinch threshold",
    min: 0.025,
    max: 0.1,
    step: 0.005,
    precision: 3,
  },
  {
    key: "cursorSmoothingFactor",
    label: "Cursor smoothing",
    accessibleLabel: "cursor smoothing",
    min: 0.05,
    max: 1,
    step: 0.05,
    precision: 2,
  },
  {
    key: "cursorOffsetX",
    label: "Horizontal cursor offset",
    accessibleLabel: "horizontal cursor offset",
    min: -0.15,
    max: 0.15,
    step: 0.01,
    precision: 2,
  },
  {
    key: "cursorOffsetY",
    label: "Vertical cursor offset",
    accessibleLabel: "vertical cursor offset",
    min: -0.15,
    max: 0.15,
    step: 0.01,
    precision: 2,
  },
  {
    key: "dragHoldMs",
    label: "Drag hold",
    accessibleLabel: "drag hold",
    min: 150,
    max: 1000,
    step: 50,
    precision: 0,
    unit: "ms",
  },
];

export const CURSOR_SMOOTHING_FACTOR = DEFAULT_GESTURE_SETTINGS.cursorSmoothingFactor;
export const CAMERA_STALE_FRAME_MS = DEFAULT_GESTURE_SETTINGS.cameraStaleFrameMs;
