import { gestureThresholdsForSensitivity, type GestureThresholds } from "./config";
import type { GestureFeatures } from "./gestureFeatures";
import type { GestureCandidate, GestureKind } from "./types";

type PinchKind = "left" | "right" | "double";

export class GestureClassifier {
  private readonly thresholds: GestureThresholds;

  constructor(sensitivity = 0.5) {
    this.thresholds = gestureThresholdsForSensitivity(sensitivity);
  }

  classify(features: GestureFeatures, lockedGesture: GestureKind | null = null): GestureCandidate | null {
    if (lockedGesture) {
      return this.classifyLocked(features, lockedGesture);
    }

    const pinches: Array<{ kind: PinchKind; ratio: number }> = [
      { kind: "left", ratio: features.leftPinchRatio },
      { kind: "right", ratio: features.rightPinchRatio },
      { kind: "double", ratio: features.doublePinchRatio },
    ];
    const strongest = pinches
      .filter(({ ratio }) => ratio <= this.thresholds.pinchEnterRatio)
      .sort((first, second) => first.ratio - second.ratio)[0];
    if (strongest) {
      return {
        kind: strongest.kind,
        score: pinchScore(strongest.ratio, this.thresholds),
      };
    }

    if (features.scrollPoseScore >= this.thresholds.scrollEnterScore) {
      return { kind: "scroll", score: clampUnit(features.scrollPoseScore) };
    }
    if (features.openPalmScore >= this.thresholds.openPalmEnterScore) {
      return { kind: "open-palm", score: clampUnit(features.openPalmScore) };
    }
    return null;
  }

  private classifyLocked(features: GestureFeatures, locked: GestureKind): GestureCandidate | null {
    if (locked === "scroll") {
      return features.scrollPoseScore >= this.thresholds.scrollExitScore
        ? { kind: locked, score: clampUnit(features.scrollPoseScore) }
        : null;
    }
    if (locked === "open-palm") {
      return features.openPalmScore >= this.thresholds.openPalmExitScore
        ? { kind: locked, score: clampUnit(features.openPalmScore) }
        : null;
    }

    const ratio = pinchRatio(features, locked);
    return ratio <= this.thresholds.pinchExitRatio
      ? { kind: locked, score: pinchScore(ratio, this.thresholds) }
      : null;
  }
}

function pinchRatio(features: GestureFeatures, kind: PinchKind): number {
  if (kind === "left") return features.leftPinchRatio;
  if (kind === "right") return features.rightPinchRatio;
  return features.doublePinchRatio;
}

function pinchScore(ratio: number, thresholds: GestureThresholds): number {
  const width = thresholds.pinchExitRatio - thresholds.pinchEnterRatio;
  return clampUnit((thresholds.pinchExitRatio - ratio) / width);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
