import { gestureThresholdsForSensitivity, type GestureThresholds } from "./config";
import type { GestureFeatures } from "./gestureFeatures";
import type { GestureCandidate, GestureKind } from "./types";

export class GestureClassifier {
  private readonly thresholds: GestureThresholds;

  constructor(sensitivity = 0.5) {
    this.thresholds = gestureThresholdsForSensitivity(sensitivity);
  }

  classify(features: GestureFeatures, lockedGesture: GestureKind | null = null): GestureCandidate | null {
    if (lockedGesture === "open-palm") {
      return this.classifyLocked(features, lockedGesture);
    }

    if (features.openPalmScore >= this.thresholds.openPalmEnterScore) {
      return { kind: "open-palm", score: clampUnit(features.openPalmScore) };
    }
    return null;
  }

  private classifyLocked(features: GestureFeatures, locked: GestureKind): GestureCandidate | null {
    return features.openPalmScore >= this.thresholds.openPalmExitScore
      ? { kind: locked, score: clampUnit(features.openPalmScore) }
      : null;
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
