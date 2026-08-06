import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import {
  measureStableHand,
  resolveStablePinchThresholds,
  stablePinchThresholds,
} from "./stableHandMetrics";
import { DEFAULT_GESTURE_SETTINGS } from "./config";

describe("stable hand metrics", () => {
  it("keeps the original index-tip cursor coordinates", () => {
    const hand = makeGestureHand("tracking", { cursor: { x: 0.72, y: 0.24 } });

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics?.cursor).toMatchObject({ x: 0.72, y: 0.24 });
  });

  it.each([0.18, 0.3, 0.48])(
    "recognizes genuine contact at hand scale %s",
    (scale) => {
      const metrics = measureStableHand(makeGestureHand("left", { scale }), 16 / 9, 0.5);

      expect(metrics).toMatchObject({
        depthReliable: true,
        pinchContact: true,
        pinchBlockingReason: "none",
      });
      expect(metrics!.spatialPinchRatio).toBeLessThan(metrics!.pinchEnterRatio);
    },
  );

  it("blocks projected overlap when the normalized landmark depth is separated", () => {
    const hand = makeGestureHand("left");
    hand[4] = { ...hand[4]!, z: -0.12 };
    hand[8] = { ...hand[8]!, z: 0.12 };

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics!.screenPinchRatio).toBeLessThan(metrics!.pinchEnterRatio);
    expect(metrics!.depthPinchRatio).toBeGreaterThan(metrics!.pinchEnterRatio);
    expect(metrics).toMatchObject({
      pinchContact: false,
      pinchBlockingReason: "depth",
    });
  });

  it("does not silently fall back to ambiguous 2D clicking when depth is absent", () => {
    const hand = makeGestureHand("left").map(({ x, y }) => ({ x, y }));

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics).toMatchObject({
      depthReliable: false,
      pinchContact: false,
      pinchBlockingReason: "depth",
    });
  });

  it("requires all four fingers to be genuinely extended for open palm", () => {
    expect(measureStableHand(makeGestureHand("open-palm"), 1, 0.5)?.openPalmCandidate).toBe(true);
    expect(measureStableHand(makeGestureHand("fist"), 1, 0.5)?.openPalmCandidate).toBe(false);
    expect(measureStableHand(makeGestureHand("tracking"), 1, 0.5)?.openPalmCandidate).toBe(false);

    const almostOpen = makeGestureHand("open-palm");
    almostOpen[16] = { ...almostOpen[14]! };
    expect(measureStableHand(almostOpen, 1, 0.5)?.openPalmCandidate).toBe(false);
  });

  it("maps sensitivity to bounded contact and release thresholds", () => {
    const strict = stablePinchThresholds(0);
    const normal = stablePinchThresholds(0.5);
    const permissive = stablePinchThresholds(1);

    expect(strict.enterRatio).toBeLessThan(normal.enterRatio);
    expect(normal.enterRatio).toBeLessThan(permissive.enterRatio);
    expect(strict.exitRatio).toBeGreaterThan(strict.enterRatio);
    expect(permissive.exitRatio).toBeLessThanOrEqual(0.58);
  });

  it("没有个人阈值时保持当前默认边界", () => {
    expect(resolveStablePinchThresholds(DEFAULT_GESTURE_SETTINGS)).toEqual(stablePinchThresholds(0.5));
  });

  it("只接受安全且有迟滞的个人边界", () => {
    expect(resolveStablePinchThresholds({
      ...DEFAULT_GESTURE_SETTINGS, pinchEnterRatio: 0.3, pinchExitRatio: 0.5,
    })).toEqual({ enterRatio: 0.3, exitRatio: 0.5 });
    expect(resolveStablePinchThresholds({
      ...DEFAULT_GESTURE_SETTINGS, pinchEnterRatio: 0.5, pinchExitRatio: 0.4,
    })).toEqual(stablePinchThresholds(0.5));
  });

  it("rejects malformed landmark frames", () => {
    expect(measureStableHand(null, 1, 0.5)).toBeNull();
    expect(measureStableHand(makeGestureHand("tracking").slice(0, 20), 1, 0.5)).toBeNull();
    const invalid = makeGestureHand("tracking");
    invalid[8] = { x: Number.NaN, y: 0.5, z: 0 };
    expect(measureStableHand(invalid, 1, 0.5)).toBeNull();
  });
});
