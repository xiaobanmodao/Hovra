import { gestureThresholdsForSensitivity, type GestureThresholds } from "./config";
import type { GestureFeatures } from "./gestureFeatures";
import type { GestureCandidate, GestureKind } from "./types";

export class GestureClassifier {
  private readonly thresholds: GestureThresholds;

  constructor(sensitivity = 0.5) {
    this.thresholds = gestureThresholdsForSensitivity(sensitivity);
  }

  classify(features: GestureFeatures, lockedGesture: GestureKind | null = null): GestureCandidate | null {
    if (lockedGesture) {
      return this.classifyLocked(features, lockedGesture);
    }

    if (hasPinchEvidence(features, this.thresholds.pinchEnterRatio)) {
      return {
        kind: "left",
        score: Math.min(
          pinchScore(features.leftPinchRatio, this.thresholds),
          pinchScore(features.worldLeftPinchRatio!, this.thresholds),
        ),
      };
    }

    if (features.openPalmScore >= this.thresholds.openPalmEnterScore) {
      return { kind: "open-palm", score: clampUnit(features.openPalmScore) };
    }
    return null;
  }

  private classifyLocked(features: GestureFeatures, locked: GestureKind): GestureCandidate | null {
    if (locked === "open-palm") {
      return features.openPalmScore >= this.thresholds.openPalmExitScore
        ? { kind: locked, score: clampUnit(features.openPalmScore) }
        : null;
    }

    return hasPinchEvidence(features, this.thresholds.pinchExitRatio)
      ? {
          kind: "left",
          score: Math.min(
            pinchScore(features.leftPinchRatio, this.thresholds),
            pinchScore(features.worldLeftPinchRatio!, this.thresholds),
          ),
        }
      : null;
  }
}

function hasPinchEvidence(features: GestureFeatures, threshold: number): boolean {
  return features.pinchDepthReliable
    && features.worldLeftPinchRatio !== null
    && features.leftPinchRatio <= threshold
    && features.worldLeftPinchRatio <= threshold;
}

function pinchScore(ratio: number, thresholds: GestureThresholds): number {
  const width = thresholds.pinchExitRatio - thresholds.pinchEnterRatio;
  return clampUnit((thresholds.pinchExitRatio - ratio) / width);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
