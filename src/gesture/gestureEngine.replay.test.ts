import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { replayGestureTrace } from "./gestureReplay";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { benchmarkPinchTrace, type PinchBenchmarkLabel } from "./pinchBenchmark";
import type { Landmark } from "./types";

describe("GestureEngine replay", () => {
  it("reproduces emitted left-click events from captured landmark frames", () => {
    const original = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");
    original.update(left, 0, left);
    original.update(left, 16, left);
    original.update(left, 32, left);
    original.update(left, 48, left);
    original.update(tracking, 64, tracking);
    original.update(tracking, 80, tracking);
    const trace = original.getTrace();

    const replay = new GestureEngine();
    const outputs = replayGestureTrace(
      trace,
      (landmarks, worldLandmarks, nowMs) => replay.update(landmarks, nowMs, worldLandmarks),
    );
    const events = outputs.filter((output) => output.click);

    expect(events).toHaveLength(1);
    expect(outputs.some((output) => output.rightClick || output.doubleClick || output.scrollY !== 0)).toBe(false);
  });
});

type ReplayFrame = {
  t: number;
  image: Landmark[];
  world: Landmark[] | null;
  label: PinchBenchmarkLabel;
};

const runSequence = (frames: ReplayFrame[]) => {
  const source = new GestureEngine();
  frames.forEach((frame) => source.update(frame.image, frame.t, frame.world));
  const trace = source.getTrace();
  const replay = new GestureEngine();
  const outputs = replayGestureTrace(
    trace,
    (landmarks, worldLandmarks, nowMs) => replay.update(landmarks, nowMs, worldLandmarks),
  );
  const labels = new Map(frames.map((frame) => [frame.t, frame.label]));
  return { outputs, metrics: benchmarkPinchTrace(trace, labels) };
};

const genuinePinch = (options: { scale?: number; rotation?: number } = {}): ReplayFrame[] => {
  const tracking = makeGestureHand("tracking", options);
  const left = makeGestureHand("left", options);
  return [
    { t: 0, image: tracking, world: tracking, label: "separate" },
    { t: 16, image: left, world: left, label: "contact" },
    { t: 32, image: left, world: left, label: "contact" },
    { t: 48, image: tracking, world: tracking, label: "separate" },
    { t: 64, image: tracking, world: tracking, label: "separate" },
  ];
};

describe("adaptive pinch replay matrix", () => {
  it.each([
    ["正面", { scale: 0.3, rotation: 0 }],
    ["斜向", { scale: 0.42, rotation: Math.PI / 3 }],
    ["远距离", { scale: 0.18, rotation: -Math.PI / 5 }],
  ] as const)("recognizes one %s genuine pinch", (_name, options) => {
    const { outputs, metrics } = runSequence(genuinePinch(options));

    expect(outputs.filter((output) => output.click)).toHaveLength(1);
    expect(metrics).toMatchObject({
      positives: 1,
      truePositives: 1,
      falsePositives: 0,
      duplicateClicks: 0,
      recall: 1,
    });
    expect(metrics.p95ActivationLatencyMs).toBeLessThanOrEqual(32);
  });

  it("tolerates one noisy world-distance frame", () => {
    const frames = genuinePinch();
    const noisyWorld = makeGestureHand("left");
    noisyWorld[8] = { ...noisyWorld[4]!, z: 0.3 };
    frames.splice(2, 0, {
      t: 24,
      image: makeGestureHand("left"),
      world: noisyWorld,
      label: "contact",
    });

    expect(runSequence(frames).outputs.filter((output) => output.click)).toHaveLength(1);
  });

  it("uses the strict fallback when world landmarks disappear", () => {
    const tracking = makeGestureHand("tracking");
    const left = makeGestureHand("left");
    const frames: ReplayFrame[] = [
      { t: 0, image: tracking, world: null, label: "separate" },
      { t: 16, image: left, world: null, label: "contact" },
      { t: 32, image: left, world: null, label: "contact" },
      { t: 48, image: left, world: null, label: "contact" },
      { t: 64, image: tracking, world: null, label: "separate" },
      { t: 80, image: tracking, world: null, label: "separate" },
    ];

    expect(runSequence(frames).outputs.filter((output) => output.click)).toHaveLength(1);
  });

  it("never clicks for reliable depth separation, fist, or open palm", () => {
    const imageOverlap = makeGestureHand("left");
    const worldSeparated = makeGestureHand("left");
    worldSeparated[8] = { ...worldSeparated[4]!, z: 0.3 };
    const gestures = [
      { image: imageOverlap, world: worldSeparated },
      { image: makeGestureHand("fist"), world: makeGestureHand("fist") },
      { image: makeGestureHand("open-palm"), world: makeGestureHand("open-palm") },
    ];

    for (const gesture of gestures) {
      const frames = Array.from({ length: 8 }, (_, index): ReplayFrame => ({
        t: index * 16,
        image: gesture.image,
        world: gesture.world,
        label: "separate",
      }));
      expect(runSequence(frames).outputs.some((output) => output.click)).toBe(false);
    }
  });
});
