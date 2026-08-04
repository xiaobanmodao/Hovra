import { describe, expect, it } from "vitest";

import type { Landmark } from "./types";
import {
  GestureTraceBuffer,
  parseGestureTrace,
  type GestureTraceFrame,
} from "./gestureTrace";

const hand = (): Landmark[] => Array.from(
  { length: 21 },
  (_, index) => ({ x: index / 100, y: index / 200, z: index === 0 ? 0 : -index / 300 }),
);

const frameAt = (t: number): GestureTraceFrame => ({
  t,
  landmarks: hand(),
  worldLandmarks: hand(),
  quality: 1,
  features: {
    leftPinchRatio: 0.2,
    worldLeftPinchRatio: 0.22,
    pinchDepthReliable: true,
    rightPinchRatio: 0.6,
    doublePinchRatio: 0.7,
    openPalmScore: 0.1,
    scrollPoseScore: 0,
    palmScale: 0.3,
  },
  phase: "neutral",
  candidate: null,
  confirmationProgress: 0,
  lockedGesture: null,
  events: [],
});

describe("GestureTraceBuffer", () => {
  it("stores world landmarks in version 2 and copies them defensively", () => {
    const buffer = new GestureTraceBuffer();
    const input = {
      ...frameAt(10),
      worldLandmarks: hand(),
      features: {
        ...frameAt(10).features!,
        worldLeftPinchRatio: 0.24,
        pinchDepthReliable: true,
      },
    };

    buffer.push(input);
    input.worldLandmarks[0]!.x = 99;

    expect(buffer.snapshot()).toMatchObject({ version: 2 });
    expect(buffer.snapshot().frames[0]!.worldLandmarks?.[0]!.x).toBe(0);
  });

  it("keeps only frames within the configured trailing time window", () => {
    const buffer = new GestureTraceBuffer(10_000);

    buffer.push(frameAt(0));
    buffer.push(frameAt(8_000));
    buffer.push(frameAt(10_001));

    expect(buffer.snapshot().frames.map((frame) => frame.t)).toEqual([8_000, 10_001]);
  });

  it("copies landmarks so later detector mutation cannot alter history", () => {
    const buffer = new GestureTraceBuffer();
    const input = frameAt(10);
    buffer.push(input);

    input.landmarks![0].x = 99;

    expect(buffer.snapshot().frames[0].landmarks?.[0].x).toBe(0);
  });

  it("accepts MediaPipe landmarks when the optional z coordinate is omitted", () => {
    const buffer = new GestureTraceBuffer();
    const input = frameAt(10);
    input.landmarks = input.landmarks!.map(({ x, y }) => ({ x, y }));

    expect(() => buffer.push(input)).not.toThrow();
    expect(buffer.snapshot().frames[0]!.landmarks![0]).toEqual({ x: 0, y: 0 });
  });

  it("rejects non-finite data and timestamps that move backwards", () => {
    const buffer = new GestureTraceBuffer();
    buffer.push(frameAt(10));

    expect(() => buffer.push(frameAt(9))).toThrow("monotonic");
    const invalid = frameAt(11);
    invalid.features!.leftPinchRatio = Number.NaN;
    expect(() => buffer.push(invalid)).toThrow("finite");
  });

  it("serializes and parses only the allow-listed trace schema", () => {
    const buffer = new GestureTraceBuffer();
    buffer.push(frameAt(16));

    const serialized = buffer.serialize();
    expect(serialized).not.toContain("image");
    expect(parseGestureTrace(serialized)).toEqual(buffer.snapshot());

    const withImage = JSON.stringify({
      ...buffer.snapshot(),
      frames: [{ ...buffer.snapshot().frames[0], image: "private" }],
    });
    expect(() => parseGestureTrace(withImage)).toThrow("unknown field");
  });

  it("migrates a valid version 1 trace without inventing world depth", () => {
    const currentFrame = frameAt(16);
    const { worldLandmarks: _worldLandmarks, features, ...legacyFields } = currentFrame;
    const {
      worldLeftPinchRatio: _worldLeftPinchRatio,
      pinchDepthReliable: _pinchDepthReliable,
      ...legacyFeatures
    } = features!;
    const legacyFrame = { ...legacyFields, features: legacyFeatures };
    const parsed = parseGestureTrace(JSON.stringify({ version: 1, frames: [legacyFrame] }));

    expect(parsed.version).toBe(2);
    expect(parsed.frames[0]).toMatchObject({
      worldLandmarks: null,
      features: {
        worldLeftPinchRatio: null,
        pinchDepthReliable: false,
      },
    });
  });

  it("rejects traces above the frame and byte limits", () => {
    const tooManyFrames = JSON.stringify({
      version: 1,
      frames: Array.from({ length: 601 }, (_, index) => frameAt(index)),
    });
    expect(() => parseGestureTrace(tooManyFrames)).toThrow("600 frames");
    expect(() => parseGestureTrace(" ".repeat(2 * 1024 * 1024 + 1))).toThrow("2 MiB");
  });
});
