import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { replayGestureTrace } from "./gestureReplay";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

describe("GestureEngine replay", () => {
  it("reproduces emitted action events from captured landmark frames", () => {
    const original = new GestureEngine();
    for (let at = 0; at <= 100; at += 20) original.update(makeGestureHand("right"), at);
    for (let at = 120; at <= 300; at += 20) original.update(makeGestureHand("tracking"), at);
    const trace = original.getTrace();

    const replay = new GestureEngine();
    const outputs = replayGestureTrace(trace, (landmarks, nowMs) => replay.update(landmarks, nowMs));
    const events = outputs.filter((output) => output.rightClick);

    expect(events).toHaveLength(1);
    expect(outputs.some((output) => output.click || output.doubleClick)).toBe(false);
  });
});
