import { describe, expect, it } from "vitest";

import { GestureEngine } from "./gestureEngine";
import { makeGestureHand } from "./fixtures/stable-gesture-sequences";

describe("GestureEngine 简化模式", () => {
  it("confirms a stable left pinch and clicks once after release", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    expect(engine.update(left, 0, left).phase).toBe("candidate");
    expect(engine.update(left, 16, left).lockedGesture).toBeNull();
    expect(engine.update(left, 32, left).lockedGesture).toBeNull();
    expect(engine.update(left, 48, left).lockedGesture).toBe("left");
    expect(engine.update(tracking, 64, tracking).click).toBe(false);
    expect(engine.update(tracking, 80, tracking)).toMatchObject({
      click: true,
      rightClick: false,
      doubleClick: false,
      scrollY: 0,
      dragStart: false,
      dragEnd: false,
    });
  });

  it("ignores a two-frame fingertip overlap", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    engine.update(left, 0, left);
    engine.update(left, 16, left);
    engine.update(left, 32, left);
    expect(engine.update(tracking, 48, tracking).click).toBe(false);
    expect(engine.update(tracking, 64, tracking).click).toBe(false);
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

  it("rejects fingertips that overlap in the image but are separated in world depth", () => {
    const engine = new GestureEngine();
    const imageOverlap = makeGestureHand("left");
    const worldSeparated = makeGestureHand("left");
    worldSeparated[8] = { ...worldSeparated[4]!, z: 0.3 };

    expect(engine.update(imageOverlap, 0, worldSeparated).candidate).toBeNull();
    expect(engine.update(imageOverlap, 16, worldSeparated).lockedGesture).toBeNull();
    expect(engine.update(makeGestureHand("tracking"), 32, worldSeparated).click).toBe(false);
    expect(engine.update(makeGestureHand("tracking"), 48, worldSeparated).click).toBe(false);
  });

  it("does not click without world landmarks", () => {
    const engine = new GestureEngine();

    engine.update(makeGestureHand("left"), 0, null);
    engine.update(makeGestureHand("left"), 16, null);
    engine.update(makeGestureHand("tracking"), 32, null);
    expect(engine.update(makeGestureHand("tracking"), 48, null).click).toBe(false);
  });

  it("cancels a locked pinch without clicking when world depth disappears", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");

    engine.update(left, 0, left);
    engine.update(left, 16, left);
    engine.update(left, 32, left);
    expect(engine.update(left, 48, left).lockedGesture).toBe("left");
    expect(engine.update(left, 64, null).click).toBe(false);
    expect(engine.update(left, 80, null)).toMatchObject({
      click: false,
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
    const left = makeGestureHand("left");

    for (let at = 0; at <= 1_000; at += 16) {
      const output = engine.update(left, at, left);
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
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");
    engine.update(left, 0, left);
    engine.update(left, 16, left);
    engine.update(left, 32, left);
    engine.update(left, 48, left);
    engine.update(tracking, 64, tracking);
    engine.update(tracking, 80, tracking);

    const trace = engine.getTrace();
    expect(trace.frames.at(-1)?.events).toEqual(["click"]);
    expect(JSON.stringify(trace)).not.toContain("image");
  });
});
