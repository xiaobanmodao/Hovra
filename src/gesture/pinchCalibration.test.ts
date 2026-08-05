import { describe, expect, it } from "vitest";

import {
  PINCH_CALIBRATION_STORAGE_KEY,
  PinchCalibrationSeparationError,
  fitPinchCalibration,
  parsePinchCalibration,
  type PinchCalibrationSample,
} from "./pinchCalibration";

const sample = (
  imageRatio: number,
  worldRatio: number,
  depthGap: number,
): PinchCalibrationSample => ({ imageRatio, worldRatio, depthGap });

describe("pinch calibration", () => {
  it("fits ordered boundaries from ten positive and three negative samples", () => {
    const positives = Array.from({ length: 10 }, (_, index) => sample(
      0.2 + index * 0.008,
      0.19 + index * 0.008,
      0.06 + index * 0.004,
    ));
    const negatives = [
      sample(0.48, 0.55, 0.35),
      sample(0.52, 0.6, 0.4),
      sample(0.58, 0.66, 0.46),
    ];

    const profile = fitPinchCalibration({ positives, negatives, baselineNoise: [0.01, 0.02, 0.03] });

    expect(profile.version).toBe(2);
    expect(profile.boundaries.imageContact).toBeGreaterThan(0.27);
    expect(profile.boundaries.imageContact).toBeLessThan(profile.boundaries.imageSeparate - 0.06);
    expect(profile.boundaries.worldContact).toBeLessThan(profile.boundaries.worldSeparate - 0.06);
    expect(profile.boundaries.depthContact).toBeLessThan(profile.boundaries.depthSeparate - 0.06);
    expect(profile.baselineNoise).toBe(0.03);
    expect(Number.isNaN(Date.parse(profile.createdAt))).toBe(false);
  });

  it("rejects insufficient, non-finite, and overlapping samples", () => {
    const positive = sample(0.25, 0.25, 0.1);
    const negative = sample(0.5, 0.5, 0.4);

    expect(() => fitPinchCalibration({
      positives: Array(9).fill(positive),
      negatives: Array(3).fill(negative),
      baselineNoise: [0.01],
    })).toThrow("10 positive");
    expect(() => fitPinchCalibration({
      positives: Array(10).fill(sample(0.48, 0.48, 0.35)),
      negatives: Array(3).fill(sample(0.5, 0.5, 0.38)),
      baselineNoise: [0.01],
    })).toThrow("overlap");
    expect(() => fitPinchCalibration({
      positives: Array(10).fill(sample(Number.NaN, 0.2, 0.1)),
      negatives: Array(3).fill(negative),
      baselineNoise: [0.01],
    })).toThrow(TypeError);
  });

  it("reports every calibration channel whose separation is too small", () => {
    const positives = Array(10).fill(sample(0.25, 0.48, 0.35));
    const negatives = Array(3).fill(sample(0.48, 0.55, 0.4));

    let error: unknown;
    try {
      fitPinchCalibration({ positives, negatives, baselineNoise: [0.01] });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PinchCalibrationSeparationError);
    const separationError = error as PinchCalibrationSeparationError;
    expect(separationError.analysis.passed).toBe(false);
    expect(separationError.analysis.gaps.filter((gap) => !gap.pass)).toEqual([
      {
        channel: "world",
        contact: 0.5184,
        separate: 0.55,
        gap: 0.03160000000000007,
        requiredGap: 0.06,
        pass: false,
      },
      {
        channel: "depth",
        contact: 0.378,
        separate: 0.4,
        gap: 0.02200000000000002,
        requiredGap: 0.06,
        pass: false,
      },
    ]);
  });

  it("strictly parses a stored profile and ignores malformed local data", () => {
    const valid = {
      version: 2,
      createdAt: "2026-08-04T12:00:00.000Z",
      boundaries: {
        imageContact: 0.3,
        imageSeparate: 0.5,
        worldContact: 0.3,
        worldSeparate: 0.5,
        depthContact: 0.15,
        depthSeparate: 0.35,
      },
      baselineNoise: 0.02,
    };

    expect(parsePinchCalibration(JSON.stringify(valid))).toEqual(valid);
    expect(parsePinchCalibration(JSON.stringify({ ...valid, version: 1 }))).toBeNull();
    expect(parsePinchCalibration(null)).toBeNull();
    expect(parsePinchCalibration("not-json")).toBeNull();
    expect(parsePinchCalibration(JSON.stringify({ ...valid, extra: true }))).toBeNull();
    expect(parsePinchCalibration(JSON.stringify({
      ...valid,
      boundaries: { ...valid.boundaries, imageSeparate: 0.2 },
    }))).toBeNull();
    expect(PINCH_CALIBRATION_STORAGE_KEY).toBe("gesture-control.pinch-calibration.v2");
  });
});
