import { describe, expect, it } from "vitest";

import { parseAppleVisionResponse } from "./appleVisionProtocol";

const landmarks = () => Array.from({ length: 21 }, (_, index) => ({
  x: index / 21,
  y: 1 - index / 21,
  confidence: 0.8,
}));

describe("parseAppleVisionResponse", () => {
  it("accepts a strict successful response", () => {
    const value = { id: 7, landmarks: landmarks(), inferenceMs: 12.5, error: null };

    expect(parseAppleVisionResponse(JSON.stringify(value))).toEqual(value);
  });

  it("accepts a no-hand response with an explicit error", () => {
    const value = { id: 8, landmarks: null, inferenceMs: 9, error: "未检测到手部" };

    expect(parseAppleVisionResponse(JSON.stringify(value))).toEqual(value);
  });

  it.each([
    "not-json",
    JSON.stringify({ id: 1, landmarks: landmarks(), inferenceMs: 1 }),
    JSON.stringify({ id: 0, landmarks: landmarks(), inferenceMs: 1, error: null }),
    JSON.stringify({ id: 1, landmarks: landmarks().slice(0, 20), inferenceMs: 1, error: null }),
    JSON.stringify({
      id: 1,
      landmarks: landmarks().map((point, index) => index === 4 ? { ...point, confidence: 1.1 } : point),
      inferenceMs: 1,
      error: null,
    }),
    JSON.stringify({
      id: 1,
      landmarks: landmarks().map((point, index) => index === 8 ? { ...point, x: Number.NaN } : point),
      inferenceMs: 1,
      error: null,
    }),
    JSON.stringify({ id: 1, landmarks: null, inferenceMs: -1, error: "失败" }),
    JSON.stringify({ id: 1, landmarks: null, inferenceMs: 1, error: null, extra: true }),
  ])("rejects malformed helper output", (line) => {
    expect(() => parseAppleVisionResponse(line)).toThrow(TypeError);
  });
});
