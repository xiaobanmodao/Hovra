import { describe, expect, it } from "vitest";

import {
  DEFAULT_PINCH_BOUNDARIES,
  pinchEntryProbabilityForSensitivity,
} from "./config";
import type { PinchFrameFeatures } from "./pinchFeatures";
import { PinchProbabilityEstimator } from "./pinchProbability";
import type { PinchQuality } from "./pinchQuality";

const feature = (overrides: Partial<PinchFrameFeatures> = {}): PinchFrameFeatures => ({
  timestampMs: 16,
  imageRatio: 0.1,
  worldRatio: 0.1,
  imageDepthGap: 0.03,
  worldDepthGap: 0.03,
  approachVelocity: 2,
  thumbCurl: 0.5,
  indexCurl: 0.5,
  contactPoseScore: 0.9,
  frameIntervalMs: 16,
  ...overrides,
});

const quality = (score: number): PinchQuality => ({
  score,
  usableForVoting: true,
  reasons: score === 0 ? ["world-missing"] : [],
});

describe("PinchProbabilityEstimator", () => {
  it("assigns a high probability to multi-signal real contact", () => {
    const estimator = new PinchProbabilityEstimator(DEFAULT_PINCH_BOUNDARIES, 0.5);

    const result = estimator.update(feature(), quality(1));

    expect(result.probability).toBeGreaterThanOrEqual(0.72);
    expect(result.safetyGatePassed).toBe(true);
    expect(result.blockingReason).toBe("none");
  });

  it("blocks image overlap when reliable world geometry remains separated", () => {
    const estimator = new PinchProbabilityEstimator(DEFAULT_PINCH_BOUNDARIES, 0.5);

    const result = estimator.update(feature({ worldRatio: 0.9, worldDepthGap: 0.9 }), quality(1));

    expect(result.probability).toBeLessThan(result.entryThreshold);
    expect(result.safetyGatePassed).toBe(false);
    expect(result.blockingReason).toBe("depth");
  });

  it("allows missing world landmarks only when image, pose, depth, and approach agree", () => {
    const estimator = new PinchProbabilityEstimator(DEFAULT_PINCH_BOUNDARIES, 0.5);

    const result = estimator.update(feature({ worldRatio: null, worldDepthGap: null }), quality(0));

    expect(result.approachObserved).toBe(true);
    expect(result.safetyGatePassed).toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(result.entryThreshold);
  });

  it("blocks static two-dimensional overlap without a recent approach", () => {
    const estimator = new PinchProbabilityEstimator(DEFAULT_PINCH_BOUNDARIES, 0.5);

    const result = estimator.update(feature({
      worldRatio: null,
      worldDepthGap: null,
      approachVelocity: 0,
    }), quality(0));

    expect(result.approachObserved).toBe(false);
    expect(result.safetyGatePassed).toBe(false);
    expect(result.blockingReason).toBe("approach");
    expect(result.probability).toBeLessThan(result.entryThreshold);
  });

  it("expires old approach evidence after 250 milliseconds", () => {
    const estimator = new PinchProbabilityEstimator(DEFAULT_PINCH_BOUNDARIES, 0.5);
    estimator.update(feature({ timestampMs: 0 }), quality(0));

    const result = estimator.update(feature({
      timestampMs: 300,
      approachVelocity: 0,
      worldRatio: null,
      worldDepthGap: null,
    }), quality(0));

    expect(result.approachObserved).toBe(false);
    expect(result.safetyGatePassed).toBe(false);
  });

  it("limits sensitivity to a safe probability threshold range", () => {
    expect(pinchEntryProbabilityForSensitivity(0)).toBeCloseTo(0.78);
    expect(pinchEntryProbabilityForSensitivity(0.5)).toBeCloseTo(0.72);
    expect(pinchEntryProbabilityForSensitivity(1)).toBeCloseTo(0.66);
    expect(pinchEntryProbabilityForSensitivity(Number.NaN)).toBeCloseTo(0.72);
  });

  it("rejects invalid calibration boundaries", () => {
    expect(() => new PinchProbabilityEstimator({
      ...DEFAULT_PINCH_BOUNDARIES,
      imageContact: 0.5,
      imageSeparate: 0.4,
    }, 0.5)).toThrow(TypeError);
  });
});
