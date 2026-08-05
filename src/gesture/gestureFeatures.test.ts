import { describe, expect, it } from "vitest";

import type { Landmark } from "./types";
import { buildHandGeometry, buildImageHandGeometry } from "./handGeometry";
import { extractGestureFeatures } from "./gestureFeatures";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

const extendedHand = (): Landmark[] => [
  { x: 0, y: 0.6, z: 0 },
  { x: -0.2, y: 0.4, z: 0 }, { x: -0.3, y: 0.25, z: 0 },
  { x: -0.32, y: 0.05, z: 0 }, { x: -0.25, y: -0.1, z: 0 },
  { x: -0.18, y: 0.05, z: 0 }, { x: -0.2, y: -0.2, z: 0 },
  { x: -0.2, y: -0.45, z: 0 }, { x: -0.2, y: -0.7, z: 0 },
  { x: 0, y: 0, z: 0 }, { x: 0, y: -0.3, z: 0 },
  { x: 0, y: -0.58, z: 0 }, { x: 0, y: -0.84, z: 0 },
  { x: 0.17, y: 0.06, z: 0 }, { x: 0.18, y: -0.2, z: 0 },
  { x: 0.18, y: -0.44, z: 0 }, { x: 0.18, y: -0.64, z: 0 },
  { x: 0.31, y: 0.14, z: 0 }, { x: 0.34, y: -0.08, z: 0 },
  { x: 0.36, y: -0.27, z: 0 }, { x: 0.38, y: -0.43, z: 0 },
];

describe("extractGestureFeatures", () => {
  it("reports high extension and open-palm scores for a straight hand", () => {
    const features = extractGestureFeatures(buildHandGeometry(extendedHand())!);

    expect(features.fingerExtension.index).toBeGreaterThan(0.95);
    expect(features.fingerExtension.middle).toBeGreaterThan(0.95);
    expect(features.openPalmScore).toBeGreaterThan(0.9);
    expect(features.scrollPoseScore).toBeLessThan(0.6);
  });

  it("rejects a fist whose projected finger segments look deceptively straight", () => {
    const features = extractGestureFeatures(buildHandGeometry(makeGestureHand("fist"))!);

    expect(Math.min(...Object.values(features.fingerExtension))).toBeGreaterThan(0.95);
    expect(features.openPalmScore).toBeLessThan(0.82);
  });

  it("reports a strong two-finger scroll pose when ring and pinky are curled", () => {
    const hand = extendedHand();
    hand[14] = { x: 0.18, y: -0.06, z: 0 };
    hand[15] = { x: 0.09, y: 0.04, z: 0 };
    hand[16] = { x: 0.17, y: 0.08, z: 0 };
    hand[18] = { x: 0.32, y: 0.02, z: 0 };
    hand[19] = { x: 0.25, y: 0.12, z: 0 };
    hand[20] = { x: 0.31, y: 0.16, z: 0 };

    const features = extractGestureFeatures(buildHandGeometry(hand)!);

    expect(features.fingerExtension.index).toBeGreaterThan(0.95);
    expect(features.fingerExtension.middle).toBeGreaterThan(0.95);
    expect(features.fingerExtension.ring).toBeLessThan(0.55);
    expect(features.fingerExtension.pinky).toBeLessThan(0.55);
    expect(features.scrollPoseScore).toBeGreaterThan(0.75);
  });

  it("carries the geometry's normalized pinch ratios and palm scale", () => {
    const geometry = buildHandGeometry(extendedHand())!;
    const features = extractGestureFeatures(geometry);

    expect(features.leftPinchRatio).toBe(geometry.pinchRatios.left);
    expect(features.rightPinchRatio).toBe(geometry.pinchRatios.right);
    expect(features.doublePinchRatio).toBe(geometry.pinchRatios.double);
    expect(features.palmScale).toBe(geometry.scale);
  });

  it("keeps image overlap separate from world-space fingertip distance", () => {
    const imageGeometry = buildHandGeometry(makeGestureHand("left"))!;
    const separatedWorldHand = makeGestureHand("left");
    separatedWorldHand[8] = { ...separatedWorldHand[4]!, z: 0.3 };
    const worldGeometry = buildHandGeometry(separatedWorldHand)!;

    const features = extractGestureFeatures(imageGeometry, worldGeometry);

    expect(features.leftPinchRatio).toBeLessThan(0.29);
    expect(features.worldLeftPinchRatio).toBeGreaterThan(0.29);
    expect(features.pinchDepthReliable).toBe(true);
  });

  it("marks pinch depth unreliable when world geometry is unavailable", () => {
    const features = extractGestureFeatures(buildHandGeometry(makeGestureHand("left"))!, null);

    expect(features.pinchDepthReliable).toBe(false);
    expect(features.worldLeftPinchRatio).toBeNull();
  });

  it("reports screen, scale, aspect-ratio, and palm-facing diagnostics", () => {
    const imageGeometry = buildImageHandGeometry(makeGestureHand("left"), 16 / 9)!;
    const worldGeometry = buildHandGeometry(makeGestureHand("left"))!;

    const features = extractGestureFeatures(imageGeometry, worldGeometry);

    expect(features.screenPinchGap).toBeGreaterThanOrEqual(0);
    expect(features.imageAspectRatio).toBeCloseTo(16 / 9);
    expect(features.worldPalmScale).toBe(worldGeometry.scale);
    expect(features.palmFacingScore).toBeCloseTo(1);
  });
});
