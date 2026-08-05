import { describe, expect, it } from "vitest";

import { DEFAULT_GESTURE_SETTINGS, gestureThresholdsForSensitivity } from "./config";

describe("gestureThresholdsForSensitivity", () => {
  it("maps sensitivity to bounded normalized pinch thresholds", () => {
    expect(gestureThresholdsForSensitivity(-1).pinchEnterRatio).toBe(0.24);
    expect(gestureThresholdsForSensitivity(0.5).pinchEnterRatio).toBeCloseTo(0.29, 8);
    expect(gestureThresholdsForSensitivity(2).pinchEnterRatio).toBeCloseTo(0.34, 8);
  });

  it("always gives confirmed gestures a wider exit threshold", () => {
    for (const sensitivity of [0, 0.25, 0.5, 0.75, 1]) {
      const thresholds = gestureThresholdsForSensitivity(sensitivity);
      expect(thresholds.pinchExitRatio).toBeCloseTo(thresholds.pinchEnterRatio + 0.12, 8);
      expect(thresholds.pinchExitRatio).toBeGreaterThan(thresholds.pinchEnterRatio);
    }
  });

  it("uses the responsive preset by default", () => {
    expect(DEFAULT_GESTURE_SETTINGS.gestureSensitivity).toBe(0.5);
    expect(DEFAULT_GESTURE_SETTINGS.cursorSmoothingFactor).toBe(0.4);
  });
});
