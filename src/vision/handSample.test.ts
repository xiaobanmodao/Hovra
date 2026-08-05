import { describe, expect, it } from "vitest";

import { parseHandSample, serializeHandSample, type HandSample } from "./handSample";

const landmarks = () => Array.from({ length: 21 }, (_, index) => ({
  x: index / 21,
  y: index / 42,
  z: index === 0 ? 0 : -index / 100,
}));

const sample = (): HandSample => ({
  version: 1,
  capturedAtMs: 120,
  imageAspectRatio: 16 / 9,
  jpegBase64: "/9j/2Q==",
  mediaPipeLandmarks: landmarks(),
  mediaPipeWorldLandmarks: landmarks(),
  appleVision: {
    landmarks: landmarks().map(({ x, y }) => ({ x, y })),
    confidences: Array.from({ length: 21 }, () => 0.9),
    capturedAtMs: 120,
    inferenceMs: 10,
  },
  diagnostics: {
    palmFacingScore: 0.2,
    mediaPipePinchRatio: 0.7,
    visionPinchRatio: 0.2,
    visionConfidence: 0.9,
    modelAgreement: false,
    blockingReason: "none",
  },
});

describe("HandSample", () => {
  it("round-trips one bounded local JPEG and both model observations", () => {
    expect(parseHandSample(serializeHandSample(sample()))).toEqual(sample());
  });

  it("rejects non-JPEG data, unknown fields, and malformed landmarks", () => {
    expect(() => parseHandSample(JSON.stringify({ ...sample(), jpegBase64: "AQID" }))).toThrow("JPEG");
    expect(() => parseHandSample(JSON.stringify({ ...sample(), privatePath: "/tmp/a" }))).toThrow("unknown");
    const invalid = sample();
    invalid.appleVision!.landmarks.pop();
    expect(() => parseHandSample(JSON.stringify(invalid))).toThrow("21");
  });
});
