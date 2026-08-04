import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

describe("GestureEngine 简化模式", () => {
  it("confirms and releases a left click within four 60 fps frames", () => {
    const engine = new GestureEngine();

    expect(engine.update(makeGestureHand("left"), 0).phase).toBe("candidate");
    expect(engine.update(makeGestureHand("left"), 16).lockedGesture).toBe("left");
    expect(engine.update(makeGestureHand("tracking"), 32).click).toBe(false);
    expect(engine.update(makeGestureHand("tracking"), 48)).toMatchObject({
      click: true,
      rightClick: false,
      doubleClick: false,
      scrollY: 0,
      dragStart: false,
      dragEnd: false,
    });
  });

  it("pauses tracking with an open palm on the next 60 fps frame", () => {
    const engine = new GestureEngine();

    expect(engine.update(makeGestureHand("open-palm"), 0).state).toBe("tracking");
    expect(engine.update(makeGestureHand("open-palm"), 16)).toMatchObject({
      state: "paused",
      lockedGesture: "open-palm",
    });
  });

  it("keeps a closed fist in tracking instead of open-palm stop", () => {
    const engine = new GestureEngine();

    expect(engine.update(makeGestureHand("fist"), 0).state).toBe("tracking");
    expect(engine.update(makeGestureHand("fist"), 16)).toMatchObject({
      state: "tracking",
      candidate: null,
      lockedGesture: null,
    });
  });

  it.each(["right", "double", "scroll"] as const)("does not activate %s", (gesture) => {
    const engine = new GestureEngine();

    for (let at = 0; at <= 128; at += 16) {
      const output = engine.update(makeGestureHand(gesture), at);
      expect(output.candidate).not.toBe(gesture);
      expect(output.lockedGesture).not.toBe(gesture);
      expect(output.rightClick).toBe(false);
      expect(output.doubleClick).toBe(false);
      expect(output.scrollY).toBe(0);
    }
  });

  it("does not start a drag while a left pinch is held", () => {
    const engine = new GestureEngine();

    for (let at = 0; at <= 1_000; at += 16) {
      const output = engine.update(makeGestureHand("left"), at);
      expect(output.dragStart).toBe(false);
      expect(output.state).not.toBe("dragging");
    }
  });

  it("keeps moving hands action-free for two minutes", () => {
    const engine = new GestureEngine();

    for (let at = 0; at <= 120_000; at += 16) {
      const output = engine.update(makeGestureHand("tracking", {
        translateX: 0.5 + Math.sin(at / 700) * 0.08,
        translateY: 0.5 + Math.cos(at / 900) * 0.06,
      }), at);
      expect(output.click).toBe(false);
      expect(output.rightClick).toBe(false);
      expect(output.doubleClick).toBe(false);
      expect(output.scrollY).toBe(0);
      expect(output.dragStart).toBe(false);
      expect(output.dragEnd).toBe(false);
    }
  });

  it("records privacy-safe left-click diagnostics", () => {
    const engine = new GestureEngine();
    engine.update(makeGestureHand("left"), 0);
    engine.update(makeGestureHand("left"), 16);
    engine.update(makeGestureHand("tracking"), 32);
    engine.update(makeGestureHand("tracking"), 48);

    const trace = engine.getTrace();
    expect(trace.frames.at(-1)?.events).toEqual(["click"]);
    expect(JSON.stringify(trace)).not.toContain("image");
  });
});
