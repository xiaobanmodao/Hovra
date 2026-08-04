import type { GestureSettings } from "./types";

export type CalibrationSettingKey = "gestureSensitivity" | "cursorSmoothingFactor" | "cursorOffsetX" | "cursorOffsetY";

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
  gestureSensitivity: 0.5,
  openPalmMinTipDistance: 0.18,
  cursorSmoothingFactor: 0.2,
  cursorOffsetX: 0,
  cursorOffsetY: 0,
  cameraStaleFrameMs: 500,
};

export const CALIBRATION_CONTROL_METADATA: readonly CalibrationControlMetadata[] = [
  {
    key: "gestureSensitivity",
    label: "手势灵敏度",
    accessibleLabel: "手势灵敏度",
    min: 0,
    max: 1,
    step: 0.05,
    precision: 2,
  },
  {
    key: "cursorSmoothingFactor",
    label: "光标平滑",
    accessibleLabel: "光标平滑",
    min: 0.05,
    max: 1,
    step: 0.05,
    precision: 2,
  },
  {
    key: "cursorOffsetX",
    label: "水平光标偏移",
    accessibleLabel: "水平光标偏移",
    min: -0.15,
    max: 0.15,
    step: 0.01,
    precision: 2,
  },
  {
    key: "cursorOffsetY",
    label: "垂直光标偏移",
    accessibleLabel: "垂直光标偏移",
    min: -0.15,
    max: 0.15,
    step: 0.01,
    precision: 2,
  },
];

export const CURSOR_SMOOTHING_FACTOR = DEFAULT_GESTURE_SETTINGS.cursorSmoothingFactor;
export const CAMERA_STALE_FRAME_MS = DEFAULT_GESTURE_SETTINGS.cameraStaleFrameMs;

export type GestureThresholds = {
  pinchEnterRatio: number;
  pinchExitRatio: number;
  scrollEnterScore: number;
  scrollExitScore: number;
  openPalmEnterScore: number;
  openPalmExitScore: number;
};

export function gestureThresholdsForSensitivity(sensitivity: number): GestureThresholds {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(sensitivity) ? sensitivity : 0.5));
  const pinchEnterRatio = 0.24 + normalized * 0.1;
  return {
    pinchEnterRatio,
    pinchExitRatio: pinchEnterRatio + 0.12,
    scrollEnterScore: 0.75,
    scrollExitScore: 0.6,
    openPalmEnterScore: 0.82,
    openPalmExitScore: 0.7,
  };
}
