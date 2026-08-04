import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { replayGestureTrace } from "./gestureReplay";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

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
