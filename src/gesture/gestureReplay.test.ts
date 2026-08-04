import { expect, it } from "vitest";

import type { GestureTrace } from "./gestureTrace";
import { replayGestureTrace } from "./gestureReplay";

it("replays landmarks through the supplied real processor in timestamp order", () => {
  const trace: GestureTrace = {
    version: 1,
    frames: [
      {
        t: 10,
        landmarks: null,
        quality: 0,
        features: null,
        phase: "lost",
        candidate: null,
        confirmationProgress: 0,
        lockedGesture: null,
        events: [],
      },
      {
        t: 26,
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        quality: 1,
        features: {
          leftPinchRatio: 0.2,
          rightPinchRatio: 0.7,
          doublePinchRatio: 0.8,
          openPalmScore: 0,
          scrollPoseScore: 0,
          palmScale: 0.25,
        },
        phase: "candidate",
        candidate: "left",
        confirmationProgress: 0.2,
        lockedGesture: null,
        events: [],
      },
    ],
  };

  const calls: Array<[number, number]> = [];
  const outputs = replayGestureTrace(trace, (landmarks, _worldLandmarks, nowMs) => {
    calls.push([nowMs, landmarks?.length ?? 0]);
    return `${nowMs}:${landmarks?.length ?? 0}`;
  });

  expect(calls).toEqual([[10, 0], [26, 21]]);
  expect(outputs).toEqual(["10:0", "26:21"]);
});

it("rejects an out-of-order in-memory trace before processing", () => {
  const completeFrame = (t: number) => ({
    t,
    landmarks: null,
    quality: 0,
    features: null,
    phase: "lost" as const,
    candidate: null,
    confirmationProgress: 0,
    lockedGesture: null,
    events: [],
  });
  const trace: GestureTrace = {
    version: 1 as const,
    frames: [
      completeFrame(20),
      completeFrame(19),
    ],
  } satisfies GestureTrace;

  expect(() => replayGestureTrace(trace, () => null)).toThrow("monotonic");
});

it("replays matched image and world landmarks from a version 2 trace", () => {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const worldLandmarks = Array.from({ length: 21 }, () => ({ x: 0.05, y: 0.05, z: 0.01 }));
  const trace: GestureTrace = {
    version: 2,
    frames: [{
      t: 16,
      landmarks,
      worldLandmarks,
      quality: 1,
      features: {
        leftPinchRatio: 0.2,
        worldLeftPinchRatio: 0.22,
        pinchDepthReliable: true,
        rightPinchRatio: 0.7,
        doublePinchRatio: 0.8,
        openPalmScore: 0,
        scrollPoseScore: 0,
        palmScale: 0.25,
      },
      phase: "candidate",
      candidate: "left",
      confirmationProgress: 0.2,
      lockedGesture: null,
      events: [],
    }],
  };

  const calls: Array<[number, number, number]> = [];
  replayGestureTrace(trace, (image, world, nowMs) => {
    calls.push([image?.length ?? 0, world?.length ?? 0, nowMs]);
  });

  expect(calls).toEqual([[21, 21, 16]]);
});
