import { describe, expect, it } from "vitest";

import { buildHandGeometry } from "./handGeometry";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { PinchFeatureExtractor } from "./pinchFeatures";

const geometry = (gesture: "tracking" | "left") => buildHandGeometry(makeGestureHand(gesture))!;

describe("PinchFeatureExtractor", () => {
  it("measures a real pinch independently of hand scale and image rotation", () => {
    const extractor = new PinchFeatureExtractor();
    const image = buildHandGeometry(makeGestureHand("left", { scale: 0.45, rotation: Math.PI / 3 }))!;
    const world = buildHandGeometry(makeGestureHand("left", { scale: 0.12, rotation: -Math.PI / 4 }))!;

    const features = extractor.update(image, world, 16);

    expect(features.imageRatio).toBeLessThan(0.1);
    expect(features.worldRatio).toBeLessThan(0.1);
    expect(features.imageDepthGap).toBeLessThan(0.01);
    expect(features.worldDepthGap).toBeLessThan(0.01);
    expect(features.contactPoseScore).toBeGreaterThan(0.6);
  });

  it("keeps image overlap separate from world depth separation", () => {
    const extractor = new PinchFeatureExtractor();
    const worldSeparated = makeGestureHand("left");
    worldSeparated[8] = { ...worldSeparated[4]!, z: 0.3 };

    const features = extractor.update(
      geometry("left"),
      buildHandGeometry(worldSeparated)!,
      16,
    );

    expect(features.imageRatio).toBeLessThan(0.1);
    expect(features.worldRatio).toBeGreaterThan(1);
    expect(features.worldDepthGap).toBeGreaterThan(1);
  });

  it("reports positive approach velocity only for fresh decreasing distances", () => {
    const extractor = new PinchFeatureExtractor();

    extractor.update(geometry("tracking"), geometry("tracking"), 0);
    const approaching = extractor.update(geometry("left"), geometry("left"), 16);
    const stale = extractor.update(geometry("left"), geometry("left"), 116);

    expect(approaching.approachVelocity).toBeGreaterThan(1);
    expect(approaching.frameIntervalMs).toBe(16);
    expect(stale.approachVelocity).toBe(0);
    expect(stale.frameIntervalMs).toBe(100);
  });

  it("resets temporal history when timestamps move backwards", () => {
    const extractor = new PinchFeatureExtractor();
    extractor.update(geometry("tracking"), geometry("tracking"), 32);

    const features = extractor.update(geometry("left"), geometry("left"), 16);

    expect(features.frameIntervalMs).toBeNull();
    expect(features.approachVelocity).toBe(0);
  });
});
