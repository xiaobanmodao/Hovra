import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { buildHandGeometry } from "./handGeometry";
import type { PinchFrameFeatures } from "./pinchFeatures";
import { PinchQualityEstimator } from "./pinchQuality";

const frame = (
  timestampMs: number,
  worldRatio: number | null = 0.2,
  frameIntervalMs: number | null = 16,
): PinchFrameFeatures => ({
  timestampMs,
  imageRatio: 0.2,
  worldRatio,
  imageDepthGap: 0.05,
  worldDepthGap: worldRatio === null ? null : 0.05,
  approachVelocity: 1,
  thumbCurl: 0.5,
  indexCurl: 0.5,
  contactPoseScore: 0.8,
  frameIntervalMs,
});

const world = (scale = 0.3) => buildHandGeometry(makeGestureHand("left", { scale }))!;

describe("PinchQualityEstimator", () => {
  it("keeps stable world landmarks at high quality", () => {
    const estimator = new PinchQualityEstimator();

    const result = estimator.update(frame(64), world());

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.usableForVoting).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("marks missing world landmarks without discarding a fresh image frame", () => {
    const estimator = new PinchQualityEstimator();

    const result = estimator.update(frame(16, null), null);

    expect(result.score).toBe(0);
    expect(result.usableForVoting).toBe(true);
    expect(result.reasons).toContain("world-missing");
  });

  it("rejects stale frames from temporal voting", () => {
    const estimator = new PinchQualityEstimator();

    const result = estimator.update(frame(100, 0.2, 84), world());

    expect(result.usableForVoting).toBe(false);
    expect(result.reasons).toContain("stale-frame");
  });

  it("reports an abrupt world palm scale change", () => {
    const estimator = new PinchQualityEstimator();
    estimator.update(frame(0), world(0.3));

    const result = estimator.update(frame(16), world(0.37));

    expect(result.score).toBeLessThan(0.8);
    expect(result.reasons).toContain("scale-jump");
  });

  it("reports unstable world pinch ratios over the five-frame window", () => {
    const estimator = new PinchQualityEstimator();
    const ratios = [0.1, 0.25, 0.4, 0.55, 0.7];
    let result = estimator.update(frame(0, ratios[0]), world());
    for (let index = 1; index < ratios.length; index += 1) {
      result = estimator.update(frame(index * 16, ratios[index]), world());
    }

    expect(result.score).toBeLessThan(0.8);
    expect(result.reasons).toContain("ratio-jitter");
  });
});
