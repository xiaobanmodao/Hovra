import { DEFAULT_PINCH_BOUNDARIES, type PinchBoundaries } from "./config";

export const PINCH_CALIBRATION_STORAGE_KEY = "gesture-control.pinch-calibration.v1";

export type PinchCalibrationSample = {
  imageRatio: number;
  worldRatio: number;
  depthGap: number;
};

export type CalibrationSamples = {
  positives: PinchCalibrationSample[];
  negatives: PinchCalibrationSample[];
  baselineNoise: number[];
};

export type PinchCalibrationProfile = {
  version: 1;
  createdAt: string;
  boundaries: PinchBoundaries;
  baselineNoise: number;
};

export function fitPinchCalibration(samples: CalibrationSamples): PinchCalibrationProfile {
  if (samples.positives.length < 10) {
    throw new TypeError("Pinch calibration requires at least 10 positive samples");
  }
  if (samples.negatives.length < 3) {
    throw new TypeError("Pinch calibration requires at least 3 negative samples");
  }
  if (samples.baselineNoise.length < 1) {
    throw new TypeError("Pinch calibration requires baseline noise samples");
  }
  validateSamples(samples);

  const boundaries: PinchBoundaries = {
    imageContact: quantile(samples.positives.map((sample) => sample.imageRatio), 0.9) * 1.08,
    imageSeparate: DEFAULT_PINCH_BOUNDARIES.imageSeparate,
    worldContact: quantile(samples.positives.map((sample) => sample.worldRatio), 0.9) * 1.08,
    worldSeparate: quantile(samples.negatives.map((sample) => sample.worldRatio), 0.1),
    depthContact: quantile(samples.positives.map((sample) => sample.depthGap), 0.9) * 1.08,
    depthSeparate: quantile(samples.negatives.map((sample) => sample.depthGap), 0.1),
  };
  validateBoundarySeparation(boundaries);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    boundaries,
    baselineNoise: quantile(samples.baselineNoise, 0.9),
  };
}

export function parsePinchCalibration(value: string | null): PinchCalibrationProfile | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ["version", "createdAt", "boundaries", "baselineNoise"])) {
    return null;
  }
  if (parsed.version !== 1 || typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) {
    return null;
  }
  if (!isFiniteNonNegative(parsed.baselineNoise) || !isRecord(parsed.boundaries) || !hasExactKeys(
    parsed.boundaries,
    ["imageContact", "imageSeparate", "worldContact", "worldSeparate", "depthContact", "depthSeparate"],
  )) {
    return null;
  }
  const boundaries = parsed.boundaries as Record<keyof PinchBoundaries, unknown>;
  if (!Object.values(boundaries).every(isFiniteNonNegative)) return null;
  const typedBoundaries = boundaries as unknown as PinchBoundaries;
  try {
    validateBoundarySeparation(typedBoundaries);
  } catch {
    return null;
  }
  return {
    version: 1,
    createdAt: parsed.createdAt,
    boundaries: { ...typedBoundaries },
    baselineNoise: parsed.baselineNoise,
  };
}

function validateSamples(samples: CalibrationSamples): void {
  const values = [
    ...samples.positives.flatMap((sample) => [sample.imageRatio, sample.worldRatio, sample.depthGap]),
    ...samples.negatives.flatMap((sample) => [sample.imageRatio, sample.worldRatio, sample.depthGap]),
    ...samples.baselineNoise,
  ];
  if (!values.every(isFiniteNonNegative)) {
    throw new TypeError("Pinch calibration samples must be finite and non-negative");
  }
}

function validateBoundarySeparation(boundaries: PinchBoundaries): void {
  for (const [contact, separate] of [
    [boundaries.imageContact, boundaries.imageSeparate],
    [boundaries.worldContact, boundaries.worldSeparate],
    [boundaries.depthContact, boundaries.depthSeparate],
  ]) {
    if (!isFiniteNonNegative(contact) || !isFiniteNonNegative(separate) || separate - contact < 0.06) {
      throw new TypeError("Pinch calibration positive and negative samples overlap");
    }
  }
}

function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index]!;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
