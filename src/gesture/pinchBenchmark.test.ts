import { describe, expect, it } from "vitest";

import { GestureTraceBuffer, type GestureTraceFrame } from "./gestureTrace";
import { benchmarkPinchTrace, type PinchBenchmarkLabel } from "./pinchBenchmark";

const frame = (
  t: number,
  options: { click?: boolean; locked?: boolean } = {},
): GestureTraceFrame => ({
  t,
  landmarks: null,
  worldLandmarks: null,
  quality: 1,
  features: {
    leftPinchRatio: 0.2,
    worldLeftPinchRatio: 0.2,
    pinchDepthReliable: true,
    rightPinchRatio: 0.8,
    doublePinchRatio: 0.8,
    openPalmScore: 0.1,
    scrollPoseScore: 0.1,
    palmScale: 0.3,
    imageDepthGap: 0.04,
    worldDepthGap: 0.04,
    approachVelocity: 1,
    contactPoseScore: 0.8,
    worldQuality: 1,
    qualityReasons: [],
    pinchProbability: options.locked ? 0.9 : 0.2,
    safetyGatePassed: options.locked ?? false,
    blockingReason: options.locked ? "none" : "image",
    enterVotes: options.locked ? 2 : 0,
    requiredVotes: 2,
    frameIntervalMs: t === 0 ? null : 16,
    inferenceMs: 8,
    effectiveFps: t === 0 ? null : 62.5,
  },
  phase: options.locked ? "active" : "neutral",
  candidate: null,
  confirmationProgress: options.locked ? 1 : 0,
  lockedGesture: options.locked ? "left" : null,
  events: options.click ? ["click"] : [],
});

const traceWith = (frames: GestureTraceFrame[]) => {
  const buffer = new GestureTraceBuffer();
  frames.forEach((value) => buffer.push(value));
  return buffer.snapshot();
};

describe("benchmarkPinchTrace", () => {
  it("separates true, false, and duplicate clicks and measures activation latency", () => {
    const trace = traceWith([
      frame(0, { click: true }),
      frame(16),
      frame(32, { locked: true }),
      frame(48, { click: true }),
      frame(64, { click: true }),
    ]);
    const labels = new Map<number, PinchBenchmarkLabel>([
      [0, "separate"],
      [16, "contact"],
      [32, "contact"],
      [48, "separate"],
      [64, "separate"],
    ]);

    expect(benchmarkPinchTrace(trace, labels)).toEqual({
      positives: 1,
      truePositives: 1,
      falsePositives: 1,
      duplicateClicks: 1,
      recall: 1,
      p95ActivationLatencyMs: 16,
      effectiveFps: 62.5,
    });
  });

  it("returns null recall and latency when there are no positive segments", () => {
    const trace = traceWith([frame(0), frame(20)]);
    const labels = new Map<number, PinchBenchmarkLabel>([[0, "separate"], [20, "separate"]]);

    expect(benchmarkPinchTrace(trace, labels)).toMatchObject({
      positives: 0,
      recall: null,
      p95ActivationLatencyMs: null,
      effectiveFps: 50,
    });
  });
});
