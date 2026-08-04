import type { HandGeometry } from "./handGeometry";
import { landmarkDistance } from "./landmarkMetrics";
import type { PinchFrameFeatures } from "./pinchFeatures";
import {
  INDEX_FINGER_MCP,
  INDEX_FINGER_PIP,
  MIDDLE_FINGER_MCP,
  PINKY_MCP,
  THUMB_CMC,
  THUMB_MCP,
  WRIST,
} from "./types";

export type PinchQualityReason =
  | "world-missing"
  | "stale-frame"
  | "scale-jump"
  | "bone-jitter"
  | "ratio-jitter";

export type PinchQuality = {
  score: number;
  usableForVoting: boolean;
  reasons: PinchQualityReason[];
};

type QualitySample = {
  scale: number;
  normalizedBoneLengths: number[];
  worldRatio: number;
};

export class PinchQualityEstimator {
  private readonly history: QualitySample[] = [];

  update(features: PinchFrameFeatures, world: HandGeometry | null): PinchQuality {
    const reasons: PinchQualityReason[] = [];
    const usableForVoting = features.frameIntervalMs === null || features.frameIntervalMs <= 80;
    if (!usableForVoting) reasons.push("stale-frame");

    if (!world || features.worldRatio === null) {
      reasons.unshift("world-missing");
      return { score: 0, usableForVoting, reasons };
    }

    const sample: QualitySample = {
      scale: world.scale,
      normalizedBoneLengths: boneLengths(world),
      worldRatio: features.worldRatio,
    };
    const previous = this.history.at(-1);
    if (previous && relativeDelta(previous.scale, sample.scale) > 0.18) {
      reasons.push("scale-jump");
    }

    this.history.push(sample);
    if (this.history.length > 5) this.history.shift();

    if (this.history.length >= 3 && maximumBoneCoefficientOfVariation(this.history) > 0.12) {
      reasons.push("bone-jitter");
    }
    if (this.history.length >= 5 && medianAbsoluteDeviation(
      this.history.map((entry) => entry.worldRatio),
    ) > 0.08) {
      reasons.push("ratio-jitter");
    }

    let score = 1;
    if (reasons.includes("scale-jump")) score -= 0.35;
    if (reasons.includes("bone-jitter")) score -= 0.30;
    if (reasons.includes("ratio-jitter")) score -= 0.35;
    return { score: clamp01(score), usableForVoting, reasons };
  }

  reset(): void {
    this.history.length = 0;
  }
}

function boneLengths(world: HandGeometry): number[] {
  const points = world.landmarks;
  return [
    [WRIST, MIDDLE_FINGER_MCP],
    [INDEX_FINGER_MCP, PINKY_MCP],
    [THUMB_CMC, THUMB_MCP],
    [INDEX_FINGER_MCP, INDEX_FINGER_PIP],
  ].map(([from, to]) => landmarkDistance(points[from]!, points[to]!) / world.scale);
}

function maximumBoneCoefficientOfVariation(samples: QualitySample[]): number {
  return Math.max(...samples[0]!.normalizedBoneLengths.map((_, boneIndex) => {
    const values = samples.map((sample) => sample.normalizedBoneLengths[boneIndex]!);
    const mean = average(values);
    if (mean <= 1e-9) return Number.POSITIVE_INFINITY;
    const variance = average(values.map((value) => (value - mean) ** 2));
    return Math.sqrt(variance) / mean;
  }));
}

function medianAbsoluteDeviation(values: number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function relativeDelta(first: number, second: number): number {
  return Math.abs(second - first) / Math.max(Math.abs(first), 1e-9);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
