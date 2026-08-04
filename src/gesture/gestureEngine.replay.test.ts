import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { replayGestureTrace } from "./gestureReplay";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

describe("GestureEngine replay", () => {
  it("reproduces emitted left-click events from captured landmark frames", () => {
    const original = new GestureEngine();
    original.update(makeGestureHand("left"), 0);
    original.update(makeGestureHand("left"), 16);
    original.update(makeGestureHand("tracking"), 32);
    original.update(makeGestureHand("tracking"), 48);
    const trace = original.getTrace();

    const replay = new GestureEngine();
    const outputs = replayGestureTrace(trace, (landmarks, nowMs) => replay.update(landmarks, nowMs));
    const events = outputs.filter((output) => output.click);

    expect(events).toHaveLength(1);
    expect(outputs.some((output) => output.rightClick || output.doubleClick || output.scrollY !== 0)).toBe(false);
  });
});
