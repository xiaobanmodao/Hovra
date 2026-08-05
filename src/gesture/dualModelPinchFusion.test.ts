import { describe, expect, it } from "vitest";

import type { AppleVisionObservation } from "../vision/appleVisionTypes";
import { DEFAULT_PINCH_BOUNDARIES } from "./config";
import {
  DualModelPinchFusion,
  extractSecondaryPinchEvidence,
  type SecondaryPinchEvidence,
} from "./dualModelPinchFusion";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import type { PinchFrameFeatures } from "./pinchFeatures";
import type { PinchProbabilityResult } from "./pinchProbability";

const baseResult = (safetyGatePassed = false): PinchProbabilityResult => ({
  probability: safetyGatePassed ? 0.9 : 0.4,
  entryThreshold: 0.72,
  worldQuality: 0.9,
  safetyGatePassed,
  approachObserved: safetyGatePassed,
  blockingReason: safetyGatePassed ? "none" : "image",
});

const features: PinchFrameFeatures = {
  timestampMs: 0,
  imageRatio: 0.75,
  worldRatio: 0.75,
  imageDepthGap: 0.05,
  worldDepthGap: 0.05,
  approachVelocity: 0,
  thumbCurl: 0.5,
  indexCurl: 0.5,
  contactPoseScore: 0.2,
  frameIntervalMs: 80,
};

const evidence = (ratio: number, capturedAtMs: number): SecondaryPinchEvidence => ({
  ratio,
  confidence: 0.9,
  ageMs: 20,
  inferenceMs: 12,
  capturedAtMs,
});

describe("extractSecondaryPinchEvidence", () => {
  const observation = (capturedAtMs: number, confidence = 0.9): AppleVisionObservation => ({
    landmarks: makeGestureHand("left"),
    confidences: Array.from({ length: 21 }, () => confidence),
    capturedAtMs,
    inferenceMs: 14,
  });

  it("rejects stale and low-confidence observations", () => {
    expect(extractSecondaryPinchEvidence(observation(0), 181, 16 / 9)).toBeNull();
    expect(extractSecondaryPinchEvidence(observation(0, 0.44), 100, 16 / 9)).toBeNull();
  });

  it("normalizes a fresh observation with image aspect ratio", () => {
    const extracted = extractSecondaryPinchEvidence(observation(100), 150, 16 / 9);

    expect(extracted).toMatchObject({
      confidence: 0.9,
      ageMs: 50,
      inferenceMs: 14,
      capturedAtMs: 100,
    });
    expect(extracted!.ratio).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(extracted!.ratio)).toBe(true);
  });
});

describe("DualModelPinchFusion", () => {
  it("uses Apple Vision as the primary side-view contact evidence", () => {
    const fusion = new DualModelPinchFusion(DEFAULT_PINCH_BOUNDARIES);

    expect(fusion.update(baseResult(), features, 0.2, evidence(0.48, 0)).probability.safetyGatePassed).toBe(false);
    expect(fusion.update(baseResult(), features, 0.2, evidence(0.32, 80))).toMatchObject({
      mode: "dual",
      strictVoting: true,
      voteEligible: true,
      probability: { safetyGatePassed: true, blockingReason: "none" },
    });
  });

  it("blocks a static side-view overlap without an observed closing motion", () => {
    const fusion = new DualModelPinchFusion(DEFAULT_PINCH_BOUNDARIES);

    const output = fusion.update(baseResult(), features, 0.2, evidence(0.2, 0));

    expect(output.probability).toMatchObject({
      safetyGatePassed: false,
      approachObserved: false,
      blockingReason: "approach",
    });
  });

  it("does not count the same Apple Vision frame twice", () => {
    const fusion = new DualModelPinchFusion(DEFAULT_PINCH_BOUNDARIES);
    fusion.update(baseResult(), features, 0.2, evidence(0.48, 0));
    fusion.update(baseResult(), features, 0.2, evidence(0.3, 80));

    expect(fusion.update(baseResult(), features, 0.2, evidence(0.3, 80)).voteEligible).toBe(false);
  });

  it("lets clearly separated Apple Vision fingertips block a false front-view contact", () => {
    const fusion = new DualModelPinchFusion(DEFAULT_PINCH_BOUNDARIES);

    const output = fusion.update(baseResult(true), { ...features, imageRatio: 0.2 }, 0.9, evidence(0.8, 0));

    expect(output.probability).toMatchObject({
      safetyGatePassed: false,
      blockingReason: "vision",
    });
    expect(output.modelsAgree).toBe(false);
  });
});
