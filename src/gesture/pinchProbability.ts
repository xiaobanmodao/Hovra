import {
  pinchEntryProbabilityForSensitivity,
  type PinchBoundaries,
} from "./config";
import type { PinchFrameFeatures } from "./pinchFeatures";
import type { PinchQuality } from "./pinchQuality";

export type PinchBlockingReason = "none" | "image" | "depth" | "pose" | "approach";

export type PinchProbabilityResult = {
  probability: number;
  entryThreshold: number;
  worldQuality: number;
  safetyGatePassed: boolean;
  approachObserved: boolean;
  blockingReason: PinchBlockingReason;
};

export class PinchProbabilityEstimator {
  private readonly entryThreshold: number;
  private lastApproachAt: number | null = null;
  private lastTimestampMs: number | null = null;

  constructor(
    private readonly boundaries: PinchBoundaries,
    sensitivity: number,
  ) {
    validateBoundaries(boundaries);
    this.entryThreshold = pinchEntryProbabilityForSensitivity(sensitivity);
  }

  update(features: PinchFrameFeatures, quality: PinchQuality): PinchProbabilityResult {
    if (this.lastTimestampMs !== null && (
      features.timestampMs < this.lastTimestampMs
      || features.timestampMs - this.lastTimestampMs > 80
    )) {
      this.lastApproachAt = null;
    }
    this.lastTimestampMs = features.timestampMs;

    const approachScore = clamp01(features.approachVelocity / 2);
    if (approachScore >= 0.55) this.lastApproachAt = features.timestampMs;
    const approachObserved = this.lastApproachAt !== null
      && features.timestampMs - this.lastApproachAt <= 250;
    if (!approachObserved) this.lastApproachAt = null;

    const imageCloseness = closeness(
      features.imageRatio,
      this.boundaries.imageContact,
      this.boundaries.imageSeparate,
    );
    const worldCloseness = features.worldRatio === null ? 0 : closeness(
      features.worldRatio,
      this.boundaries.worldContact,
      this.boundaries.worldSeparate,
    );
    const depthCloseness = closeness(
      features.imageDepthGap,
      this.boundaries.depthContact,
      this.boundaries.depthSeparate,
    );
    const poseScore = clamp01(features.contactPoseScore);
    const highWorldQuality = quality.score >= 0.6 && features.worldRatio !== null;

    let probability: number;
    let blockingReason: PinchBlockingReason = "none";
    let safetyGatePassed: boolean;
    if (highWorldQuality) {
      probability = 0.35 * imageCloseness
        + 0.25 * worldCloseness
        + 0.15 * depthCloseness
        + 0.10 * approachScore
        + 0.15 * poseScore;
      safetyGatePassed = imageCloseness >= 0.65 && worldCloseness >= 0.5;
      if (imageCloseness < 0.65) blockingReason = "image";
      else if (worldCloseness < 0.5) blockingReason = "depth";
    } else {
      probability = 0.45 * imageCloseness
        + 0.20 * depthCloseness
        + 0.15 * approachScore
        + 0.20 * poseScore;
      safetyGatePassed = imageCloseness >= 0.82
        && depthCloseness >= 0.65
        && poseScore >= 0.65
        && approachObserved;
      if (imageCloseness < 0.82) blockingReason = "image";
      else if (depthCloseness < 0.65) blockingReason = "depth";
      else if (poseScore < 0.65) blockingReason = "pose";
      else if (!approachObserved) blockingReason = "approach";
    }

    if (!safetyGatePassed) probability = Math.min(probability, this.entryThreshold - 0.01);
    return {
      probability: clamp01(probability),
      entryThreshold: this.entryThreshold,
      worldQuality: clamp01(quality.score),
      safetyGatePassed,
      approachObserved,
      blockingReason,
    };
  }

  reset(): void {
    this.lastApproachAt = null;
    this.lastTimestampMs = null;
  }
}

function closeness(value: number, contact: number, separate: number): number {
  return clamp01((separate - value) / (separate - contact));
}

function validateBoundaries(boundaries: PinchBoundaries): void {
  for (const [contact, separate] of [
    [boundaries.imageContact, boundaries.imageSeparate],
    [boundaries.worldContact, boundaries.worldSeparate],
    [boundaries.depthContact, boundaries.depthSeparate],
  ]) {
    if (!Number.isFinite(contact) || !Number.isFinite(separate) || contact < 0 || separate - contact < 0.01) {
      throw new TypeError("Pinch boundaries must be finite, positive, and ordered");
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
